import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// Server-side Question Cache (Upstash Redis)
// ============================================================

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

const CACHE_TTL_SECONDS = 300 // 5 minutes

export async function GET(request: NextRequest) {
  const ujianId = request.nextUrl.searchParams.get('ujian_id')
  if (!ujianId) return NextResponse.json({ error: 'ujian_id required' }, { status: 400 })

  const cacheKey = `soal:${ujianId}`

  try {
    // 1. Cek Redis
    const cached = await redis.get(cacheKey)
    if (cached) {
      return NextResponse.json({ data: cached, cached: true }, {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' }
      })
    }
  } catch (err) {
    console.error('Redis cache error:', err)
    // Lanjut ke DB jika Redis error (fallback)
  }

  // 2. Cache miss → ambil dari Supabase
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: soalDB, error } = await supabaseAdmin
    .from('soal')
    .select('id, ujian_id, nomor_urut, pertanyaan, tipe, opsi_jawaban, bobot_nilai')
    .eq('ujian_id', ujianId)
    .order('nomor_urut')

  if (error) return NextResponse.json({ error: 'Gagal memuat soal' }, { status: 500 })

  // Normalize opsi_jawaban
  const normalized = (soalDB || []).map((s: any) => ({
    ...s,
    opsi_jawaban: Array.isArray(s.opsi_jawaban)
      ? s.opsi_jawaban
      : (typeof s.opsi_jawaban === 'string'
        ? (() => { try { return JSON.parse(s.opsi_jawaban) } catch { return null } })()
        : s.opsi_jawaban),
  }))

  try {
    // 3. Simpan ke Redis dengan TTL 5 menit
    await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(normalized))
  } catch (err) {
    console.error('Redis cache set error:', err)
  }

  return NextResponse.json({ data: normalized, cached: false }, {
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' }
  })
}
