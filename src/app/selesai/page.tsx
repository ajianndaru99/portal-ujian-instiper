'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientMahasiswa } from '@/lib/supabase-mahasiswa'
import { hapusSesiLokal, nilaiKeHuruf } from '@/lib/utils'

interface HasilUjian {
  nama: string
  nim: string
  judul_ujian: string
  nama_matkul: string
  status: string
  waktu_mulai: string
  waktu_selesai: string
  durasi_menit: number
  jumlah_pelanggaran: number
  nilai_pg: number | null
  ada_esai: boolean
}

function formatWaktu(iso: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

function hitungDurasi(mulai: string, selesai: string): string {
  if (!mulai || !selesai) return '-'
  const ms = new Date(selesai).getTime() - new Date(mulai).getTime()
  if (ms <= 0) return '-'   // ← tambah ini, hindari durasi negatif
  const totalMenit = Math.floor(ms / 60000)
  const jam = Math.floor(totalMenit / 60)
  const menit = totalMenit % 60
  if (jam > 0) return `${jam} jam ${menit} menit`
  return `${menit} menit`
}

export default function SelesaiPage() {
  const router = useRouter()
  const [hasil, setHasil] = useState<HasilUjian | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Token diambil SEBELUM sessionStorage.clear() di bawah, karena
    // setelah di-clear token tidak akan bisa diambil lagi. Token ini
    // wajib disertakan sebagai header pada Supabase client agar lolos
    // RLS policy "... dengan token valid" di tabel sesi_ujian.
    const token = sessionStorage.getItem('sesi_token')
    loadHasil(token)
    hapusSesiLokal()
    sessionStorage.clear()
  }, [])

  async function loadHasil(token: string | null) {
  if (!token) { setLoading(false); return }
  try {
    const supabase = createClientMahasiswa(token)

    const { data: sesi, error } = await supabase
      .from('sesi_ujian')
      .select(`
        *,
        mahasiswa ( nim, nama ),
        ujian (
          judul,
          mata_kuliah:matkul_id ( nama_matkul ),
          soal ( tipe )
        )
      `)
      .eq('token_sesi', token)
      .single()

    // Debug sementara - hapus setelah fix
    console.log('STRUKTUR SESI:', JSON.stringify(sesi, null, 2))
    console.log('ERROR:', error)
    console.log('waktu_mulai:', sesi.waktu_mulai)
    console.log('waktu_selesai:', sesi.waktu_selesai)

    if (!sesi) { setLoading(false); return }

    const adaEsai = (sesi.ujian?.soal || []).some((s: any) => s.tipe === 'esai')

    setHasil({
      nama: sesi.mahasiswa?.nama || '',
      nim: sesi.mahasiswa?.nim || '',
      judul_ujian: sesi.ujian?.judul || '',
      nama_matkul: sesi.ujian?.mata_kuliah?.nama_matkul || '',
      status: sesi.status,
      waktu_mulai: sesi.waktu_mulai || '',
      waktu_selesai: sesi.waktu_selesai || '',  // ← hapus fallback new Date()
      durasi_menit: 0,
      jumlah_pelanggaran: sesi.jumlah_pelanggaran,
      nilai_pg: sesi.nilai_pg,
      ada_esai: adaEsai,
    })
  } catch (err) {
    console.error(err)
  } finally {
    setLoading(false)
  }
}

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isAutoSubmit = hasil?.status === 'auto_submit'

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4 animate-slide-up">

        {/* Status */}
        <div className="text-center">
          {isAutoSubmit ? (
            <>
              <div className="text-6xl mb-3">🔒</div>
              <h1 className="text-2xl font-bold text-gray-800">Ujian Diakhiri Sistem</h1>
              <p className="text-gray-500 text-sm mt-1">Ujian diakhiri otomatis karena batas pelanggaran tercapai.</p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-3">✅</div>
              <h1 className="text-2xl font-bold text-gray-800">Jawaban Terkirim!</h1>
              <p className="text-gray-500 text-sm mt-1">Jawaban kamu berhasil dikumpulkan.</p>
            </>
          )}
        </div>

        {/* Ringkasan */}
        {hasil && (
          <div className="card space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Nama</span>
              <span className="font-semibold text-gray-800 text-right max-w-[60%]">{hasil.nama}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">NIM</span>
              <span className="font-mono font-semibold text-gray-800">{hasil.nim}</span>
            </div>
            <div className="h-px bg-gray-100" />
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ujian</span>
              <span className="font-semibold text-gray-800 text-right max-w-[60%]">{hasil.judul_ujian}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Mata Kuliah</span>
              <span className="font-semibold text-gray-800 text-right max-w-[60%]">{hasil.nama_matkul || '-'}</span>
            </div>
            {hasil.waktu_selesai && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Waktu Kirim</span>
                <span className="font-semibold text-gray-800 text-right">{formatWaktu(hasil.waktu_selesai)}</span>
              </div>
            )}
            {hasil.waktu_mulai && hasil.waktu_selesai && hasil.waktu_selesai !== '' && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Durasi</span>
                <span className="font-semibold text-gray-800">
                  {hitungDurasi(hasil.waktu_mulai, hasil.waktu_selesai)}
                </span>
              </div>
            )}
            {hasil.jumlah_pelanggaran > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Pelanggaran</span>
                <span className="font-semibold text-red-600">{hasil.jumlah_pelanggaran}×</span>
              </div>
            )}
          </div>
        )}

        {/* Info esai */}
        {hasil?.ada_esai && (
          <div className="card text-center bg-amber-50 border-amber-200">
            <p className="text-xs text-amber-600 font-medium mb-1">⏳ Soal Esai</p>
            <p className="text-sm text-amber-700">Soal esai akan dinilai oleh dosen. Nilai final diumumkan setelah penilaian selesai.</p>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>Screenshot halaman ini sebagai bukti pengumpulan.</p>
          <p>Hubungi dosen jika ada pertanyaan tentang nilai.</p>
        </div>

        <button onClick={() => router.push('/')} className="btn-secondary w-full">← Kembali ke Beranda</button>
      </div>
    </div>
  )
}