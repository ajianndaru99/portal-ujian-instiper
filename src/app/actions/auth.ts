'use server'

import { createClient } from '@supabase/supabase-js'

// Client khusus admin yang kebal RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function prosesLoginUjian(nim: string, kodeUjian: string) {
  try {
    // 1. Cari ujian berdasarkan kode
    const { data: ujian, error: errUjian } = await supabaseAdmin
      .from('ujian')
      .select(`
        *,
        mata_kuliah (
          id, kode_matkul, nama_matkul, sks,
          dosen ( id, kode_dosen, nama )
        )
      `)
      .eq('kode_ujian', kodeUjian.toUpperCase().trim())
      .eq('status', 'aktif')
      .maybeSingle()

    if (errUjian || !ujian) {
      return { success: false, error: 'Kode ujian tidak ditemukan atau ujian belum aktif.' }
    }

    // 2. Cari mahasiswa
    const { data: mahasiswa, error: errMhs } = await supabaseAdmin
      .from('mahasiswa')
      .select('*')
      .eq('nim', nim.trim())
      .eq('is_active', true)
      .maybeSingle()

    if (errMhs || !mahasiswa) {
      return { success: false, error: 'NIM tidak ditemukan atau akun tidak aktif.' }
    }

    // 3. Cek apakah mahasiswa terdaftar (prodi/minat match)
    const minatMatch = ujian.minat_target.length === 0 || ujian.minat_target.includes(mahasiswa.minat)
    if (ujian.prodi_target !== mahasiswa.prodi || !minatMatch) {
      return { success: false, error: 'Kamu tidak terdaftar untuk ujian ini.' }
    }

    // 4. Ambil atau buat sesi ujian
    let { data: sesi, error: errSesi } = await supabaseAdmin
      .from('sesi_ujian')
      .select('*')
      .eq('ujian_id', ujian.id)
      .eq('nim', mahasiswa.nim)
      .maybeSingle()

    if (!sesi) {
      // Belum ada sesi, buat baru
      const { data: sesiBaru, error: errBuat } = await supabaseAdmin
        .from('sesi_ujian')
        .insert({
          ujian_id: ujian.id,
          nim: mahasiswa.nim,
          status: 'belum_mulai',
        })
        .select()
        .single()

      if (errBuat || !sesiBaru) {
        return { success: false, error: 'Gagal membuat sesi ujian. Coba lagi.' }
      }
      sesi = sesiBaru
    }

    // 5. Cek apakah sudah selesai
    if (['selesai', 'auto_submit', 'paksa_submit'].includes(sesi.status)) {
      return { success: false, error: 'Ujian kamu sudah dikumpulkan sebelumnya.' }
    }

    // Jika semua lolos, kembalikan data untuk disimpan di Client
    return { 
      success: true, 
      data: { ujian, mahasiswa, sesi } 
    }

  } catch (err: any) {
    console.error('Error Auth Server:', err)
    return { success: false, error: 'Terjadi kesalahan sistem. Coba beberapa saat lagi.' }
  }
}