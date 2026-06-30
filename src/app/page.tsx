'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// Import Server Action baru
import { prosesLoginUjian } from '@/app/actions/auth'

export default function LoginPage() {
  const router = useRouter()
  const [nim, setNim] = useState('')
  const [kodeUjian, setKodeUjian] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [bukanPrivateMode, setBukanPrivateMode] = useState(false)

  async function handleMasuk() {
    if (!nim.trim() || !kodeUjian.trim()) {
      setError('NIM dan Kode Ujian harus diisi.')
      return
    }
    if (!bukanPrivateMode) {
      setError('Mohon konfirmasi bahwa kamu tidak menggunakan Private Mode (centang kotak peringatan).')
      return
    }
    setLoading(true)
    setError('')

    try {
      // Panggil Server Action (menjalankan query aman di server)
      const hasil = await prosesLoginUjian(nim, kodeUjian)

      // Jika ada pesan error dari validasi server
      if (!hasil.success) {
        setError(hasil.error as string)
        setLoading(false)
        return
      }

      // Jika berhasil, ekstrak datanya
      const { ujian, mahasiswa, sesi } = hasil.data!

      // 6. Simpan data ke sessionStorage & redirect ke halaman ujian
      sessionStorage.setItem('sesi_token', sesi.token_sesi)
      sessionStorage.setItem('mahasiswa_data', JSON.stringify(mahasiswa))
      sessionStorage.setItem('ujian_data', JSON.stringify(ujian))

      router.push('/ujian')
    } catch (err) {
      console.error(err)
      setError('Terjadi kesalahan. Periksa koneksi internet kamu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-green-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo / Judul */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Portal Ujian Online</h1>
          <p className="text-gray-500 text-sm mt-1">FAPERTA — INSTIPER Yogyakarta</p>
        </div>

        {/* Form */}
        <div className="card animate-slide-up">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                NIM
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Masukkan NIM kamu"
                value={nim}
                onChange={(e) => {
                  setNim(e.target.value)
                  setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleMasuk()}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Kode Ujian
              </label>
              <input
                type="text"
                className="input-field font-mono tracking-widest uppercase"
                placeholder="XXXXXX"
                value={kodeUjian}
                onChange={(e) => {
                  setKodeUjian(e.target.value.toUpperCase())
                  setError('')
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleMasuk()}
                maxLength={6}
                autoComplete="off"
              />
            </div>

            {/* Peringatan Private Mode */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bukanPrivateMode}
                  onChange={(e) => {
                    setBukanPrivateMode(e.target.checked)
                    setError('')
                  }}
                  className="mt-0.5 w-4 h-4 accent-amber-600 flex-shrink-0"
                />
                <span className="text-xs text-amber-800 leading-relaxed font-medium">
                  Saya pastikan <strong>TIDAK</strong> menggunakan Mode Samaran (Incognito / Private Browsing). <br/>
                  <span className="text-amber-600/80 text-[10px]">Jika menggunakan Private Mode, jawaban akan HILANG jika terjadi gangguan sinyal.</span>
                </span>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 animate-fade-in">
                <p className="text-red-700 text-sm font-medium">⚠️ {error}</p>
              </div>
            )}

            <button
              onClick={handleMasuk}
              disabled={loading}
              className="btn-primary w-full mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Memeriksa...
                </span>
              ) : (
                'Masuk ke Ujian →'
              )}
            </button>
          </div>
        </div>

        {/* Petunjuk */}
        <div className="mt-5 text-center space-y-1">
          <p className="text-xs text-gray-400">
            Gunakan perangkat yang stabil. Jangan berpindah tab selama ujian berlangsung.
          </p>
          <p className="text-xs text-gray-400">
            Hubungi pengawas jika kamu mengalami kendala teknis.
          </p>
        </div>

        {/* Admin link */}
        <div className="mt-6 text-center">
          <a href="/admin" className="text-xs text-gray-400 hover:text-primary-600 transition-colors">
            Masuk sebagai Admin →
          </a>
        </div>
      </div>
    </div>
  )
}
