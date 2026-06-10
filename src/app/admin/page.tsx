'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError('Email dan password harus diisi.')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError || !data.session) {
        setError('Email atau password salah.')
        return
      }

      // Verifikasi bahwa user ada di tabel admins
      const { data: admin, error: adminError } = await supabase
        .from('admins')
        .select('id, nama, role, is_active')
        .eq('id', data.user.id)
        .single()

      if (adminError || !admin || !admin.is_active) {
        await supabase.auth.signOut()
        setError('Akun admin tidak ditemukan atau tidak aktif.')
        return
      }

      router.push('/admin/dashboard')
    } catch (err) {
      console.error(err)
      setError('Terjadi kesalahan. Coba lagi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-600 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white">Admin Portal Ujian</h1>
          <p className="text-gray-400 text-sm mt-1">FAPERTA — INSTIPER Yogyakarta</p>
        </div>

        <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="w-full px-4 py-3 rounded-xl bg-gray-700 border border-gray-600
                           text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none
                           transition-colors"
                placeholder="admin@instiper.ac.id"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="w-full px-4 py-3 rounded-xl bg-gray-700 border border-gray-600
                           text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none
                           transition-colors"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-700 rounded-xl px-4 py-3">
                <p className="text-red-400 text-sm">⚠️ {error}</p>
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50
                         text-white font-semibold rounded-xl transition-all duration-150 mt-2"
            >
              {loading ? 'Memeriksa...' : 'Masuk →'}
            </button>
          </div>
        </div>

        <p className="text-center mt-4">
          <a href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Kembali ke Portal Mahasiswa
          </a>
        </p>
      </div>
    </div>
  )
}
