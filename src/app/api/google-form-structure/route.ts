import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Mengambil struktur Google Form (pertanyaan + pilihan jawaban) langsung
 * dari halaman publik /viewform, tanpa memerlukan Google API key.
 *
 * Google merender data form ke dalam variabel JS bernama `FB_PUBLIC_LOAD_DATA_`
 * yang disisipkan dalam tag <script> di halaman HTML. Kita ekstrak JSON
 * tersebut lalu parsing strukturnya.
 *
 * KETERBATASAN: Kunci jawaban untuk soal bertipe quiz (multiple choice grading)
 * TIDAK disertakan dalam data publik ini, karena Google menyembunyikannya
 * demi mencegah kebocoran jawaban kuis. Kunci jawaban harus dipilih manual
 * oleh admin setelah soal berhasil diimpor.
 */

interface ParsedQuestion {
  title: string
  type: 'pg' | 'esai' | 'lainnya'
  options: string[]
}

function extractFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

function buildViewformUrl(formId: string, isPublished: boolean): string {
  // Format /d/e/{id}/ adalah link form yang sudah dipublikasikan (anonymous-friendly)
  // Format /d/{id}/ adalah link milik pemilik form (perlu login, biasanya redirect)
  return isPublished
    ? `https://docs.google.com/forms/d/e/${formId}/viewform`
    : `https://docs.google.com/forms/d/${formId}/viewform`
}

function parseFormStructure(html: string): { title: string; questions: ParsedQuestion[] } | null {
  const match = html.match(/var FB_PUBLIC_LOAD_DATA_ = (\[[\s\S]*?\]);/) || html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[[\s\S]*?\]);/)
  if (!match) return null

  let data: any
  try {
    data = JSON.parse(match[1])
  } catch {
    return null
  }

  const title: string = data?.[1]?.[8] || data?.[3] || 'Google Form'
  const fieldList: any[] = data?.[1]?.[1] || []

  const questions: ParsedQuestion[] = []

  for (const field of fieldList) {
    const questionTitle: string = field?.[1] || ''
    const fieldType: number = field?.[3]

    // Tipe field Google Form:
    // 0=short answer, 1=paragraph, 2=multiple choice (radio), 3=dropdown,
    // 4=checkbox, 5=linear scale, 7=grid, 9=date, etc.
    if (![0, 1, 2, 3, 4].includes(fieldType)) continue // skip tipe yang tidak relevan (section header, image, dll)
    if (!questionTitle.trim()) continue

    let type: ParsedQuestion['type'] = 'lainnya'
    let options: string[] = []

    if (fieldType === 0 || fieldType === 1) {
      type = 'esai'
    } else if (fieldType === 2 || fieldType === 3 || fieldType === 4) {
      type = 'pg'
      const optionGroup = field?.[4]?.[0]?.[1] || []
      options = optionGroup.map((opt: any) => opt?.[0]).filter((o: any) => typeof o === 'string' && o.trim())
    }

    questions.push({ title: questionTitle.trim(), type, options })
  }

  return { title, questions }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const formUrl = searchParams.get('url')

  if (!formUrl) {
    return NextResponse.json({ error: 'Parameter url diperlukan.' }, { status: 400 })
  }

  let u: URL
  try {
    u = new URL(formUrl)
  } catch {
    return NextResponse.json({ error: 'Link Google Form tidak valid.' }, { status: 400 })
  }

  if (u.hostname !== 'docs.google.com') {
    return NextResponse.json({ error: 'Link harus berasal dari docs.google.com (Google Form).' }, { status: 400 })
  }

  const formId = extractFormId(u.pathname)
  if (!formId) {
    return NextResponse.json({ error: 'Tidak dapat menemukan ID form dari link tersebut.' }, { status: 400 })
  }

  const isPublished = u.pathname.includes('/d/e/')
  const targetUrl = buildViewformUrl(formId, isPublished)

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalUjianBot/1.0)' },
      redirect: 'follow',
    })

    if (!res.ok) {
      return NextResponse.json({
        error: `Gagal mengambil form (HTTP ${res.status}). Pastikan link form dapat diakses publik (Send → Link icon, bukan link editor).`
      }, { status: 502 })
    }

    const html = await res.text()
    const parsed = parseFormStructure(html)

    if (!parsed || parsed.questions.length === 0) {
      return NextResponse.json({
        error: 'Tidak dapat membaca struktur form. Pastikan link yang digunakan adalah link "Send" / viewform (bukan link editor /edit), dan form dapat diakses tanpa login.'
      }, { status: 404 })
    }

    return NextResponse.json({
      title: parsed.title,
      questions: parsed.questions,
      warning: 'Kunci jawaban tidak dapat diambil otomatis untuk soal pilihan ganda. Pilih kunci jawaban secara manual setelah import.',
    })
  } catch (err) {
    console.error('google-form-structure error:', err)
    return NextResponse.json({ error: 'Gagal terhubung ke Google Form. Coba lagi nanti.' }, { status: 500 })
  }
}
