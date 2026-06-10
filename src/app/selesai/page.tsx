'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hapusSesiLokal } from '@/lib/utils'
import { formatTanggalWaktu, hitungDurasiMenit, nilaiKeHuruf } from '@/lib/utils'

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
  nilai_esai: number | null
  nilai_final: number | null
  ada_esai: boolean
}

export default function SelesaiPage() {
  const router = useRouter()
  const [hasil, setHasil] = useState<HasilUjian | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadHasil()
    // Bersihkan semua session & local storage
    hapusSesiLokal()
    sessionStorage.clear()
  }, [])

  async function loadHasil() {
    try {
      // Data dari sessionStorage sebelum di-clear mungkin sudah hilang
      // Ambil dari token yang mungkin masih ada, atau tampilkan ringkasan umum
      const token = sessionStorage.getItem('sesi_token')

      if (!token) {
        setLoading(false)
        return
      }

      const { data: sesi } = await supabase
        .from('sesi_ujian')
        .select(`
          *,
          mahasiswa ( nim, nama ),
          ujian (
            judul,
            mata_kuliah ( nama_matkul ),
            soal ( tipe )
          )
        `)
        .eq('token_sesi', token)
        .single()

      if (!sesi) {
        setLoading(false)
        return
      }

      const adaEsai = (sesi.ujian?.soal || []).some((s: any) => s.tipe === 'esai')

      setHasil({
        nama: sesi.mahasiswa?.nama || '',
        nim: sesi.mahasiswa?.nim || '',
        judul_ujian: sesi.ujian?.judul || '',
        nama_matkul: sesi.ujian?.mata_kuliah?.nama_matkul || '',
        status: sesi.status,
        waktu_mulai: sesi.waktu_mulai || '',
        waktu_selesai: sesi.waktu_selesai || new Date().toISOString(),
        durasi_menit: sesi.waktu_mulai && sesi.waktu_selesai
          ? hitungDurasiMenit(sesi.waktu_mulai, sesi.waktu_selesai)
          : 0,
        jumlah_pelanggaran: sesi.jumlah_pelanggaran,
        nilai_pg: sesi.nilai_pg,
        nilai_esai: sesi.nilai_esai,
        nilai_final: sesi.nilai_final,
        ada_esai: adaEsai,
      })
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const isAutoSubmit = hasil?.status === 'auto_submit'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-4 animate-slide-up">

        {/* Status icon */}
        <div className="text-center">
          {isAutoSubmit ? (
            <>
              <div className="text-6xl mb-3">🔒</div>
              <h1 className="text-2xl font-bold text-gray-800">Ujian Diakhiri Sistem</h1>
              <p className="text-gray-500 text-sm mt-1">
                Ujian diakhiri otomatis karena batas pelanggaran tercapai.
              </p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-3">✅</div>
              <h1 className="text-2xl font-bold text-gray-800">Ujian Selesai!</h1>
              <p className="text-gray-500 text-sm mt-1">
                Jawaban kamu berhasil dikumpulkan.
              </p>
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
              <span className="font-semibold text-gray-800 text-right max-w-[60%]">{hasil.nama_matkul}</span>
            </div>
            {hasil.waktu_selesai && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Selesai</span>
                <span className="font-semibold text-gray-800">{formatTanggalWaktu(hasil.waktu_selesai)}</span>
              </div>
            )}
            {hasil.durasi_menit > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Durasi</span>
                <span className="font-semibold text-gray-800">{hasil.durasi_menit} menit</span>
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

        {/* Nilai */}
        {hasil?.nilai_pg !== null && hasil?.nilai_pg !== undefined && (
          <div className="card text-center">
            <p className="text-xs text-gray-400 mb-1">Nilai Pilihan Ganda</p>
            <p className="text-4xl font-bold text-primary-600">{hasil.nilai_pg.toFixed(1)}</p>
            <p className="text-sm text-gray-400 mt-0.5">dari 100</p>
          </div>
        )}

        {hasil?.ada_esai && (
          <div className="card text-center bg-amber-50 border-amber-200">
            <p className="text-xs text-amber-600 font-medium mb-1">⏳ Soal Esai</p>
            <p className="text-sm text-amber-700">
              Soal esai akan dinilai oleh dosen. Nilai final akan diumumkan setelah penilaian selesai.
            </p>
          </div>
        )}

        {/* Pesan */}
        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>Simpan atau screenshot halaman ini sebagai bukti pengumpulan.</p>
          <p>Hubungi dosen/admin jika ada pertanyaan tentang nilai.</p>
        </div>

        {/* Kembali ke beranda */}
        <button
          onClick={() => router.push('/')}
          className="btn-secondary w-full"
        >
          ← Kembali ke Beranda
        </button>
      </div>
    </div>
  )
}
