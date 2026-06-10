'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { MonitorLive } from '@/lib/types'

interface AdminInfo {
  nama: string
  email: string
  role: string
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [monitor, setMonitor] = useState<MonitorLive[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.replace('/admin')
      return
    }

    const { data: adminData } = await supabase
      .from('admins')
      .select('nama, email, role')
      .eq('id', session.user.id)
      .single()

    if (!adminData) {
      await supabase.auth.signOut()
      router.replace('/admin')
      return
    }

    setAdmin(adminData)
    await loadMonitor()
    setLoading(false)
  }

  async function loadMonitor() {
    const { data } = await supabase
      .from('v_monitor_live')
      .select('*')
      .order('status', { ascending: true })

    setMonitor(data || [])
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const ujianAktif = monitor.filter((m) => m.status === 'aktif')
  const totalMengerjakan = ujianAktif.reduce((s, m) => s + (m.sedang_mengerjakan || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-lg font-bold text-gray-800">Dashboard Admin</h1>
            <p className="text-xs text-gray-400">Portal Ujian FAPERTA INSTIPER</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-gray-700">{admin?.nama}</p>
              <p className="text-xs text-gray-400 capitalize">{admin?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-red-600 transition-colors"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Stats cepat */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card text-center">
            <p className="text-3xl font-bold text-primary-600">{ujianAktif.length}</p>
            <p className="text-xs text-gray-400 mt-1">Ujian Aktif</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-blue-600">{totalMengerjakan}</p>
            <p className="text-xs text-gray-400 mt-1">Sedang Mengerjakan</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-green-600">
              {ujianAktif.reduce((s, m) => s + (m.sudah_selesai || 0), 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Sudah Selesai</p>
          </div>
          <div className="card text-center">
            <p className="text-3xl font-bold text-red-500">
              {ujianAktif.reduce((s, m) => s + (m.auto_submit_count || 0), 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Auto-Submit</p>
          </div>
        </div>

        {/* Daftar ujian */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800">Monitor Ujian</h2>
            <button
              onClick={loadMonitor}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              ↻ Refresh
            </button>
          </div>

          {monitor.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-gray-400">Tidak ada ujian saat ini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {monitor.map((m) => (
                <div key={m.ujian_id} className="card">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-800 text-sm">{m.judul}</h3>
                      {m.kode_ujian && (
                        <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded mt-1 inline-block">
                          {m.kode_ujian}
                        </span>
                      )}
                    </div>
                    <span className={`badge text-xs ${
                      m.status === 'aktif' ? 'badge-green'
                      : m.status === 'draft' ? 'badge-gray'
                      : 'badge-blue'
                    }`}>
                      {m.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-gray-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-gray-800">{m.total_terdaftar}</p>
                      <p className="text-xs text-gray-400">Terdaftar</p>
                    </div>
                    <div className="bg-blue-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-blue-600">{m.sedang_mengerjakan}</p>
                      <p className="text-xs text-blue-400">Aktif</p>
                    </div>
                    <div className="bg-green-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-green-600">{m.sudah_selesai}</p>
                      <p className="text-xs text-green-400">Selesai</p>
                    </div>
                    <div className="bg-red-50 rounded-xl py-2">
                      <p className="text-lg font-bold text-red-500">{m.ada_pelanggaran}</p>
                      <p className="text-xs text-red-400">Pelanggaran</p>
                    </div>
                  </div>

                  {m.rata_rata_nilai && (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                      <span className="text-gray-500">Rata-rata nilai PG</span>
                      <span className="font-bold text-gray-800">{Number(m.rata_rata_nilai).toFixed(1)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Catatan */}
        <div className="text-center text-xs text-gray-400">
          Dashboard ini menampilkan data dari view <code>v_monitor_live</code>.
          Fitur manajemen ujian, soal, dan penilaian esai dapat dikembangkan di sini.
        </div>
      </div>
    </div>
  )
}
