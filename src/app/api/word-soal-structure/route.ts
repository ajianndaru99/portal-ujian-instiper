import { NextResponse } from 'next/server'
import JSZip from 'jszip'

export const dynamic = 'force-dynamic'

/**
 * Mengekstrak soal (PG & esai) dari file Word (.docx) yang mengikuti
 * format template resmi sistem: pertanyaan ditulis sebagai list level 0
 * (bold), opsi jawaban PG sebagai list level 1 di bawahnya (tidak bold).
 *
 * Soal tanpa anak level 1 dianggap esai. Section header ("Soal Pilihan
 * Ganda", "Soal Esai", atau variasi kalimat lain) tidak berpengaruh ke
 * parsing karena tipe soal ditentukan murni dari struktur numbering,
 * bukan dari teks header — sehingga dosen bebas menulis judul section
 * apa saja.
 *
 * KETERBATASAN: hanya mengenali paragraf yang memakai numbering list
 * otomatis Word (klik tombol Numbering, bukan mengetik "1." manual).
 * Jika dokumen tidak memakai numbering sama sekali, parsing akan
 * menghasilkan 0 soal dan endpoint ini mengembalikan error yang jelas
 * agar admin tahu harus memakai template resmi atau input manual.
 */

interface ParsedSoal {
  pertanyaan: string
  tipe: 'pg' | 'esai'
  opsi: string[]
}

interface RawParagraph {
  text: string
  ilvl: number | null
}

function extractParagraphs(xml: string): RawParagraph[] {
  const paraBlocks = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || []
  const paragraphs: RawParagraph[] = []

  for (const block of paraBlocks) {
    const textMatches = Array.from(block.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g))
    const text = textMatches.map(m => m[1]).join('').trim()
    if (!text) continue

    const ilvlMatch = block.match(/<w:numPr>[\s\S]*?<w:ilvl w:val="(\d+)"\/>[\s\S]*?<\/w:numPr>/)
    const ilvl = ilvlMatch ? parseInt(ilvlMatch[1], 10) : null

    paragraphs.push({ text, ilvl })
  }

  return paragraphs
}

function parseSoalFromParagraphs(paragraphs: RawParagraph[]): ParsedSoal[] {
  const hasil: ParsedSoal[] = []
  let current: ParsedSoal | null = null

  for (const p of paragraphs) {
    if (p.ilvl === 0) {
      if (current) hasil.push(current)
      current = { pertanyaan: p.text, tipe: 'esai', opsi: [] }
    } else if (p.ilvl === 1 && current) {
      // Buang prefix "A. "/"B. " dst jika ada, supaya konsisten dengan
      // cara form manual menyimpan opsi (prefix ditambahkan ulang saat insert)
      const cleaned = p.text.replace(/^[A-Za-z]\.\s*/, '').trim()
      current.opsi.push(cleaned || p.text)
      current.tipe = 'pg'
    }
    // Paragraf tanpa ilvl (section header, instruksi, dll) diabaikan
  }
  if (current) hasil.push(current)

  return hasil
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'File Word (.docx) diperlukan.' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'File harus berformat .docx (Word).' }, { status: 400 })
    }

    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)
    const documentXmlFile = zip.file('word/document.xml')

    if (!documentXmlFile) {
      return NextResponse.json({
        error: 'File tidak terbaca sebagai dokumen Word yang valid. Pastikan file tidak rusak dan benar-benar berformat .docx.',
      }, { status: 400 })
    }

    const xml = await documentXmlFile.async('string')
    const paragraphs = extractParagraphs(xml)
    const soalList = parseSoalFromParagraphs(paragraphs)

    if (soalList.length === 0) {
      return NextResponse.json({
        error: 'Tidak ada soal yang terdeteksi. Dokumen ini kemungkinan tidak menggunakan format numbering otomatis Word (List) yang dikenali sistem. Gunakan template resmi yang bisa diunduh di halaman ini, atau input soal secara manual.',
      }, { status: 422 })
    }

    const totalPg = soalList.filter(s => s.tipe === 'pg').length
    const totalEsai = soalList.filter(s => s.tipe === 'esai').length

    return NextResponse.json({
      questions: soalList,
      summary: { total: soalList.length, pg: totalPg, esai: totalEsai },
      warning: totalPg > 0
        ? 'Kunci jawaban untuk soal pilihan ganda tidak dapat dibaca otomatis dari file Word. Pilih kunci jawaban secara manual untuk tiap soal PG sebelum mengimpor.'
        : undefined,
    })
  } catch (err) {
    console.error('word-soal-structure error:', err)
    return NextResponse.json({
      error: 'Gagal memproses file Word. Pastikan file tidak rusak, lalu coba lagi.',
    }, { status: 500 })
  }
}
