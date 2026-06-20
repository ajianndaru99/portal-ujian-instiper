'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
type StatusSesi = 'belum_mulai' | 'mengerjakan' | 'selesai' | 'auto_submit' | 'paksa_submit'

type SesiRow = {
  id: string
  nim: string
  status: StatusSesi
  jumlah_pelanggaran: number
  waktu_mulai: string | null
  waktu_selesai: string | null
  mahasiswa: { nama: string; prodi: string; angkatan: number }
}

type UjianDetail = {
  id: string
  judul: string
  kode_ujian: string | null
  status: string
  mata_kuliah: { nama_matkul: string }
}

// ─── Config tampilan status ────────────────────────────────────────────────────
const STATUS_CONFIG: Record<StatusSesi, { label: string; pill: string; row: string }> = {
  belum_mulai:  { label: 'Belum Mulai',   pill: 'bg-gray-100 text-gray-500',    row: '' },
  mengerjakan:  { label: '● Mengerjakan', pill: 'bg-green-50 text-green-600',   row: 'bg-green-50/40' },
  selesai:      { label: 'Selesai',       pill: 'bg-blue-50 text-blue-600',     row: '' },
  auto_submit:  { label: '⚠ Auto Submit', pill: 'bg-red-50 text-red-600',       row: 'bg-red-50/30' },
  paksa_submit: { label: 'Paksa Submit',  pill: 'bg-orange-50 text-orange-600', row: 'bg-orange-50/30' },
}

type FilterKey = 'semua' | StatusSesi | 'selesai_all'

export default function MonitorDetailPage() {
  const router = useRouter()
  const { ujianId } = useParams<{ ujianId: string }>()

  const [ujian, setUjian] = useState<UjianDetail | null>(null)
  const [sesiList, setSesiList] = useState<SesiRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('semua')
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set())

  // ─── Initial fetch ──────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [{ data: ujianData }, { data: sesiData }] = await Promise.all([
      supabase
        .from('ujian')
        .select('id, judul, kode_ujian, status, mata_kuliah!inner(nama_matkul)')
        .eq('id', ujianId)
        .single(),
      supabase
        .from('sesi_ujian')
        .select('id, nim, status, jumlah_pelanggaran, waktu_mulai, waktu_selesai, mahasiswa!inner(nama, prodi, angkatan)')
        .eq('ujian_id', ujianId)
        .order('nim'),
    ])
    if (ujianData) setUjian(ujianData as any)
    if (sesiData) setSesiList(sesiData as any)
    setLastUpdate(new Date())
    setLoading(false)
  }, [ujianId])

  // ─── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    fetchData()

    const channel = supabase
      .channel(`monitor-detail-${ujianId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sesi_ujian', filter: `ujian_id=eq.${ujianId}` },
        (payload) => {
          setSesiList((prev) =>
            prev.map((s) =>
              s.id === payload.new.id ? { ...s, ...(payload.new as any) } : s
            )
          )
          setLastUpdate(new Date())
          // Flash highlight baris yang berubah
          setFlashIds((prev) => {
          const next = new Set(prev)
          next.add(payload.new.id as string)
          return next
          })
          setTimeout(
            () => setFlashIds((prev) => { const next = new Set(prev); next.delete(payload.new.id as string); return next }),
            2000
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [ujianId, fetchData])

  // ─── Derived stats ──────────────────────────────────────────────────────────
  const stats = {
    belum_mulai: sesiList.filter((s) => s.status === 'belum_mulai').length,
    mengerjakan: sesiList.filter((s) => s.status === 'mengerjakan').length,
    selesai: sesiList.filter((s) =>
      ['selesai', 'auto_submit', 'paksa_submit'].includes(s.status)
    ).length,
    ada_pelanggaran: sesiList.filter((s) => s.jumlah_pelanggaran > 0).length,
  }

  const filteredSesi = sesiList.filter((s) => {
    if (filter === 'semua') return true
    if (filter === 'selesai_all') return ['selesai', 'auto_submit', 'paksa_submit'].includes(s.status)
    return s.status === filter
  })

  // Sort: mengerjakan → belum_mulai → selesai → auto_submit → paksa_submit
  const ORDER: StatusSesi[] = ['mengerjakan', 'belum_mulai', 'selesai', 'auto_submit', 'paksa_submit']
  filteredSesi.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.mahasiswa.nama.localeCompare(b.mahasiswa.nama))

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!ujian) {
    return <p className="text-gray-500 text-sm text-center mt-12">Ujian tidak ditemukan.</p>
  }

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex items-start gap-2">
        <button
          onClick={() => router.push('/admin/monitor')}
          className="mt-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">{(ujian.mata_kuliah as any)?.nama_matkul}</p>
          <h1 className="text-lg font-bold text-gray-800 truncate">{ujian.judul}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {ujian.kode_ujian && (
              <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                {ujian.kode_ujian}
              </span>
            )}
            <span className="text-xs text-gray-400">
              Live · {lastUpdate.toLocaleTimeString('id-ID')}
            </span>
            {/* Pulse dot */}
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
          </div>
        </div>
        <button onClick={fetchData} className="btn-secondary px-3 py-1.5 text-xs flex items-center gap-1 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ── Stat cards (klik untuk filter) ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { key: 'belum_mulai' as FilterKey,  label: 'Belum Mulai',      value: stats.belum_mulai,      color: 'text-gray-700',   bg: '' },
          { key: 'mengerjakan' as FilterKey,  label: 'Mengerjakan',      value: stats.mengerjakan,      color: 'text-green-600',  bg: 'bg-green-50' },
          { key: 'selesai_all' as FilterKey,  label: 'Selesai',          value: stats.selesai,          color: 'text-blue-600',   bg: 'bg-blue-50' },
          { key: 'semua'       as FilterKey,  label: 'Ada Pelanggaran',  value: stats.ada_pelanggaran,  color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map((stat) => (
          <button
            key={stat.key + stat.label}
            onClick={() => setFilter(filter === stat.key && stat.key !== 'semua' ? 'semua' : stat.key)}
            className={`card text-center py-3 transition-all hover:shadow-sm ${
              filter === stat.key ? 'ring-2 ring-primary-400' : ''
            }`}
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* ── Sub-header tabel ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Menampilkan{' '}
          <span className="font-semibold text-gray-800">{filteredSesi.length}</span>{' '}
          dari {sesiList.length} peserta
        </p>
        {filter !== 'semua' && (
          <button onClick={() => setFilter('semua')} className="text-xs text-primary-600 underline">
            Tampilkan semua
          </button>
        )}
      </div>

      {/* ── Tabel peserta ── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mahasiswa</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                  Pelanggaran
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Waktu Mulai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredSesi.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Tidak ada peserta untuk filter ini
                  </td>
                </tr>
              ) : (
                filteredSesi.map((sesi) => {
                  const cfg = STATUS_CONFIG[sesi.status]
                  const isFlashing = flashIds.has(sesi.id)
                  return (
                    <tr
                      key={sesi.id}
                      className={`transition-colors duration-500 ${cfg.row} ${
                        isFlashing ? 'bg-yellow-50' : ''
                      } hover:bg-gray-50`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{sesi.mahasiswa?.nama}</p>
                        <p className="text-xs text-gray-400">
                          {sesi.nim} · {sesi.mahasiswa?.prodi} {sesi.mahasiswa?.angkatan}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.pill}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {sesi.jumlah_pelanggaran > 0 ? (
                          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                            {sesi.jumlah_pelanggaran}×
                          </span>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                        {sesi.waktu_mulai
                          ? new Date(sesi.waktu_mulai).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        <span>🟡 Baris kuning = baru saja berubah (realtime)</span>
        <span>🔴 ⚠ Auto Submit = kena auto-submit sistem</span>
      </div>
    </div>
  )
}