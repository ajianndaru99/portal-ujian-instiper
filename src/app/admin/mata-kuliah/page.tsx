'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ImportMatkulModal from './ImportMatkulModal'

interface MataKuliah {
  id: string
  kode_matkul: string
  nama_matkul: string
  dosen_id: string
  prodi: string
  sks: number
  is_active: boolean
  dosen: { nama: string; kode_dosen: string } | null
}

interface DosenOption {
  id: string
  kode_dosen: string
  nama: string
}

const EMPTY_FORM = {
  kode_matkul: '',
  nama_matkul: '',
  dosen_id: '',
  prodi: 'agroteknologi',
  sks: 3,
  is_active: true,
}

export default function AdminMatkulPage() {
  const [list, setList] = useState<MataKuliah[]>([])
  const [dosenList, setDosenList] = useState<DosenOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterProdi, setFilterProdi] = useState('semua')

  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: matkul }, { data: dosen }] = await Promise.all([
      supabase
        .from('mata_kuliah')
        .select('*, dosen(nama, kode_dosen)')
        .order('prodi')
        .order('kode_matkul'),
      supabase
        .from('dosen')
        .select('id, kode_dosen, nama')
        .eq('is_active', true)
        .order('nama'),
    ])
    setList(matkul || [])
    setDosenList(dosen || [])
    setLoading(false)
  }

  function bukaFormBaru() {
    setEditingId(null)
    setForm({ ...EMPTY_FORM })
    setFormError('')
    setShowForm(true)
  }

  function bukaFormEdit(m: MataKuliah) {
    setEditingId(m.id)
    setForm({
      kode_matkul: m.kode_matkul,
      nama_matkul: m.nama_matkul,
      dosen_id: m.dosen_id,
      prodi: m.prodi,
      sks: m.sks,
      is_active: m.is_active,
    })
    setFormError('')
    setShowForm(true)
  }

  async function simpan() {
    if (!form.kode_matkul.trim()) { setFormError('Kode mata kuliah harus diisi.'); return }
    if (!form.nama_matkul.trim()) { setFormError('Nama mata kuliah harus diisi.'); return }
    if (!form.dosen_id) { setFormError('Pilih dosen pengampu.'); return }

    setSaving(true)
    setFormError('')

    try {
      const payload = {
        kode_matkul: form.kode_matkul.trim().toUpperCase(),
        nama_matkul: form.nama_matkul.trim(),
        dosen_id: form.dosen_id,
        prodi: form.prodi,
        sks: form.sks,
        is_active: form.is_active,
      }

      if (editingId) {
        const { error } = await supabase.from('mata_kuliah').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('mata_kuliah').insert(payload)
        if (error) throw error
      }

      setShowForm(false)
      loadData()
    } catch (e: any) {
      setFormError(e.message || 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  async function toggleAktif(id: string, val: boolean) {
    await supabase.from('mata_kuliah').update({ is_active: val }).eq('id', id)
    loadData()
  }

  async function hapus(id: string, nama: string) {
    if (!confirm(`Hapus mata kuliah "${nama}"?\nUjian yang menggunakan mata kuliah ini akan kehilangan referensi.`)) return
    const { error } = await supabase.from('mata_kuliah').delete().eq('id', id)
    if (error) { alert('Gagal hapus: ' + error.message); return }
    loadData()
  }

  const filtered = list.filter(m => {
    const s = search.toLowerCase()
    const matchSearch = m.nama_matkul.toLowerCase().includes(s) || m.kode_matkul.toLowerCase().includes(s)
    const matchProdi = filterProdi === 'semua' || m.prodi === filterProdi
    return matchSearch && matchProdi
  })

  const agrotekList = filtered.filter(m => m.prodi === 'agroteknologi')
  const agribisnisList = filtered.filter(m => m.prodi === 'agribisnis')

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Manajemen Mata Kuliah</h1>
          <p className="text-sm text-gray-400">{list.length} mata kuliah terdaftar</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => setShowImport(true)} className="btn-secondary text-sm px-4 py-2.5 flex-1 sm:flex-none">
            📥 Import
          </button>
          <button onClick={bukaFormBaru} className="btn-primary text-sm px-4 py-2.5 flex-1 sm:flex-none">
            + Tambah Mata Kuliah
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3">
        <input
          className="input-field text-sm flex-1 min-w-[180px]"
          placeholder="Cari nama atau kode..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="input-field text-sm w-40"
          value={filterProdi}
          onChange={e => setFilterProdi(e.target.value)}
        >
          <option value="semua">Semua Prodi</option>
          <option value="agroteknologi">Agroteknologi</option>
          <option value="agribisnis">Agribisnis</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat data...</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-400">Tidak ada data. Klik "+ Tambah Mata Kuliah" untuk mulai.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Agroteknologi */}
          {agrotekList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-3 py-1 rounded-full">
                  Agroteknologi
                </span>
                <span className="text-xs text-gray-400">{agrotekList.length} matkul</span>
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Kode', 'Nama Mata Kuliah', 'Dosen Pengampu', 'SKS', 'Status', 'Aksi'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {agrotekList.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-primary-600">{m.kode_matkul}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{m.nama_matkul}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-gray-700 text-sm">{m.dosen?.nama || '-'}</p>
                              {m.dosen?.kode_dosen && (
                                <p className="text-xs text-gray-400 font-mono">{m.dosen.kode_dosen}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.sks}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleAktif(m.id, !m.is_active)}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                m.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {m.is_active ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => bukaFormEdit(m)} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                              <button onClick={() => hapus(m.id, m.nama_matkul)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Hapus</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Agribisnis */}
          {agribisnisList.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
                  Agribisnis
                </span>
                <span className="text-xs text-gray-400">{agribisnisList.length} matkul</span>
              </div>
              <div className="card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['Kode', 'Nama Mata Kuliah', 'Dosen Pengampu', 'SKS', 'Status', 'Aksi'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {agribisnisList.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-amber-600">{m.kode_matkul}</td>
                          <td className="px-4 py-3 font-medium text-gray-800">{m.nama_matkul}</td>
                          <td className="px-4 py-3">
                            <div>
                              <p className="text-gray-700 text-sm">{m.dosen?.nama || '-'}</p>
                              {m.dosen?.kode_dosen && (
                                <p className="text-xs text-gray-400 font-mono">{m.dosen.kode_dosen}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-gray-700">{m.sks}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleAktif(m.id, !m.is_active)}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                m.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {m.is_active ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => bukaFormEdit(m)} className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">Edit</button>
                              <button onClick={() => hapus(m.id, m.nama_matkul)} className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">Hapus</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">
                {editingId ? 'Edit Mata Kuliah' : 'Tambah Mata Kuliah'}
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Kode MK *</label>
                <input
                  className="input-field text-sm uppercase"
                  placeholder="AGT101"
                  value={form.kode_matkul}
                  onChange={e => setForm(p => ({ ...p, kode_matkul: e.target.value.toUpperCase() }))}
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">SKS *</label>
                <input
                  type="number"
                  className="input-field text-sm"
                  min={1} max={6}
                  value={form.sks}
                  onChange={e => setForm(p => ({ ...p, sks: parseInt(e.target.value) || 3 }))}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nama Mata Kuliah *</label>
                <input
                  className="input-field text-sm"
                  placeholder="Contoh: Dasar Agronomi"
                  value={form.nama_matkul}
                  onChange={e => setForm(p => ({ ...p, nama_matkul: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prodi *</label>
                <select
                  className="input-field text-sm"
                  value={form.prodi}
                  onChange={e => setForm(p => ({ ...p, prodi: e.target.value }))}
                >
                  <option value="agroteknologi">Agroteknologi</option>
                  <option value="agribisnis">Agribisnis</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
                <select
                  className="input-field text-sm"
                  value={form.is_active ? 'aktif' : 'nonaktif'}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'aktif' }))}
                >
                  <option value="aktif">Aktif</option>
                  <option value="nonaktif">Nonaktif</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Dosen Pengampu *</label>
                <select
                  className="input-field text-sm"
                  value={form.dosen_id}
                  onChange={e => setForm(p => ({ ...p, dosen_id: e.target.value }))}
                >
                  <option value="">-- Pilih Dosen --</option>
                  {dosenList.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.kode_dosen} — {d.nama}
                    </option>
                  ))}
                </select>
                {dosenList.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Belum ada dosen aktif. Tambahkan dosen terlebih dahulu di menu Dosen.
                  </p>
                )}
              </div>
            </div>

            {formError && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">⚠️ {formError}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={simpan} disabled={saving} className="btn-primary flex-1">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <ImportMatkulModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); loadData() }}
        />
      )}
    </div>
  )
}
