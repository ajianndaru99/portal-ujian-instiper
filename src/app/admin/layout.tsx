'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface AdminInfo { nama: string; role: string }

const navGroups = [
  {
    label: 'UTAMA',
    items: [
      { href: '/admin/dashboard', label: 'Dashboard', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
        </svg>
      )},
      { href: '/admin/rekap', label: 'Rekap Nilai', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
        </svg>
      )},
    ]
  },
  {
    label: 'DATA',
    items: [
      { href: '/admin/mahasiswa', label: 'Mahasiswa', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
      )},
      { href: '/admin/dosen', label: 'Dosen', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
        </svg>
      )},
      { href: '/admin/mata-kuliah', label: 'Mata Kuliah', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
      )},
      { href: '/admin/import', label: 'Import Soal', icon: (
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
        </svg>
      )},
    ]
  }
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (pathname !== '/admin') checkAuth()
  }, [pathname])

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/admin'); return }
    const { data } = await supabase.from('admins').select('nama, role').eq('id', session.user.id).single()
    if (!data) { await supabase.auth.signOut(); router.replace('/admin'); return }
    setAdmin(data)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  if (pathname === '/admin') return <>{children}</>

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--admin-bg)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full z-30 flex flex-col
        transition-transform duration-200 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `} style={{ width: 228, background: 'var(--sidebar-bg)', borderRight: '1px solid var(--sidebar-border)' }}>

        {/* Logo area */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--sidebar-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"/>
              </svg>
            </div>
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>Portal Ujian</p>
              <p style={{ fontSize: '0.65rem', color: 'var(--sidebar-text)', marginTop: 1 }}>FAPERTA INSTIPER</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {navGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: 20 }}>
              <p style={{
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em',
                color: 'var(--sidebar-text)', padding: '0 10px', marginBottom: 4,
                textTransform: 'uppercase'
              }}>
                {group.label}
              </p>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, marginBottom: 2,
                      textDecoration: 'none', transition: 'all 0.12s ease',
                      background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                      color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
                      fontWeight: active ? 600 : 400,
                      fontSize: '0.82rem',
                      position: 'relative',
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text-hover)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)' }}
                  >
                    {active && (
                      <span style={{
                        position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                        width: 3, height: 18, borderRadius: '0 2px 2px 0',
                        background: 'var(--sidebar-active-indicator)'
                      }} />
                    )}
                    <span style={{ opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        {admin && (
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--sidebar-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e22, #16a34a44)',
                border: '1px solid #22c55e44',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#22c55e' }}>
                  {admin.nama.charAt(0).toUpperCase()}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {admin.nama}
                </p>
                <p style={{ fontSize: '0.65rem', color: 'var(--sidebar-text)', textTransform: 'capitalize' }}>
                  {admin.role}
                </p>
              </div>
            </div>
            <button onClick={handleLogout}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 6,
                background: 'transparent', border: '1px solid var(--sidebar-border)',
                color: 'var(--sidebar-text)', fontSize: '0.75rem', cursor: 'pointer',
                transition: 'all 0.12s ease', fontFamily: 'inherit'
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#1e2130'; (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--sidebar-text)' }}
            >
              Keluar
            </button>
          </div>
        )}
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Mobile topbar */}
        <div className="lg:hidden" style={{
          background: 'var(--sidebar-bg)', borderBottom: '1px solid var(--sidebar-border)',
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12
        }}>
          <button onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f1f5f9' }}>
            {navGroups.flatMap(g => g.items).find(n => pathname.startsWith(n.href))?.label || 'Admin'}
          </p>
        </div>

        <main style={{ flex: 1, padding: '24px', overflowAuto: 'auto' } as any}>
          {children}
        </main>
      </div>
    </div>
  )
}