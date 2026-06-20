import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL dan ANON KEY belum diisi di .env.local')
}

/**
 * Supabase client khusus untuk halaman mahasiswa (ujian, selesai, dsb).
 *
 * Berbeda dari client biasa di '@/lib/supabase' (dipakai admin via
 * Supabase Auth), client ini menyertakan header 'x-sesi-token' di
 * setiap request. Header ini dibaca oleh RLS policy di tabel
 * sesi_ujian dan jawaban untuk memastikan mahasiswa hanya bisa
 * mengakses baris yang token_sesi-nya sesuai dengan sesi ujian
 * miliknya sendiri — bukan milik mahasiswa lain.
 *
 * PENTING: panggil createClientMahasiswa(token) SETELAH token sesi
 * didapat (biasanya dari sessionStorage). Jangan gunakan instance
 * client tanpa token untuk operasi yang menyentuh sesi_ujian/jawaban,
 * karena RLS akan menolak (token kosong tidak akan cocok dengan
 * token_sesi manapun).
 */
export function createClientMahasiswa(sesiToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        'x-sesi-token': sesiToken,
      },
    },
  })
}