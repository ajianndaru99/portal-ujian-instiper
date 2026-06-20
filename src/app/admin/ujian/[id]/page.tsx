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

interface MatkulOption { id: string; kode_matkul: string; nama_matkul: string; prodi: string }

interface UjianDetail {
  id: string
  judul: string
  deskripsi: string | null
  kode_ujian: string
  status: string
  durasi_menit: number
  matkul_id: string
  prodi_target: string
  minat_target: string[]
  kelas_target: string[] | null
  angkatan_target: number[] | null
  acak_soal: boolean
  acak_pilihan: boolean
  maks_pelanggaran: number
  mata_kuliah: { nama_matkul: string } | null
}

const MINAT_BY_PRODI: Record<string, string[]> = {
  agroteknologi: ['spks', 'antan'],
  agribisnis: ['smbp', 'sea', 'spa'],
}

// Kelas A-L (12 kelas). Jika ke depan kelas bertambah lagi, cukup ubah daftar ini.
const KELAS_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// Rentang angkatan: 2020 sampai tahun berjalan, urut terbaru dulu.
function buildAngkatanOptions(): string[] {
  const tahunSekarang = new Date().getFullYear()
  const tahunMulai = 2020
  const opts: string[] = []
  for (let t = tahunSekarang; t >= tahunMulai; t--) opts.push(String(t))
  return opts
}

// Label huruf untuk opsi jawaban ke- (0-indexed): A, B, C, ... Z, lalu AA, AB, dst
// jika suatu saat batas maksimum opsi dinaikkan melebihi 26.
function labelHuruf(index: number): string {
  let n = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

const MIN_OPSI = 2
const MAKS_OPSI = 10

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

// Buang prefix "A. "/"B. " dst dari teks opsi yang tersimpan, supaya form
// edit menampilkan teks polos (prefix akan ditambahkan ulang saat disimpan).
function stripPrefixOpsi(opsi: string): string {
  return opsi.replace(/^[A-Za-z]+\.\s*/, '')
}

const EMPTY_SOAL = {
  pertanyaan: '',
  tipe: 'pg' as 'pg' | 'esai',
  opsi: ['', ''] as string[],
  kunci: 'A',
  bobot: 20,
}

export default function UjianDetailPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()

  const [ujian, setUjian] = useState<UjianDetail | null>(null)
  const [soalList, setSoalList] = useState<Soal[]>([])
  const [matkulList, setMatkulList] = useState<MatkulOption[]>([])
  const [loading, setLoading] = useState(true)

  // Form tambah/edit soal
  const [showForm, setShowForm] = useState(false)
  const [editingSoalId, setEditingSoalId] = useState<string | null>(null)
  const [formSoal, setFormSoal] = useState({ ...EMPTY_SOAL })
  const [savingSoal, setSavingSoal] = useState(false)
  const [formError, setFormError] = useState('')

  // Modal edit ujian
  const [showEditUjian, setShowEditUjian] = useState(false)
  const [savingUjian, setSavingUjian] = useState(false)
  const [editUjianError, setEditUjianError] = useState('')
  const [formUjian, setFormUjian] = useState({
    matkul_id: '',
    judul: '',
    deskripsi: '',
    prodi_target: 'agroteknologi',
    minat_target: [] as string[],
    kelas_target: [] as string[],
    angkatan_target: [] as string[],
    durasi_menit: 90,
    kode_ujian: '',
    acak_soal: true,
    acak_pilihan: false,
    maks_pelanggaran: 3,
  })

  const angkatanOptions = buildAngkatanOptions()

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const [{ data: u }, { data: s }, { data: m }] = await Promise.all([
      supabase.from('ujian').select('*, mata_kuliah(nama_matkul)').eq('id', id).single(),
      supabase.from('soal').select('*').eq('ujian_id', id).order('nomor_urut'),
      supabase.from('mata_kuliah').select('id, kode_matkul, nama_matkul, prodi').eq('is_active', true).order('nama_matkul'),
    ])
    setUjian(u)
    const normalized = (s || []).map((soal: any) => ({
      ...soal,
      opsi_jawaban: parseOpsiJawaban(soal.opsi_jawaban),
    }))
    setSoalList(normalized)
    setMatkulList(m || [])
    setLoading(false)
  }

  // ============================================================
  // FORM SOAL — opsi jawaban dinamis
  // ============================================================

  function bukaFormBaru() {
    setEditingSoalId(null)
    setFormSoal({ ...EMPTY_SOAL, opsi: ['', ''] })
    setFormError('')
    setShowForm(true)
  }

  function bukaFormEdit(soal: Soal) {
    setEditingSoalId(soal.id)
    const opsiBersih = soal.opsi_jawaban
      ? soal.opsi_jawaban.map(stripPrefixOpsi)
      : ['', '']
    setFormSoal({
      pertanyaan: soal.pertanyaan,
      tipe: soal.tipe,
      opsi: opsiBersih.length >= MIN_OPSI ? opsiBersih : [...opsiBersih, ''],
      kunci: soal.kunci_jawaban || 'A',
      bobot: soal.bobot_nilai,
    })
    setFormError('')
    setShowForm(true)
  }

  function tambahOpsi() {
    setFormSoal(prev => {
      if (prev.opsi.length >= MAKS_OPSI) return prev
      return { ...prev, opsi: [...prev.opsi, ''] }
    })
  }

  function hapusOpsi(index: number) {
    setFormSoal(prev => {
      if (prev.opsi.length <= MIN_OPSI) return prev
      const hurufDihapus = labelHuruf(index)
      const opsiBaru = prev.opsi.filter((_, i) => i !== index)
      // Jika kunci jawaban yang dihapus, reset ke opsi pertama yang tersisa
      const kunciBaru = prev.kunci === hurufDihapus ? labelHuruf(0) : prev.kunci
      return { ...prev, opsi: opsiBaru, kunci: kunciBaru }
    })
  }

  function updateOpsi(index: number, value: string) {
    setFormSoal(prev => {
      const opsi = [...prev.opsi]
      opsi[index] = value
      return { ...prev, opsi }
    })
  }

  async function simpanSoal() {
    if (!formSoal.pertanyaan.trim()) { setFormError('Pertanyaan harus diisi.'); return }
    if (formSoal.tipe === 'pg') {
      const filled = formSoal.opsi.filter(o => o.trim())
      if (filled.length < MIN_OPSI) { setFormError(`Minimal ${MIN_OPSI} pilihan jawaban harus diisi.`); return }
    }
    setSavingSoal(true)
    setFormError('')

    try {
      const nomor = editingSoalId
        ? soalList.find(s => s.id === editingSoalId)?.nomor_urut || 1
        : (soalList.length > 0 ? Math.max(...soalList.map(s => s.nomor_urut)) + 1 : 1)

      const opsiData = formSoal.tipe === 'pg'
        ? formSoal.opsi
            .map((o, i) => o.trim() ? `${labelHuruf(i)}. ${o.trim()}` : null)
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

  // ============================================================
  // MODAL EDIT UJIAN
  // ============================================================

  function bukaEditUjian() {
    if (!ujian) return
    setFormUjian({
      matkul_id: ujian.matkul_id,
      judul: ujian.judul,
      deskripsi: ujian.deskripsi || '',
      prodi_target: ujian.prodi_target,
      minat_target: ujian.minat_target || [],
      kelas_target: ujian.kelas_target || [],
      angkatan_target: (ujian.angkatan_target || []).map(String),
      durasi_menit: ujian.durasi_menit,
      kode_ujian: ujian.kode_ujian,
      acak_soal: ujian.acak_soal,
      acak_pilihan: ujian.acak_pilihan,
      maks_pelanggaran: ujian.maks_pelanggaran,
    })
    setEditUjianError('')
    setShowEditUjian(true)
  }

  function toggleArrUjian(field: 'minat_target' | 'kelas_target', val: string) {
    setFormUjian(prev => {
      const arr = prev[field] as string[]
      return { ...prev, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  function toggleAngkatanUjian(val: string) {
    setFormUjian(prev => ({
      ...prev,
      angkatan_target: prev.angkatan_target.includes(val)
        ? prev.angkatan_target.filter(x => x !== val)
        : [...prev.angkatan_target, val]
    }))
  }

  async function simpanEditUjian() {
    if (!formUjian.matkul_id) { setEditUjianError('Pilih mata kuliah terlebih dahulu.'); return }
    if (!formUjian.judul.trim()) { setEditUjianError('Judul ujian harus diisi.'); return }
    if (formUjian.minat_target.length === 0) { setEditUjianError('Pilih minimal satu minat target.'); return }
    if (!formUjian.kode_ujian.trim()) { setEditUjianError('Kode ujian harus diisi.'); return }

    setSavingUjian(true)
    setEditUjianError('')

    try {
      const { error: err } = await supabase
        .from('ujian')
        .update({
          matkul_id: formUjian.matkul_id,
          judul: formUjian.judul.trim(),
          deskripsi: formUjian.deskripsi.trim() || null,
          prodi_target: formUjian.prodi_target,
          minat_target: formUjian.minat_target,
          kelas_target: formUjian.kelas_target.length > 0 ? formUjian.kelas_target : null,
          angkatan_target: formUjian.angkatan_target.length > 0
            ? formUjian.angkatan_target.map(Number)
            : null,
          durasi_menit: formUjian.durasi_menit,
          kode_ujian: formUjian.kode_ujian.toUpperCase().trim(),
          acak_soal: formUjian.acak_soal,
          acak_pilihan: formUjian.acak_pilihan,
          maks_pelanggaran: formUjian.maks_pelanggaran,
        })
        .eq('id', id)

      if (err) throw err
      setShowEditUjian(false)
      loadData()
    } catch (e: any) {
      setEditUjianError(e.message || 'Gagal menyimpan perubahan ujian.')
    } finally {
      setSavingUjian(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">Memuat...</div>
  if (!ujian) return <div className="text-center py-12 text-gray-400">Ujian tidak ditemukan.</div>

  const totalBobot = soalList.reduce((s, q) => s + q.bobot_nilai, 0)
  const minatOptionsUjian = MINAT_BY_PRODI[formUjian.prodi_target] || []

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
          <button onClick={bukaEditUjian} className="btn-secondary text-sm px-4 py-2">
            ✎ Edit
          </button>
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
                          const huruf = opsi.split('.')[0]
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

            {/* Pilihan ganda — opsi dinamis */}
            {formSoal.tipe === 'pg' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-gray-700">Pilihan Jawaban *</label>
                  <span className="text-xs text-gray-400">{formSoal.opsi.length}/{MAKS_OPSI} opsi</span>
                </div>
                {formSoal.opsi.map((nilai, i) => {
                  const huruf = labelHuruf(i)
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center flex-shrink-0 ${
                        formSoal.kunci === huruf ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>{huruf}</span>
                      <input
                        className="input-field text-sm flex-1 py-2"
                        placeholder={`Pilihan ${huruf}`}
                        value={nilai}
                        onChange={e => updateOpsi(i, e.target.value)}
                      />
                      <button
                        onClick={() => setFormSoal(p => ({ ...p, kunci: huruf }))}
                        className={`text-xs px-2 py-1.5 rounded-lg font-medium flex-shrink-0 ${
                          formSoal.kunci === huruf
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600'
                        }`}
                        title="Jadikan kunci jawaban"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => hapusOpsi(i)}
                        disabled={formSoal.opsi.length <= MIN_OPSI}
                        className="text-xs px-2 py-1.5 rounded-lg font-medium flex-shrink-0 bg-red-50 text-red-500 hover:bg-red-100 disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Hapus opsi ini"
                      >
                        🗑
                      </button>
                    </div>
                  )
                })}

                <button
                  onClick={tambahOpsi}
                  disabled={formSoal.opsi.length >= MAKS_OPSI}
                  className="w-full text-sm py-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-primary-300 hover:text-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200 disabled:hover:text-gray-500"
                >
                  + Tambah Opsi
                </button>

                <p className="text-xs text-gray-400">Klik ✓ pada pilihan yang benar sebagai kunci jawaban. Minimal {MIN_OPSI} opsi.</p>
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

      {/* Modal edit ujian */}
      {showEditUjian && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Edit Ujian</h3>
              <button onClick={() => setShowEditUjian(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mata Kuliah *</label>
              <select
                className="input-field text-sm"
                value={formUjian.matkul_id}
                onChange={e => setFormUjian(p => ({ ...p, matkul_id: e.target.value }))}
              >
                <option value="">-- Pilih Mata Kuliah --</option>
                {matkulList.map(m => (
                  <option key={m.id} value={m.id}>{m.kode_matkul} — {m.nama_matkul}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Judul Ujian *</label>
              <input
                className="input-field text-sm"
                value={formUjian.judul}
                onChange={e => setFormUjian(p => ({ ...p, judul: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Deskripsi (opsional)</label>
              <textarea
                className="input-field text-sm min-h-[70px] resize-none"
                value={formUjian.deskripsi}
                onChange={e => setFormUjian(p => ({ ...p, deskripsi: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Durasi (menit) *</label>
                <input
                  type="number"
                  className="input-field text-sm"
                  min={10} max={300}
                  value={formUjian.durasi_menit}
                  onChange={e => setFormUjian(p => ({ ...p, durasi_menit: parseInt(e.target.value) || 90 }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Maks. Pelanggaran</label>
                <input
                  type="number"
                  className="input-field text-sm"
                  min={1} max={10}
                  value={formUjian.maks_pelanggaran}
                  onChange={e => setFormUjian(p => ({ ...p, maks_pelanggaran: parseInt(e.target.value) || 3 }))}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Kode Ujian *</label>
              <input
                className="input-field text-sm font-mono tracking-widest uppercase"
                maxLength={8}
                value={formUjian.kode_ujian}
                onChange={e => setFormUjian(p => ({ ...p, kode_ujian: e.target.value.toUpperCase() }))}
              />
            </div>

            <hr className="border-gray-100" />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prodi *</label>
              <div className="flex gap-3">
                {['agroteknologi', 'agribisnis'].map(p => (
                  <button
                    key={p}
                    onClick={() => setFormUjian(prev => ({ ...prev, prodi_target: p, minat_target: [] }))}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all capitalize ${
                      formUjian.prodi_target === p
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Minat * (bisa pilih lebih dari satu)</label>
              <div className="flex flex-wrap gap-2">
                {minatOptionsUjian.map(m => (
                  <button
                    key={m}
                    onClick={() => toggleArrUjian('minat_target', m)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all uppercase ${
                      formUjian.minat_target.includes(m)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Kelas (kosongkan = semua kelas)</label>
              <div className="flex flex-wrap gap-2">
                {KELAS_OPTIONS.map(k => (
                  <button
                    key={k}
                    onClick={() => toggleArrUjian('kelas_target', k)}
                    className={`w-10 h-9 rounded-xl text-sm font-bold border-2 transition-all ${
                      formUjian.kelas_target.includes(k)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Angkatan (kosongkan = semua angkatan)</label>
              <div className="flex flex-wrap gap-2">
                {angkatanOptions.map(a => (
                  <button
                    key={a}
                    onClick={() => toggleAngkatanUjian(a)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 transition-all ${
                      formUjian.angkatan_target.includes(a)
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <hr className="border-gray-100" />

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary-600"
                checked={formUjian.acak_soal}
                onChange={e => setFormUjian(p => ({ ...p, acak_soal: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Acak urutan soal</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary-600"
                checked={formUjian.acak_pilihan}
                onChange={e => setFormUjian(p => ({ ...p, acak_pilihan: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Acak pilihan jawaban</span>
            </label>

            {editUjianError && (
              <p className="text-red-600 text-sm bg-red-50 rounded-xl px-4 py-3">⚠️ {editUjianError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowEditUjian(false)} className="btn-secondary flex-1">Batal</button>
              <button onClick={simpanEditUjian} disabled={savingUjian} className="btn-primary flex-1">
                {savingUjian ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}