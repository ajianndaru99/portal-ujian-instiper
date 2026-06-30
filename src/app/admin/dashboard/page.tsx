'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DashboardTabs from '../components/DashboardTabs'

interface MonitorRow {
  ujian_id: string
  judul: string
  kode_ujian: string
  status: string
  total_terdaftar: number
  sedang_mengerjakan: number
  sudah_selesai: number
  auto_submit_count: number
  ada_pelanggaran: number
  rata_rata_nilai: number | null
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const [admin, setAdmin] = useState<{ nama: string; role: string } | null>(null)
  const [monitor, setMonitor] = useState<MonitorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  useEffect(() => { checkAuth() }, [])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/admin'); return }
    const { data } = await supabase.from('admins').select('nama, role').eq('id', session.user.id).single()
    if (!data) { await supabase.auth.signOut(); router.replace('/admin'); return }
    setAdmin(data)
    await loadMonitor()
    setLoading(false)
  }

  async function loadMonitor() {
    const { data } = await supabase.from('v_monitor_live').select('*').order('status')
    setMonitor(data || [])
    setLastRefresh(new Date())
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ fontSize: '0.875rem', color: 'var(--admin-text-subtle)' }}>Memuat dashboard...</p>
        </div>
      </div>
    )
  }

  const ujianAktif = monitor.filter(m => m.status === 'aktif')
  const totalMengerjakan = ujianAktif.reduce((s, m) => s + (m.sedang_mengerjakan || 0), 0)
  const totalSelesai = ujianAktif.reduce((s, m) => s + (m.sudah_selesai || 0), 0)
  const totalAutoSubmit = ujianAktif.reduce((s, m) => s + (m.auto_submit_count || 0), 0)

  return (
    <div style={{ maxWidth: 900 }}>
      <DashboardTabs />
      
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--admin-text)', letterSpacing: '-0.03em' }}>
          Dashboard
        </h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-subtle)', marginTop: 2 }}>
          Selamat datang, {admin?.nama} · {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Ujian Aktif', value: ujianAktif.length, cls: 'stat-card-green', color: '#16a34a' },
          { label: 'Sedang Mengerjakan', value: totalMengerjakan, cls: 'stat-card-blue', color: '#2563eb' },
          { label: 'Sudah Selesai', value: totalSelesai, cls: 'stat-card-amber', color: '#d97706' },
          { label: 'Auto-Submit', value: totalAutoSubmit, cls: 'stat-card-red', color: '#dc2626' },
        ].map(s => (
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <p style={{ fontSize: '1.75rem', fontWeight: 800, color: s.color, lineHeight: 1, letterSpacing: '-0.04em' }}>
              {s.value}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: 6, fontWeight: 500 }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Monitor section */}
      <div>
        <div className="section-header">
          <div>
            <p className="section-title">Monitor Ujian</p>
            <p className="section-subtitle">
              Terakhir diperbarui {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <button onClick={loadMonitor} className="admin-btn admin-btn-secondary" style={{ border: '1.5px solid var(--admin-border)' }}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            Refresh
          </button>
        </div>

        {monitor.length === 0 ? (
          <div className="admin-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
            <p style={{ color: 'var(--admin-text-subtle)', fontSize: '0.875rem' }}>Tidak ada ujian aktif saat ini.</p>
            <a href="/admin/ujian/baru" style={{ color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 600, textDecoration: 'none', marginTop: 8, display: 'inline-block' }}>
              + Buat ujian baru →
            </a>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {monitor.map(m => (
              <div key={m.ujian_id} className="admin-card" style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--admin-text)' }}>{m.judul}</p>
                      <span className={`status-pill status-${m.status}`}>{m.status}</span>
                    </div>
                    {m.kode_ujian && (
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', color: 'var(--admin-text-subtle)', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginTop: 4 }}>
                        {m.kode_ujian}
                      </span>
                    )}
                  </div>
                  <a href={`/admin/ujian/${m.ujian_id}`}
                    style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, textDecoration: 'none', flexShrink: 0, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--accent-border)', background: 'var(--accent-light)' }}>
                    Detail →
                  </a>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {[
                    { label: 'Terdaftar', value: m.total_terdaftar, color: '#64748b', bg: '#f8fafc' },
                    { label: 'Aktif', value: m.sedang_mengerjakan, color: '#2563eb', bg: '#eff6ff' },
                    { label: 'Selesai', value: m.sudah_selesai, color: '#16a34a', bg: '#f0fdf4' },
                    { label: 'Pelanggaran', value: m.ada_pelanggaran, color: m.ada_pelanggaran > 0 ? '#dc2626' : '#94a3b8', bg: m.ada_pelanggaran > 0 ? '#fef2f2' : '#f8fafc' },
                  ].map(s => (
                    <div key={s.label} style={{ background: s.bg, borderRadius: 8, padding: '10px', textAlign: 'center' }}>
                      <p style={{ fontSize: '1.25rem', fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</p>
                      <p style={{ fontSize: '0.65rem', color: 'var(--admin-text-subtle)', marginTop: 2, fontWeight: 500 }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {m.rata_rata_nilai && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--admin-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-subtle)' }}>Rata-rata nilai PG</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--admin-text)' }}>{Number(m.rata_rata_nilai).toFixed(1)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
