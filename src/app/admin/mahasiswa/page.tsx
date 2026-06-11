'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Mahasiswa {
  nim: string
  nama: string
  prodi: string
  minat: string
  kelas: string
  angkatan: number
  is_active: boolean
}

const MINAT_BY_PRODI: Record<string, string[]> = {
  agroteknologi: ['spks', 'antan'],
  agribisnis: ['smbp', 'sea', 'spa'],
}

const EMPTY_FORM = {
  nim: '', nama: '', prodi: 'agroteknologi', minat: 'spks',
  kelas: 'A', angkatan: new Date().getFullYear(), is_active: true,
}

export default function AdminMahasiswaPage() {
  const [list, setList] = useState<Mahasiswa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProdi, setFilterProdi] = useState('semua')
  const [filterMinat, setFilterMinat] = useState('semua')
  const [filterAngkatan, setFilterAngkatan] = useState('semua')

  const [showForm, setShowForm] = useState(false)
  const [editingNim, setEditingNim] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data } = await supabase.from('mahasiswa').select('*').order('angkatan').order('nim')
    setList(data || [])
    setLoading(false)
  }

  function bukaFormBaru() {
    setEditingNim(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setShowForm(true)
  }

  function bukaFormEdit(m: Mahasiswa) {
    setEditingNim(m.nim)
    setForm({ nim: m.nim, nama: m.nama, prodi: m.prodi, minat: m.minat, kelas: m.kelas, angkatan: m.angkatan, is_active: m.is_active })
    setFormError('')
    setShowForm(true)
  }

  async function simpan() {
    if (!form.nim.trim()) { setFormError('NIM harus diisi.'); return }
    if (!form.nama.trim()) { setFormError('Nama harus diisi.'); return }
    setSaving(true); setFormError('')
    try {
      if (editingNim) {
        await supabase.from('mahasiswa').update({
          nama: form.nama.trim(), prodi: form.prodi, minat: form.minat,
          kelas: form.kelas, angkatan: form.angkatan, is_active: form.is_active,
        }).eq('nim', editingNim)
      } else {
        await supabase.from('mahasiswa').insert({
          nim: form.nim.trim(), nama: form.nama.trim(), prodi: form.prodi,
          minat: form.minat, kelas: form.kelas, angkatan: form.angkatan, is_active: form.is_active,
        })
      }
      setShowForm(false); loadData()
    } catch (e: any) { setFormError(e.message || 'Gagal menyimpan.') }
    finally { setSaving(false) }
  }

  async function toggleAktif(nim: string, val: boolean) {
    await supabase.from('mahasiswa').update({ is_active: val }).eq('nim', nim)
    loadData()
  }

  async function hapus(nim: string, nama: string) {
    if (!confirm(`Hapus mahasiswa ${nama} (${nim})?`)) return
    await supabase.from('mahasiswa').delete().eq('nim', nim)
    loadData()
  }

  const angkatanList = Array.from(new Set(list.map(m => m.angkatan))).sort()
  const filtered = list.filter(m => {
    const s = search.toLowerCase()
    return (
      (m.nim.toLowerCase().includes(s) || m.nama.toLowerCase().includes(s)) &&
      (filterProdi === 'semua' || m.prodi === filterProdi) &&
      (filterMinat === 'semua' || m.minat === filterMinat) &&
      (filterAngkatan === 'semua' || m.angkatan === parseInt(filterAngkatan))
    )
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Data Mahasiswa</h1>
          <p className="text-sm text-gray-400">{list.length} mahasiswa terdaftar</p>
        </div>
        <div className="flex gap-2">
          <a href="/admin/import" className="btn-secondary text-sm px-4 py-2.5">📥 Import CSV</a>
          <button onClick={bukaFormBaru} className="btn-primary text-sm px-4 py-2.5">+ Tambah</button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        <input className="input-field text-sm flex-1 min-w-[160px]" placeholder="Cari NIM atau nama..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input-field text-sm w-36" value={filterProdi} onChange={e => { setFilterProdi(e.target.value); setFilterMinat('semua') }}>
          <option value="semua">Semua Prodi</option>
          <option value="agroteknologi">Agroteknologi</option>
          <option value="agribisnis">Agribisnis</option>
        </select>
        <select className="input-field text-sm w-32" value={filterMinat} onChange={e => setFilterMinat(e.target.value)}>
          <option value="semua">Semua Minat</option>
          {(filterProdi === 'semua' ? ['spks','antan','smbp','sea','spa'] : MINAT_BY_PRODI[filterProdi] || []).map(m => (
            <option key={m} value={m}>{m.toUpperCase()}</option>
          ))}
        </select>
        <select className="input-field text-sm w-32" value={filterAngkatan} onChange={e => setFilterAngkatan(e.target.value)}>
          <option value="semua">Semua Angkatan</option>
          {angkatanList.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Tabel */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat data...</div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['NIM','Nama','Prodi','Minat','Kelas','Angkatan','Status','Aksi'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">Tidak ada data.</td></tr>
                ) : filtered.map(m => (
                  <tr key={m.nim} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-700">{m.nim}</td>
                    <td className="px-4 py-3 font-medium text-gray-800">{m.nama}</td>
                    <td className="px-4 py-3 text-gray-500 capitalize text-xs">{m.prodi}</td>
                    <td className="px-4 py-3"><span className="uppercase text-xs font-bold text-primary-600">{m.minat}</span></td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">{m.kelas}</td>
                    <td className="px-4 py-3 text-gray-500">{m.angkatan}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleAktif(m.nim, !m.is_active)}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {m.is_active ? 'Aktif' : 'Nonaktif'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button onClick={() => bukaFormEdit(m)} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                        <button onClick={() => hapus(m.nim, m.nama)} className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Hapus</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            Menampilkan {filtered.length} dari {list.length} mahasiswa
          </div>
        </div>
      )}

      {/* Modal form */}
      {showForm && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{editingNim ? 'Edit Mahasiswa' : 'Tambah Mahasiswa'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 text-xl">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">NIM *</label>
                <input className="input-field text-sm" placeholder="Contoh: 2025001" value={form.nim}
                  onChange={e => setForm(p => ({ ...p, nim: e.target.value }))}
                  disabled={!!editingNim} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nama Lengkap *</label>
                <input className="input-field text-sm" placeholder="Nama mahasiswa" value={form.nama}
                  onChange={e => setForm(p => ({ ...p, nama: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prodi</label>
                <select className="input-field text-sm" value={form.prodi}
                  onChange={e => setForm(p => ({ ...p, prodi: e.target.value, minat: MINAT_BY_PRODI[e.target.value][0] }))}>
                  <option value="agroteknologi">Agroteknologi</option>
                  <option value="agribisnis">Agribisnis</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Minat</label>
                <select className="input-field text-sm" value={form.minat}
                  onChange={e => setForm(p => ({ ...p, minat: e.target.value }))}>
                  {(MINAT_BY_PRODI[form.prodi] || []).map(m => (
                    <option key={m} value={m}>{m.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Kelas</label>
                <select className="input-field text-sm" value={form.kelas}
                  onChange={e => setForm(p => ({ ...p, kelas: e.target.value }))}>
                  {['A','B','C','D'].map(k => <option key={k} value={k}>Kelas {k}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Angkatan</label>
                <input type="number" className="input-field text-sm" value={form.angkatan}
                  onChange={e => setForm(p => ({ ...p, angkatan: parseInt(e.target.value) || 2025 }))} />
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
