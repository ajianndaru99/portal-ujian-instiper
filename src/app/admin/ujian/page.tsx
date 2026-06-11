'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

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
    </div>
  )
}
