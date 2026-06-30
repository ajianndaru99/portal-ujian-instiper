import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// Server-side Question Cache
// ============================================================
// Instead of 300 students each querying Supabase for questions,
// this API route fetches once and caches the result in memory
// with a 60-second TTL. All students hit this endpoint instead.
// Effect: 300 DB connections → 1 DB connection for questions.
// ============================================================

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

interface CacheEntry {
  data: any[]
  timestamp: number
}

const CACHE_TTL_MS = 60_000 // 60 seconds
const soalCache = new Map<string, CacheEntry>()

function getCached(ujianId: string): any[] | null {
  const entry = soalCache.get(ujianId)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    soalCache.delete(ujianId)
    return null
  }
  return entry.data
}

function setCache(ujianId: string, data: any[]) {
  soalCache.set(ujianId, { data, timestamp: Date.now() })
}

export async function GET(request: NextRequest) {
  const ujianId = request.nextUrl.searchParams.get('ujian_id')

  if (!ujianId) {
    return NextResponse.json({ error: 'ujian_id is required' }, { status: 400 })
  }

  // Check cache first
  const cached = getCached(ujianId)
  if (cached) {
    return NextResponse.json({ data: cached, cached: true })
  }

  // Cache miss — fetch from Supabase (only happens once per 60s)
  const { data: soalDB, error } = await supabaseAdmin
    .from('soal')
    .select('id, ujian_id, nomor_urut, pertanyaan, tipe, opsi_jawaban, bobot_nilai')
    .eq('ujian_id', ujianId)
    .order('nomor_urut')

  if (error) {
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

  // Store in cache
  setCache(ujianId, normalized)

  return NextResponse.json({ data: normalized, cached: false })
}
