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
  const [showPass, setShowPass] = useState(false)

  async function handleLogin() {
    if (!email.trim() || !password) { setError('Email dan password harus diisi.'); return }
    setLoading(true); setError('')
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (authError || !data.session) { setError('Email atau password salah.'); return }
      const { data: admin } = await supabase.from('admins').select('id, nama, role, is_active').eq('id', data.user.id).single()
      if (!admin || !admin.is_active) { await supabase.auth.signOut(); setError('Akun admin tidak ditemukan atau tidak aktif.'); return }
      router.push('/admin/dashboard')
    } catch { setError('Terjadi kesalahan. Coba lagi.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--sidebar-bg)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px',
      fontFamily: "'Plus Jakarta Sans', sans-serif"
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', boxShadow: '0 4px 16px rgba(22,163,74,0.35)'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.03em' }}>
            Admin Portal Ujian
          </h1>
          <p style={{ fontSize: '0.775rem', color: 'var(--sidebar-text)', marginTop: 3 }}>
            FAPERTA — INSTIPER Yogyakarta
          </p>
        </div>

        {/* Form card */}
        <div style={{
          background: '#161b27', border: '1px solid var(--sidebar-border)',
          borderRadius: 14, padding: 24
        }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1.5px solid var(--sidebar-border)', background: '#0f1117',
                color: '#f1f5f9', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                transition: 'border-color 0.15s', boxSizing: 'border-box'
              }}
              placeholder="admin@instiper.ac.id"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = 'var(--sidebar-border)'}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPass ? 'text' : 'password'}
                style={{
                  width: '100%', padding: '9px 40px 9px 12px', borderRadius: 8,
                  border: '1.5px solid var(--sidebar-border)', background: '#0f1117',
                  color: '#f1f5f9', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
                  transition: 'border-color 0.15s', boxSizing: 'border-box'
                }}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                onFocus={e => e.target.style.borderColor = '#22c55e'}
                onBlur={e => e.target.style.borderColor = 'var(--sidebar-border)'}
              />
              <button onClick={() => setShowPass(!showPass)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>
                <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {showPass
                    ? <><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></>
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></>
                  }
                </svg>
              </button>
            </div>
          </div>

          {error && (
            <div style={{ background: '#2d1515', border: '1px solid #7f1d1d', borderRadius: 8, padding: '10px 12px', marginBottom: 16 }}>
              <p style={{ fontSize: '0.8rem', color: '#fca5a5' }}>⚠ {error}</p>
            </div>
          )}

          <button onClick={handleLogin} disabled={loading}
            style={{
              width: '100%', padding: '10px', borderRadius: 8, border: 'none',
              background: loading ? '#15803d80' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: '#fff', fontSize: '0.875rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
              boxShadow: loading ? 'none' : '0 2px 12px rgba(22,163,74,0.3)'
            }}>
            {loading ? 'Memeriksa...' : 'Masuk →'}
          </button>
        </div>

        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <a href="/" style={{ fontSize: '0.75rem', color: 'var(--sidebar-text)', textDecoration: 'none' }}>
            ← Kembali ke Portal Mahasiswa
          </a>
        </p>
      </div>
    </div>
  )
}
