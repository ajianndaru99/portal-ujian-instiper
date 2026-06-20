'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type UjianMonitor = {
  id: string
  judul: string
  kode_ujian: string | null
  status: string
  mata_kuliah: { nama_matkul: string }
  belum_mulai: number
  sedang_mengerjakan: number
  sudah_selesai: number
  ada_pelanggaran: number
  total: number
}

export default function MonitorPage() {
  const router = useRouter()
  const [ujianList, setUjianList] = useState<UjianMonitor[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const fetchData = useCallback(async () => {
    const { data } = await supabase
      .from('ujian')
      .select(`
        id, judul, kode_ujian, status,
        mata_kuliah!inner(nama_matkul),
        sesi_ujian(status, jumlah_pelanggaran)
      `)
      .in('status', ['aktif', 'selesai'])
      .order('created_at', { ascending: false })

    if (data) {
      setUjianList(
        data.map((u: any) => {
          const s = (u.sesi_ujian ?? []) as any[]
          return {
            id: u.id,
            judul: u.judul,
            kode_ujian: u.kode_ujian,
            status: u.status,
            mata_kuliah: u.mata_kuliah,
            total: s.length,
            belum_mulai: s.filter((x) => x.status === 'belum_mulai').length,
            sedang_mengerjakan: s.filter((x) => x.status === 'mengerjakan').length,
            sudah_selesai: s.filter((x) =>
              ['selesai', 'auto_submit', 'paksa_submit'].includes(x.status)
            ).length,
            ada_pelanggaran: s.filter((x) => x.jumlah_pelanggaran > 0).length,
          }
        })
      )
      setLastUpdate(new Date())
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Judul + tombol refresh */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Live Monitor Ujian</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Update terakhir: {lastUpdate.toLocaleTimeString('id-ID')} · auto-refresh tiap 30 detik
          </p>
        </div>
        <button
          onClick={fetchData}
          className="btn-secondary px-3 py-2 text-sm flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {ujianList.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-500 text-sm font-medium">Tidak ada ujian aktif saat ini</p>
          <p className="text-gray-400 text-xs mt-1">Aktifkan ujian terlebih dahulu dari menu Ujian</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {ujianList.map((ujian) => (
            <button
              key={ujian.id}
              onClick={() => router.push(`/admin/monitor/${ujian.id}`)}
              className="card text-left hover:shadow-md transition-all border-2 border-transparent hover:border-primary-100"
            >
              {/* Info ujian */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 mr-2">
                  <p className="text-xs text-gray-400 truncate">{(ujian.mata_kuliah as any)?.nama_matkul}</p>
                  <p className="text-sm font-semibold text-gray-800 mt-0.5 truncate">{ujian.judul}</p>
                  {ujian.kode_ujian && (
                    <span className="text-xs font-mono bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {ujian.kode_ujian}
                    </span>
                  )}
                </div>
                <span className={`flex-shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                  ujian.status === 'aktif'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {ujian.status === 'aktif' ? '● Aktif' : 'Selesai'}
                </span>
              </div>

              {/* Stat bar */}
              {ujian.total > 0 && (
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden flex mb-4">
                  <div className="bg-green-400 transition-all" style={{ width: `${(ujian.sedang_mengerjakan / ujian.total) * 100}%` }} />
                  <div className="bg-blue-400 transition-all" style={{ width: `${(ujian.sudah_selesai / ujian.total) * 100}%` }} />
                </div>
              )}

              {/* 3 angka */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-gray-600">{ujian.belum_mulai}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Belum mulai</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{ujian.sedang_mengerjakan}</p>
                  <p className="text-xs text-green-500 mt-0.5">Mengerjakan</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-blue-600">{ujian.sudah_selesai}</p>
                  <p className="text-xs text-blue-500 mt-0.5">Selesai</p>
                </div>
              </div>

              {/* Peringatan pelanggaran */}
              {ujian.ada_pelanggaran > 0 && (
                <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M12 9v3.75m0 3.75h.008M10.29 3.86l-8.18 14.18A1.5 1.5 0 003.4 20.5h17.2a1.5 1.5 0 001.3-2.46L13.71 3.86a1.5 1.5 0 00-2.42 0z" />
                  </svg>
                  {ujian.ada_pelanggaran} mahasiswa terindikasi pelanggaran
                </div>
              )}

              <div className="mt-3 text-right">
                <span className="text-xs text-primary-600 font-medium">Pantau Detail →</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}