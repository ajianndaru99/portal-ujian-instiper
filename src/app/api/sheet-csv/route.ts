import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Proxy untuk mengambil data Google Sheets sebagai CSV.
 * Menghindari masalah CORS karena fetch dilakukan dari server (bukan browser).
 *
 * Menerima berbagai format link Google Sheets:
 * - https://docs.google.com/spreadsheets/d/{ID}/edit#gid={GID}
 * - https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
 * - https://docs.google.com/spreadsheets/d/{ID}/pub?output=csv
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sheetUrl = searchParams.get('url')

  if (!sheetUrl) {
    return NextResponse.json({ error: 'Parameter url diperlukan.' }, { status: 400 })
  }

  let target: string

  try {
    const u = new URL(sheetUrl)

    if (u.hostname !== 'docs.google.com') {
      return NextResponse.json({ error: 'Link harus berasal dari docs.google.com (Google Sheets).' }, { status: 400 })
    }

    // Jika sudah berupa link CSV langsung (publish to web)
    if (u.searchParams.get('output') === 'csv' || u.searchParams.get('format') === 'csv') {
      target = u.toString()
    } else {
      const match = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
      if (!match) {
        return NextResponse.json({ error: 'Format link Google Sheets tidak dikenali.' }, { status: 400 })
      }
      const sheetId = match[1]

      // Cari gid dari query atau hash
      let gid = u.searchParams.get('gid')
      if (!gid && u.hash) {
        const gidMatch = u.hash.match(/gid=([0-9]+)/)
        if (gidMatch) gid = gidMatch[1]
      }

      target = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ''}`
    }
  } catch {
    return NextResponse.json({ error: 'Link Google Sheets tidak valid.' }, { status: 400 })
  }

  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalUjianBot/1.0)' },
      redirect: 'follow',
    })

    if (!res.ok) {
      return NextResponse.json({
        error: `Gagal mengambil data (HTTP ${res.status}). Pastikan sheet dibagikan dengan akses "Siapa saja yang memiliki link" sebagai Viewer.`
      }, { status: 502 })
    }

    const text = await res.text()

    // Jika hasil berupa HTML, berarti akses ditolak / butuh login
    const trimmed = text.trim()
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
      return NextResponse.json({
        error: 'Sheet tidak dapat diakses publik. Buka Google Sheets → Share → ubah ke "Siapa saja yang memiliki link" (Viewer), lalu coba lagi.'
      }, { status: 403 })
    }

    if (!trimmed) {
      return NextResponse.json({ error: 'Sheet kosong atau tidak ada data.' }, { status: 404 })
    }

    return NextResponse.json({ csv: text })
  } catch (err) {
    console.error('sheet-csv error:', err)
    return NextResponse.json({ error: 'Gagal terhubung ke Google Sheets. Coba lagi nanti.' }, { status: 500 })
  }
}
