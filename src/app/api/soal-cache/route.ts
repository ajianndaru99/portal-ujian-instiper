import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// API Route: Ambil soal ujian langsung dari Supabase
// Caching ditangani oleh Vercel Edge CDN via header Cache-Control
// — tidak perlu Upstash Redis, tidak ada dependency pihak ketiga.
// ============================================================

export async function GET(request: NextRequest) {
  const ujianId = request.nextUrl.searchParams.get('ujian_id')
  if (!ujianId) {
    return NextResponse.json({ error: 'ujian_id required' }, { status: 400 })
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )

  const { data: soalDB, error } = await supabaseAdmin
    .from('soal')
    .select('id, ujian_id, nomor_urut, pertanyaan, tipe, opsi_jawaban, bobot_nilai')
    .eq('ujian_id', ujianId)
    .order('nomor_urut')

  if (error) {
    console.error('Gagal mengambil soal dari Supabase:', error)
    return NextResponse.json({ error: 'Gagal memuat soal' }, { status: 500 })
  }

  // Normalize opsi_jawaban
  const normalized = (soalDB || []).map((s: any) => ({
    ...s,
    opsi_jawaban: Array.isArray(s.opsi_jawaban)
      ? s.opsi_jawaban
      : (typeof s.opsi_jawaban === 'string'
        ? (() => { try { return JSON.parse(s.opsi_jawaban) } catch { return null } })()
        : s.opsi_jawaban),
  }))

  // Vercel Edge CDN akan menyimpan response ini selama 5 menit (s-maxage=300)
  // sehingga 300 mahasiswa yang memuat soal bersamaan hanya memicu 1 query ke DB.
  return NextResponse.json({ data: normalized, cached: false }, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    }
  })
}
