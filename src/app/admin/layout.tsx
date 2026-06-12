'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface AdminInfo {
  nama: string
  role: string
}

const navItems = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/ujian', label: 'Manajemen Ujian', icon: '📝' },
  { href: '/admin/rekap', label: 'Rekap Nilai', icon: '📈' },
  { href: '/admin/mahasiswa', label: 'Data Mahasiswa', icon: '🎓' },
  { href: '/admin/dosen', label: 'Data Dosen', icon: '👨‍🏫' },
  { href: '/admin/mata-kuliah', label: 'Mata Kuliah', icon: '📚' },
  { href: '/admin/import', label: 'Import Data', icon: '📥' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    // Skip auth check on login page
    if (pathname === '/admin') return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.replace('/admin'); return }

    const { data } = await supabase
      .from('admins')
      .select('nama, role')
      .eq('id', session.user.id)
      .single()

    if (!data) { await supabase.auth.signOut(); router.replace('/admin'); return }
    setAdmin(data)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/admin')
  }

  // Don't show layout on login page
  if (pathname === '/admin') return <>{children}</>

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 bg-gray-900 z-30 flex flex-col
        transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0 lg:static lg:z-auto
      `}>
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-800">
          <p className="text-white font-bold text-sm">Portal Ujian Admin</p>
          <p className="text-gray-400 text-xs mt-0.5">FAPERTA INSTIPER</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User info */}
        {admin && (
          <div className="px-4 py-4 border-t border-gray-800">
            <p className="text-white text-sm font-medium truncate">{admin.nama}</p>
            <p className="text-gray-400 text-xs capitalize mb-3">{admin.role}</p>
            <button
              onClick={handleLogout}
              className="w-full text-xs text-gray-400 hover:text-red-400 transition-colors text-left"
            >
              → Keluar
            </button>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar (mobile) */}
        <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
          <p className="font-semibold text-gray-800 text-sm">
            {navItems.find(n => pathname.startsWith(n.href))?.label || 'Admin'}
          </p>
        </div>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
