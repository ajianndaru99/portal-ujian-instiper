'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Admin = {
  id: string
  email: string
  nama: string
  role: 'superadmin' | 'admin'
  is_active: boolean
  created_at: string
}

export default function AdminsPage() {
  const [admins, setAdmins] = useState<Admin[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nama: '', email: '' })
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  async function fetchAdmins() {
    const { data } = await supabase.from('admins').select('*').order('created_at')
    if (data) setAdmins(data as Admin[])
    setLoading(false)
  }

  useEffect(() => { fetchAdmins() }, [])

  async function handleUndang() {
    if (!form.nama.trim() || !form.email.trim()) return
    setSubmitting(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/admin/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama: form.nama.trim(), email: form.email.trim() }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Gagal menambahkan admin')
      setSuccessMsg(`Undangan berhasil dikirim ke ${form.email}. Admin baru akan mengatur password melalui email.`)
      setForm({ nama: '', email: '' })
      setShowModal(false)
      fetchAdmins()
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(admin: Admin) {
    await supabase.from('admins').update({ is_active: !admin.is_active }).eq('id', admin.id)
    fetchAdmins()
  }

  function openModal() {
    setForm({ nama: '', email: '' })
    setErrorMsg('')
    setShowModal(true)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Manajemen Admin</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Kelola akun admin yang dapat mengakses portal ujian ini
          </p>
        </div>
        <button onClick={openModal} className="btn-primary px-4 py-2 text-sm">
          + Undang Admin
        </button>
      </div>

      {/* Notifikasi sukses */}
      {successMsg && (
        <div className="flex items-start gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-xl px-4 py-3">
          <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Info cara kerja */}
      <div className="bg-primary-50 rounded-xl px-4 py-3 text-xs text-primary-700 space-y-1">
        <p className="font-semibold">Cara menambah admin:</p>
        <p>1. Klik <strong>Undang Admin</strong> → isi nama & email → kirim.</p>
        <p>2. Admin baru menerima email dari Supabase → klik link → atur password sendiri.</p>
        <p>3. Admin langsung bisa login ke portal dengan email & password tersebut.</p>
      </div>

      {/* Tabel admin */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Role</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ditambahkan</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">
                    Belum ada admin
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className={`hover:bg-gray-50 ${!admin.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{admin.nama}</p>
                      <p className="text-xs text-gray-400">{admin.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        admin.role === 'superadmin'
                          ? 'bg-purple-50 text-purple-600'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {admin.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        admin.is_active
                          ? 'bg-green-50 text-green-600'
                          : 'bg-gray-100 text-gray-400'
                      }`}>
                        {admin.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(admin.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      {admin.role !== 'superadmin' && (
                        <button
                          onClick={() => toggleActive(admin)}
                          className="text-xs text-gray-500 hover:text-gray-900 underline transition-colors"
                        >
                          {admin.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal undang admin */}
      {showModal && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="font-bold text-gray-800 text-lg mb-1">Undang Admin Baru</h2>
            <p className="text-xs text-gray-400 mb-5">
              Admin akan menerima email undangan untuk mengatur password mereka.
            </p>

            {errorMsg && (
              <div className="bg-red-50 text-red-600 text-xs rounded-xl px-3 py-2.5 mb-4">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Nama Lengkap</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Dr. Ir. Nama Admin, M.P."
                  value={form.nama}
                  onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">Email Institusi</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="admin@instiper.ac.id"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary flex-1"
                disabled={submitting}
              >
                Batal
              </button>
              <button
                onClick={handleUndang}
                disabled={submitting || !form.nama.trim() || !form.email.trim()}
                className="btn-primary flex-1"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Mengirim...
                  </span>
                ) : 'Kirim Undangan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}