'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import DashboardTabs from '../components/DashboardTabs'

interface UjianRow {
  id: string
  judul: string
  kode_ujian: string
  status: string
  durasi_menit: number
  prodi_target: string
  minat_target: string[]
  kelas_target: string[] | null
  angkatan_target: number[] | null
  acak_soal: boolean
  maks_pelanggaran: number
  created_at: string
  mata_kuliah: { nama_matkul: string; kode_matkul: string } | null
  _count?: { soal: number }
  soal_count?: number
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'badge-gray',
  aktif: 'badge-green',
  selesai: 'badge-blue',
  dibatalkan: 'badge-red',
}

export default function AdminUjianPage() {
  const router = useRouter()
  const [ujianList, setUjianList] = useState<UjianRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('semua')

  // Modal aktifkan kembali
  const [showReaktivasi, setShowReaktivasi] = useState(false)
  const [ujianReaktivasi, setUjianReaktivasi] = useState<UjianRow | null>(null)
  const [kodeBaru, setKodeBaru] = useState('')
  const [resetSesi, setResetSesi] = useState(true)
  const [reaktivasiLoading, setReaktivasiLoading] = useState(false)
  const [reaktivasiError, setReaktivasiError] = useState('')

  useEffect(() => { loadUjian() }, [])

  async function loadUjian() {
    setLoading(true)
    const { data } = await supabase
      .from('ujian')
      .select(`*, mata_kuliah(nama_matkul, kode_matkul)`)
      .order('created_at', { ascending: false })

    if (data) {
      // Hitung jumlah soal per ujian
      const withCount = await Promise.all(data.map(async (u) => {
        const { count } = await supabase
          .from('soal')
          .select('*', { count: 'exact', head: true })
          .eq('ujian_id', u.id)
        return { ...u, soal_count: count || 0 }
      }))
      setUjianList(withCount)
    }
    setLoading(false)
  }

  async function ubahStatus(id: string, status: string) {
    await supabase.from('ujian').update({ status }).eq('id', id)
    loadUjian()
  }

  function generateKodeAcak() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let kode = ''
    for (let i = 0; i < 6; i++) kode += chars[Math.floor(Math.random() * chars.length)]
    return kode
  }

  function bukaModalReaktivasi(u: UjianRow) {
    setUjianReaktivasi(u)
    setKodeBaru(u.kode_ujian || generateKodeAcak())
    setResetSesi(true)
    setReaktivasiError('')
    setShowReaktivasi(true)
  }

  async function handleReaktivasi() {
    if (!ujianReaktivasi) return
    if (!kodeBaru.trim()) { setReaktivasiError('Kode ujian harus diisi.'); return }

    setReaktivasiLoading(true)
    setReaktivasiError('')

    try {
      // Cek apakah kode baru sudah dipakai ujian lain
      if (kodeBaru.toUpperCase() !== ujianReaktivasi.kode_ujian) {
        const { data: existing } = await supabase
          .from('ujian')
          .select('id')
          .eq('kode_ujian', kodeBaru.toUpperCase())
          .neq('id', ujianReaktivasi.id)
          .maybeSingle()
        if (existing) { setReaktivasiError('Kode ujian ini sudah dipakai ujian lain. Gunakan kode lain.'); setReaktivasiLoading(false); return }
      }

      // Reset semua sesi mahasiswa di ujian ini jika dipilih
      if (resetSesi) {
        const { data: sesiList } = await supabase.from('sesi_ujian').select('id').eq('ujian_id', ujianReaktivasi.id)
        const sesiIds = (sesiList || []).map(s => s.id)
        if (sesiIds.length > 0) {
          await supabase.from('jawaban').delete().in('sesi_id', sesiIds)
          await supabase.from('log_aktivitas').delete().in('sesi_id', sesiIds)
          await supabase.from('sesi_ujian').delete().eq('ujian_id', ujianReaktivasi.id)
        }
      }

      const { error } = await supabase
        .from('ujian')
        .update({ status: 'aktif', kode_ujian: kodeBaru.toUpperCase().trim() })
        .eq('id', ujianReaktivasi.id)

      if (error) throw error

      setShowReaktivasi(false)
      loadUjian()
    } catch (e: any) {
      setReaktivasiError(e.message || 'Gagal mengaktifkan ujian.')
    } finally {
      setReaktivasiLoading(false)
    }
  }

  async function hapusUjian(id: string, judul: string) {
    if (!confirm(`Hapus ujian "${judul}"? Semua soal dan sesi akan ikut terhapus.`)) return
    await supabase.from('ujian').delete().eq('id', id)
    loadUjian()
  }

  const filtered = ujianList.filter(u => {
    const matchSearch = u.judul.toLowerCase().includes(search.toLowerCase()) ||
      u.kode_ujian?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'semua' || u.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <DashboardTabs />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Manajemen Ujian</h1>
          <p className="text-sm text-gray-400">{ujianList.length} ujian terdaftar</p>
        </div>
        <Link href="/admin/ujian/baru" className="btn-primary text-sm px-4 py-2.5 inline-flex items-center gap-2">
          + Buat Ujian Baru
        </Link>
      </div>

      {/* Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          className="input-field text-sm flex-1"
          placeholder="Cari judul atau kode ujian..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input-field text-sm sm:w-40"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="semua">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="aktif">Aktif</option>
          <option value="selesai">Selesai</option>
          <option value="dibatalkan">Dibatalkan</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat data...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">Belum ada ujian. Klik "Buat Ujian Baru" untuk mulai.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(u => (
            <div key={u.id} className="card hover:shadow-md transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-800">{u.judul}</h3>
                    <span className={`badge ${STATUS_COLORS[u.status] || 'badge-gray'}`}>
                      {u.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    {u.mata_kuliah?.kode_matkul} — {u.mata_kuliah?.nama_matkul}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {u.kode_ujian && (
                      <span className="font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-bold">
                        Kode: {u.kode_ujian}
                      </span>
                    )}
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      ⏱ {u.durasi_menit} menit
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                      📋 {u.soal_count} soal
                    </span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-lg capitalize">
                      {u.prodi_target} · {u.minat_target?.join(', ')}
                      {u.kelas_target ? ` · Kelas ${u.kelas_target.join(',')}` : ''}
                      {u.angkatan_target ? ` · ${u.angkatan_target.join(',')}` : ''}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 flex-shrink-0">
                  <Link
                    href={`/admin/ujian/${u.id}`}
                    className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 font-medium"
                  >
                    ✏️ Edit & Soal
                  </Link>
                  {u.status === 'draft' && (
                    <button
                      onClick={() => ubahStatus(u.id, 'aktif')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 font-medium"
                    >
                      ▶ Aktifkan
                    </button>
                  )}
                  {u.status === 'aktif' && (
                    <button
                      onClick={() => ubahStatus(u.id, 'selesai')}
                      className="text-xs px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 font-medium"
                    >
                      ⏹ Selesaikan
                    </button>
                  )}
                  {(u.status === 'selesai' || u.status === 'dibatalkan') && (
                    <button
                      onClick={() => bukaModalReaktivasi(u)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-medium"
                    >
                      ↻ Aktifkan Kembali
                    </button>
                  )}
                  <button
                    onClick={() => hapusUjian(u.id, u.judul)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 font-medium"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Aktifkan Kembali */}
      {showReaktivasi && ujianReaktivasi && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Aktifkan Kembali Ujian</h3>
              <button onClick={() => setShowReaktivasi(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-sm font-semibold text-gray-700">{ujianReaktivasi.judul}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {ujianReaktivasi.mata_kuliah?.kode_matkul} — {ujianReaktivasi.mata_kuliah?.nama_matkul}
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Kode Ujian Baru</label>
              <div className="flex gap-2">
                <input
                  className="input-field text-sm uppercase font-mono flex-1"
                  value={kodeBaru}
                  onChange={e => setKodeBaru(e.target.value.toUpperCase())}
                  maxLength={10}
                />
                <button
                  onClick={() => setKodeBaru(generateKodeAcak())}
                  className="btn-secondary text-xs px-3 whitespace-nowrap"
                  title="Generate kode acak"
                >
                  🎲 Acak
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Bisa pakai kode lama ({ujianReaktivasi.kode_ujian}) atau buat kode baru. Kode baru membuat mahasiswa wajib menggunakan kode terbaru untuk login.
              </p>
            </div>

            <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-amber-600 mt-0.5"
                checked={resetSesi}
                onChange={e => setResetSesi(e.target.checked)}
              />
              <div>
                <p className="text-sm font-medium text-amber-800">Hapus semua sesi & jawaban lama</p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Direkomendasikan jika ujian ini akan dikerjakan ulang dari awal oleh semua peserta. Nilai dan jawaban sebelumnya akan terhapus permanen.
                </p>
              </div>
            </label>

            {reaktivasiError && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">⚠️ {reaktivasiError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowReaktivasi(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={handleReaktivasi} disabled={reaktivasiLoading} className="btn-primary flex-1">
                {reaktivasiLoading ? 'Memproses...' : '↻ Aktifkan Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
