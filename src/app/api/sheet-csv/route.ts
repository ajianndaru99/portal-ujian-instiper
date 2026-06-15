import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/sheet-csv?url=<google_sheets_url>
 *
 * Mengambil data Google Sheets sebagai CSV dari sisi server
 * untuk menghindari masalah CORS di browser.
 *
 * Mendukung format URL:
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/edit#gid=...
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/pub?...
 * - https://docs.google.com/spreadsheets/d/SHEET_ID/...
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawUrl = searchParams.get('url')

  if (!rawUrl) {
    return NextResponse.json({ error: 'Parameter "url" wajib diisi.' }, { status: 400 })
  }

  // Ekstrak Spreadsheet ID dan gid (sheet tab) dari URL
  const idMatch = rawUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (!idMatch) {
    return NextResponse.json(
      { error: 'URL tidak valid. Pastikan menggunakan link Google Sheets.' },
      { status: 400 }
    )
  }

  const sheetId = idMatch[1]

  // Coba ambil gid (tab tertentu), default ke 0 (sheet pertama)
  const gidMatch = rawUrl.match(/[#&?]gid=(\d+)/)
  const gid = gidMatch ? gidMatch[1] : '0'

  // URL export CSV Google Sheets
  const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`

  try {
    const response = await fetch(csvUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PortalUjian/1.0)',
      },
      // Ikuti redirect (Google Sheets sering redirect ke URL login jika tidak public)
      redirect: 'follow',
    })

    if (!response.ok) {
      if (response.status === 401 || response.url.includes('accounts.google.com')) {
        return NextResponse.json(
          {
            error:
              'Sheet tidak dapat diakses. Pastikan akses sheet diatur ke "Siapa saja yang memiliki link" (Viewer).',
          },
          { status: 403 }
        )
      }
      return NextResponse.json(
        { error: `Gagal mengambil data dari Google Sheets (HTTP ${response.status}).` },
        { status: response.status }
      )
    }

    // Cek apakah redirect ke halaman login Google
    const finalUrl = response.url
    if (finalUrl.includes('accounts.google.com') || finalUrl.includes('ServiceLogin')) {
      return NextResponse.json(
        {
          error:
            'Sheet memerlukan login. Ubah akses sheet ke "Siapa saja yang memiliki link" (Viewer) terlebih dahulu.',
        },
        { status: 403 }
      )
    }

    const csv = await response.text()

    // Validasi minimal — pastikan bukan halaman HTML error
    if (csv.trim().startsWith('<!DOCTYPE') || csv.trim().startsWith('<html')) {
      return NextResponse.json(
        {
          error:
            'Google Sheets mengembalikan halaman HTML, bukan CSV. Pastikan sheet bersifat publik dan URL-nya benar.',
        },
        { status: 422 }
      )
    }

    return NextResponse.json({ csv })
  } catch (err: any) {
    console.error('[sheet-csv] fetch error:', err)
    return NextResponse.json(
      { error: 'Terjadi kesalahan jaringan saat mengambil data dari Google Sheets.' },
      { status: 500 }
    )
  }
}
