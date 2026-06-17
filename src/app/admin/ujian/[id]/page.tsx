'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface Soal {
  id: string
  nomor_urut: number
  pertanyaan: string
  tipe: 'pg' | 'esai'
  opsi_jawaban: string[] | null
  kunci_jawaban: string | null
  bobot_nilai: number
}

interface UjianDetail {
  id: string
  judul: string
  kode_ujian: string
  status: string
  durasi_menit: number
  prodi_target: string
  minat_target: string[]
  kelas_target: string[] | null
  angkatan_target: number[] | null
  acak_soal: boolean
  mata_kuliah: { nama_matkul: string } | null
}

/**
 * Parse opsi_jawaban dengan aman. Kolom ini bertipe JSONB di database,
 * jadi Supabase biasanya sudah mengembalikannya sebagai array. Namun
 * untuk berjaga-jaga jika suatu saat tersimpan sebagai string JSON
 * (misalnya dari proses import lama), fungsi ini menangani keduanya.
 */
function parseOpsiJawaban(raw: unknown): string[] | null {
  if (!raw) return null
  if (Array.isArray(raw)) return raw as string[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }
  return null
}

const EMPTY_SOAL = {
  pertanyaan: '',
  tipe: 'pg' as 'pg' | 'esai',
  opsi: ['', '', '', ''],
  kunci: 'A',
  bobot: 20,
}

export default function UjianDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [ujian, setUjian] = useState<UjianDetail | null>(null)
  const [soalList, setSoalList] = useState<Soal[]>([])
  const [loading, setLoading] = useState(true)

  // Form tambah/edit soal
  const [showForm, setShowForm] = useState(false)
  const [editingSoalId, setEditingSoalId] = useState<string | null>(null)
  const [formSoal, setFormSoal] = useState({ ...EMPTY_SOAL })
  const [savingSoal, setSavingSoal] = useState(false)
  const [formError, setFormError] = useState('')

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from('ujian').select('*, mata_kuliah(nama_matkul)').eq('id', id).single(),
      supabase.from('soal').select('*').eq('ujian_id', id).order('nomor_urut'),
    ])
    setUjian(u)
    const normalized = (s || []).map((soal: any) => ({
      ...soal,
      opsi_jawaban: parseOpsiJawaban(soal.opsi_jawaban),
    }))
    setSoalList(normalized)
    setLoading(false)
  }

  function bukaFormBaru() {
    setEditingSoalId(null)
    setFormSoal({ ...EMPTY_SOAL })
    setFormError('')
    setShowForm(true)
  }

  function bukaFormEdit(soal: Soal) {
    setEditingSoalId(soal.id)
    setFormSoal({
      pertanyaan: soal.pertanyaan,
      tipe: soal.tipe,
      opsi: soal.opsi_jawaban ? [...soal.opsi_jawaban, '', '', '', ''].slice(0, 4) : ['', '', '', ''],
      kunci: soal.kunci_jawaban || 'A',
      bobot: soal.bobot_nilai,
    })
    setFormError('')
    setShowForm(true)
  }

  async function simpanSoal() {
    if (!formSoal.pertanyaan.trim()) { setFormError('Pertanyaan harus diisi.'); return }
    if (formSoal.tipe === 'pg') {
      const filled = formSoal.opsi.filter(o => o.trim())
      if (filled.length < 2) { setFormError('Minimal 2 pilihan jawaban harus diisi.'); return }
    }
    setSavingSoal(true)
    setFormError('')

    try {
      const nomor = editingSoalId
        ? soalList.find(s => s.id === editingSoalId)?.nomor_urut || 1
        : (soalList.length > 0 ? Math.max(...soalList.map(s => s.nomor_urut)) + 1 : 1)

      const opsiLabels = ['A', 'B', 'C', 'D']
      const opsiData = formSoal.tipe === 'pg'
        ? formSoal.opsi
            .map((o, i) => o.trim() ? `${opsiLabels[i]}. ${o.trim()}` : null)
            .filter(Boolean)
        : null

      const payload = {
        ujian_id: id,
        nomor_urut: nomor,
        pertanyaan: formSoal.pertanyaan.trim(),
        tipe: formSoal.tipe,
        opsi_jawaban: opsiData ? JSON.stringify(opsiData) : null,
        kunci_jawaban: formSoal.tipe === 'pg' ? formSoal.kunci : null,
        bobot_nilai: formSoal.bobot,
      }

      if (editingSoalId) {
        await supabase.from('soal').update(payload).eq('id', editingSoalId)
      } else {
        await supabase.from('soal').insert(payload)
      }

      setShowForm(false)
      loadData()
    } catch (e: any) {
      setFormError(e.message || 'Gagal menyimpan soal.')
    } finally {
      setSavingSoal(false)
    }
  }

  async function hapusSoal(soalId: string, nomor: number) {
    if (!confirm(`Hapus soal nomor ${nomor}?`)) return
    await supabase.from('soal').delete().eq('id', soalId)
    loadData()
  }

  async function ubahStatus(status: string) {
    await supabase.from('ujian').update({ status }).eq('id', id)
    loadData()
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Memuat...</div>
  if (!ujian) return <div className="text-center py-12 text-gray-400">Ujian tidak ditemukan.</div>

  const totalBobot = soalList.reduce((s, q) => s + q.bobot_nilai, 0)

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 mt-1">←</button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{ujian.judul}</h1>
          <p className="text-sm text-gray-400">{ujian.mata_kuliah?.nama_matkul} · {ujian.durasi_menit} menit</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {ujian.status === 'draft' && (
            <button onClick={() => ubahStatus('aktif')} className="btn-primary text-sm px-4 py-2">
              ▶ Aktifkan
            </button>
          )}
          {ujian.status === 'aktif' && (
            <button onClick={() => ubahStatus('selesai')} className="btn-secondary text-sm px-4 py-2">
              ⏹ Selesaikan
            </button>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="card bg-gray-50 border-gray-200">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <p className="text-gray-400 text-xs">Kode Ujian</p>
            <p className="font-mono font-bold text-gray-800 text-lg">{ujian.kode_ujian}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Status</p>
            <p className="font-semibold text-gray-800 capitalize">{ujian.status}</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Total Soal</p>
            <p className="font-semibold text-gray-800">{soalList.length} soal</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">Total Bobot</p>
            <p className={`font-semibold ${totalBobot === 100 ? 'text-green-600' : 'text-amber-600'}`}>
              {totalBobot}/100
            </p>
          </div>
        </div>
        {ujian.kelas_target && (
          <p className="text-xs text-gray-400 mt-3">
            Target: {ujian.prodi_target} · {ujian.minat_target.join(', ')} · Kelas {ujian.kelas_target.join(',')} · Angkatan {ujian.angkatan_target?.join(',')}
          </p>
        )}
        {totalBobot !== 100 && soalList.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">⚠️ Total bobot belum 100. Sesuaikan bobot soal agar total = 100.</p>
        )}
      </div>

      {/* Daftar soal */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Daftar Soal</h2>
          <button onClick={bukaFormBaru} className="btn-primary text-sm px-4 py-2">
            + Tambah Soal
          </button>
        </div>

        {soalList.length === 0 ? (
          <div className="card text-center py-10">
            <p className="text-gray-400 text-sm">Belum ada soal. Klik "Tambah Soal" untuk mulai.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {soalList.map((soal, idx) => (
              <div key={soal.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-7 h-7 bg-primary-100 text-primary-700 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        soal.tipe === 'pg' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {soal.tipe === 'pg' ? 'PG' : 'Esai'}
                      </span>
                      <span className="text-xs text-gray-400">Bobot: {soal.bobot_nilai}</span>
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed">{soal.pertanyaan}</p>
                    {soal.tipe === 'pg' && soal.opsi_jawaban && (
                      <div className="mt-2 space-y-1">
                        {soal.opsi_jawaban.map((opsi, i) => {
                          const huruf = opsi.charAt(0)
                          const benar = huruf === soal.kunci_jawaban
                          return (
                            <p key={i} className={`text-xs ${benar ? 'text-green-600 font-semibold' : 'text-gray-500'}`}>
                              {benar ? '✓ ' : '  '}{opsi}
                            </p>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => bukaFormEdit(soal)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => hapusSoal(soal.id, soal.nomor_urut)}
                      className="text-xs px-2.5 py-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal form soal */}
      {showForm && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{editingSoalId ? 'Edit Soal' : 'Tambah Soal'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {/* Tipe */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tipe Soal</label>
              <div className="flex gap-3">
                {(['pg', 'esai'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setFormSoal(p => ({ ...p, tipe: t }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                      formSoal.tipe === t
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500'
                    }`}
                  >
                    {t === 'pg' ? 'Pilihan Ganda' : 'Esai'}
                  </button>
                ))}
              </div>
            </div>

            {/* Pertanyaan */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Pertanyaan *</label>
              <textarea
                className="input-field text-sm min-h-[100px] resize-none"
                placeholder="Tulis pertanyaan di sini..."
                value={formSoal.pertanyaan}
                onChange={e => setFormSoal(p => ({ ...p, pertanyaan: e.target.value }))}
              />
            </div>

            {/* Pilihan ganda */}
            {formSoal.tipe === 'pg' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Pilihan Jawaban *</label>
                {['A', 'B', 'C', 'D'].map((huruf, i) => (
                  <div key={huruf} className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                      formSoal.kunci === huruf ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>{huruf}</span>
                    <input
                      className="input-field text-sm flex-1 py-2"
                      placeholder={`Pilihan ${huruf}`}
                      value={formSoal.opsi[i]}
                      onChange={e => {
                        const opsi = [...formSoal.opsi]
                        opsi[i] = e.target.value
                        setFormSoal(p => ({ ...p, opsi }))
                      }}
                    />
                    <button
                      onClick={() => setFormSoal(p => ({ ...p, kunci: huruf }))}
                      className={`text-xs px-2 py-1.5 rounded-lg font-medium flex-shrink-0 ${
                        formSoal.kunci === huruf
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'
                      }`}
                    >
                      ✓
                    </button>
                  </div>
                ))}
                <p className="text-xs text-gray-400">Klik ✓ pada pilihan yang benar sebagai kunci jawaban.</p>
              </div>
            )}

            {/* Bobot */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Bobot Nilai</label>
              <input
                type="number"
                className="input-field text-sm"
                min={1} max={100}
                value={formSoal.bobot}
                onChange={e => setFormSoal(p => ({ ...p, bobot: parseInt(e.target.value) || 10 }))}
              />
              <p className="text-xs text-gray-400 mt-1">Total bobot semua soal harus = 100</p>
            </div>

            {formError && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">⚠️ {formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={simpanSoal} disabled={savingSoal} className="btn-primary flex-1">
                {savingSoal ? 'Menyimpan...' : editingSoalId ? 'Simpan Perubahan' : 'Tambah Soal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
