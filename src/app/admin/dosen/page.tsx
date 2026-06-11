'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Dosen { id: string; kode_dosen: string; nama: string; email: string | null; is_active: boolean }

const EMPTY_FORM = { kode_dosen: '', nama: '', email: '', is_active: true }

export default function AdminDosenPage() {
  const [list, setList] = useState<Dosen[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('dosen').select('*').order('nama')
    setList(data || [])
    setLoading(false)
  }

  function bukaFormBaru() {
    setEditingId(null); setForm({ ...EMPTY_FORM }); setFormError(''); setShowForm(true)
  }

  function bukaFormEdit(d: Dosen) {
    setEditingId(d.id)
    setForm({ kode_dosen: d.kode_dosen, nama: d.nama, email: d.email || '', is_active: d.is_active })
    setFormError(''); setShowForm(true)
  }

  async function simpan() {
    if (!form.kode_dosen.trim()) { setFormError('Kode dosen harus diisi.'); return }
    if (!form.nama.trim()) { setFormError('Nama harus diisi.'); return }
    setSaving(true); setFormError('')
    try {
      const payload = { kode_dosen: form.kode_dosen.trim(), nama: form.nama.trim(), email: form.email.trim() || null, is_active: form.is_active }
      if (editingId) {
        await supabase.from('dosen').update(payload).eq('id', editingId)
      } else {
        await supabase.from('dosen').insert(payload)
      }
      setShowForm(false); loadData()
    } catch (e: any) { setFormError(e.message || 'Gagal menyimpan.') }
    finally { setSaving(false) }
  }

  async function hapus(id: string, nama: string) {
    if (!confirm(`Hapus dosen ${nama}? Mata kuliah yang diampu akan kehilangan referensi dosen.`)) return
    await supabase.from('dosen').delete().eq('id', id)
    loadData()
  }

  const filtered = list.filter(d => d.nama.toLowerCase().includes(search.toLowerCase()) || d.kode_dosen.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Data Dosen</h1>
          <p className="text-sm text-gray-400">{list.length} dosen terdaftar</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/import" className="btn-secondary text-sm px-4 py-2.5">📥 Import CSV</a>
          <button onClick={bukaFormBaru} className="btn-primary text-sm px-4 py-2.5">+ Tambah</button>
        </div>
      </div>

      <input className="input-field text-sm" placeholder="Cari nama atau kode dosen..." value={search} onChange={e => setSearch(e.target.value)} />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat data...</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['Kode','Nama','Email','Status','Aksi'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">Tidak ada data.</td></tr>
                ) : filtered.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary-600">{d.kode_dosen}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{d.nama}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{d.email || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {d.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => bukaFormEdit(d)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                        <button onClick={() => hapus(d.id, d.nama)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{editingId ? 'Edit Dosen' : 'Tambah Dosen'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Kode Dosen *</label>
                <input className="input-field text-sm" placeholder="Contoh: DSN001" value={form.kode_dosen}
                  onChange={e => setForm(p => ({ ...p, kode_dosen: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nama Lengkap *</label>
                <input className="input-field text-sm" placeholder="Dr. Nama Dosen, M.P." value={form.nama}
                  onChange={e => setForm(p => ({ ...p, nama: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Email</label>
                <input type="email" className="input-field text-sm" placeholder="dosen@instiper.ac.id" value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
            </div>
            {formError && <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">⚠️ {formError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={simpan} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
