import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Mengambil struktur Google Form (pertanyaan + pilihan jawaban).
 * Memiliki dua mode:
 * 1. Tanpa token (Scraping publik): Hanya bisa mengambil soal dan opsi (kunci jawaban disembunyikan Google).
 * 2. Dengan token (Google Forms API): Bisa mengambil soal, opsi, dan kunci jawaban secara otomatis.
 */

interface ParsedQuestion {
  title: string
  type: 'pg' | 'esai' | 'lainnya'
  options: string[]
  kunci?: string
  bobot?: number
}

function extractFormId(url: string): string | null {
  const match = url.match(/\/forms\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

function buildViewformUrl(formId: string, isPublished: boolean): string {
  return isPublished
    ? `https://docs.google.com/forms/d/e/${formId}/viewform`
    : `https://docs.google.com/forms/d/${formId}/viewform`
}

// Mode 1: Scraping HTML Publik (Tanpa Kunci Jawaban)
function parseFormStructurePublic(html: string): { title: string; questions: ParsedQuestion[] } | null {
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

    if (![0, 1, 2, 3, 4].includes(fieldType)) continue
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

// Mode 2: Google Forms API Resmi (Dengan Kunci Jawaban)
async function fetchFormFromAPI(formId: string, accessToken: string): Promise<{ title: string; questions: ParsedQuestion[] }> {
  const res = await fetch(`https://forms.googleapis.com/v1/forms/${formId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `Google API Error: ${res.status}`)
  }

  const data = await res.json()
  const title = data.info?.title || 'Google Form'
  const questions: ParsedQuestion[] = []

  for (const item of data.items || []) {
    if (!item.questionItem) continue
    
    const questionTitle = item.title || ''
    const qObj = item.questionItem.question
    
    let type: ParsedQuestion['type'] = 'lainnya'
    let options: string[] = []
    let kunci = ''
    let bobot = qObj.grading?.pointValue || 10

    if (qObj.textQuestion) {
      type = 'esai'
    } else if (qObj.choiceQuestion) {
      type = 'pg'
      const qOptions = qObj.choiceQuestion.options || []
      options = qOptions.map((o: any) => o.value).filter(Boolean)
      
      // Deteksi kunci jawaban
      const correctAnswers = qObj.grading?.correctAnswers?.answers || []
      if (correctAnswers.length > 0) {
        const correctValue = correctAnswers[0].value
        const idx = options.findIndex(o => o === correctValue)
        if (idx !== -1) {
          kunci = String.fromCharCode(65 + idx) // 0 -> A, 1 -> B, dst
        }
      }
    }

    if (type !== 'lainnya') {
      questions.push({ title: questionTitle, type, options, kunci, bobot })
    }
  }

  return { title, questions }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const formUrl = searchParams.get('url')
  const accessToken = request.headers.get('Authorization')?.replace('Bearer ', '') || searchParams.get('access_token')

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

  try {
    // Jika ada token, gunakan API Resmi agar dapat kunci jawaban
    if (accessToken) {
      const parsed = await fetchFormFromAPI(formId, accessToken)
      return NextResponse.json({
        title: parsed.title,
        questions: parsed.questions,
        warning: '',
        fromApi: true
      })
    }

    // Fallback: Scraping HTML publik (Kunci jawaban manual)
    const isPublished = u.pathname.includes('/d/e/')
    const targetUrl = buildViewformUrl(formId, isPublished)

    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalUjianBot/1.0)' },
      redirect: 'follow',
    })

    if (!res.ok) {
      return NextResponse.json({
        error: `Gagal mengambil form publik (HTTP ${res.status}). Pastikan link form dapat diakses publik, ATAU hubungkan Akun Google Anda terlebih dahulu.`
      }, { status: 502 })
    }

    const html = await res.text()
    const parsed = parseFormStructurePublic(html)

    if (!parsed || parsed.questions.length === 0) {
      return NextResponse.json({
        error: 'Tidak dapat membaca struktur form secara publik. Silakan Hubungkan Akun Google Anda di atas agar sistem bisa membaca form ini via API.'
      }, { status: 404 })
    }

    return NextResponse.json({
      title: parsed.title,
      questions: parsed.questions,
      warning: 'Kunci jawaban tidak dapat diambil otomatis karena menggunakan mode publik anonim. Hubungkan Akun Google Anda untuk auto-deteksi kunci.',
      fromApi: false
    })
  } catch (err: any) {
    console.error('google-form-structure error:', err)
    return NextResponse.json({ error: err.message || 'Gagal terhubung ke Google Form. Coba lagi nanti.' }, { status: 500 })
  }
}
