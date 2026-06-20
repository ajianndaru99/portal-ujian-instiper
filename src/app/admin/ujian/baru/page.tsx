'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface MatkulOption { id: string; kode_matkul: string; nama_matkul: string; prodi: string }

const MINAT_BY_PRODI: Record<string, string[]> = {
  agroteknologi: ['spks', 'antan'],
  agribisnis: ['smbp', 'sea', 'spa'],
}

// Kelas A-L (12 kelas). Jika ke depan kelas bertambah lagi, cukup ubah daftar ini.
const KELAS_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']

// Rentang angkatan: 2020 sampai tahun berjalan saat ini, urut terbaru dulu
// supaya angkatan yang relevan (untuk ujian susulan dari angkatan sebelumnya
// sekalipun) selalu mudah dijangkau tanpa perlu scroll panjang.
function buildAngkatanOptions(): string[] {
  const tahunSekarang = new Date().getFullYear()
  const tahunMulai = 2020
  const opts: string[] = []
  for (let t = tahunSekarang; t >= tahunMulai; t--) opts.push(String(t))
  return opts
}

// Default saat form pertama dibuka: 3 angkatan paling baru ter-pilih otomatis,
// karena ujian sering diikuti angkatan aktif + 1-2 angkatan susulan sebelumnya.
// Admin tetap bebas menambah/mengurangi pilihan ini secara manual.
function defaultAngkatan(opsi: string[]): string[] {
  return opsi.slice(0, 3)
}

export default function BuatUjianPage() {
  const router = useRouter()
  const [matkulList, setMatkulList] = useState<MatkulOption[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const angkatanOptions = buildAngkatanOptions()

  const [form, setForm] = useState({
    matkul_id: '',
    judul: '',
    deskripsi: '',
    prodi_target: 'agroteknologi',
    minat_target: [] as string[],
    kelas_target: [] as string[],
    angkatan_target: defaultAngkatan(angkatanOptions),
    durasi_menit: 90,
    kode_ujian: '',
    status: 'draft',
    acak_soal: true,
    acak_pilihan: false,
    maks_pelanggaran: 3,
  })

  useEffect(() => { loadMatkul() }, [])

  async function loadMatkul() {
    const { data } = await supabase
      .from('mata_kuliah')
      .select('id, kode_matkul, nama_matkul, prodi')
      .eq('is_active', true)
      .order('nama_matkul')
    setMatkulList(data || [])
  }

  function toggleArr(field: 'minat_target' | 'kelas_target', val: string) {
    setForm(prev => {
      const arr = prev[field] as string[]
      return { ...prev, [field]: arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val] }
    })
  }

  function toggleAngkatan(val: string) {
    const num = parseInt(val)
    if (isNaN(num)) return
    setForm(prev => ({
      ...prev,
      angkatan_target: prev.angkatan_target.includes(val)
        ? prev.angkatan_target.filter(x => x !== val)
        : [...prev.angkatan_target, val]
    }))
  }

  // Generate kode ujian otomatis
  function generateKode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let kode = ''
    for (let i = 0; i < 6; i++) kode += chars[Math.floor(Math.random() * chars.length)]
    setForm(prev => ({ ...prev, kode_ujian: kode }))
  }

  async function handleSave() {
    if (!form.matkul_id) { setError('Pilih mata kuliah terlebih dahulu.'); return }
    if (!form.judul.trim()) { setError('Judul ujian harus diisi.'); return }
    if (form.minat_target.length === 0) { setError('Pilih minimal satu minat target.'); return }
    if (!form.kode_ujian.trim()) { setError('Kode ujian harus diisi.'); return }

    setSaving(true)
    setError('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/admin'); return }

      const { data, error: err } = await supabase
        .from('ujian')
        .insert({
          matkul_id: form.matkul_id,
          judul: form.judul.trim(),
          deskripsi: form.deskripsi.trim() || null,
          prodi_target: form.prodi_target,
          minat_target: form.minat_target,
          kelas_target: form.kelas_target.length > 0 ? form.kelas_target : null,
          angkatan_target: form.angkatan_target.length > 0
            ? form.angkatan_target.map(Number)
            : null,
          durasi_menit: form.durasi_menit,
          kode_ujian: form.kode_ujian.toUpperCase().trim(),
          status: form.status,
          acak_soal: form.acak_soal,
          acak_pilihan: form.acak_pilihan,
          maks_pelanggaran: form.maks_pelanggaran,
          created_by: session.user.id,
        })
        .select()
        .single()

      if (err) throw err
      router.push(`/admin/ujian/${data.id}`)
    } catch (e: any) {
      setError(e.message || 'Gagal menyimpan ujian.')
    } finally {
      setSaving(false)
    }
  }

  const minatOptions = MINAT_BY_PRODI[form.prodi_target] || []

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">←</button>
        <h1 className="text-xl font-bold text-gray-800">Buat Ujian Baru</h1>
      </div>

      {/* Mata kuliah */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-700">Informasi Ujian</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Mata Kuliah *</label>
          <select
            className="input-field text-sm"
            value={form.matkul_id}
            onChange={e => setForm(p => ({ ...p, matkul_id: e.target.value }))}
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
            placeholder="Contoh: UTS Dasar Agronomi 2025"
            value={form.judul}
            onChange={e => setForm(p => ({ ...p, judul: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Deskripsi (opsional)</label>
          <textarea
            className="input-field text-sm min-h-[80px] resize-none"
            placeholder="Petunjuk atau keterangan tambahan untuk mahasiswa..."
            value={form.deskripsi}
            onChange={e => setForm(p => ({ ...p, deskripsi: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Durasi (menit) *</label>
            <input
              type="number"
              className="input-field text-sm"
              min={10} max={300}
              value={form.durasi_menit}
              onChange={e => setForm(p => ({ ...p, durasi_menit: parseInt(e.target.value) || 90 }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Maks. Pelanggaran</label>
            <input
              type="number"
              className="input-field text-sm"
              min={1} max={10}
              value={form.maks_pelanggaran}
              onChange={e => setForm(p => ({ ...p, maks_pelanggaran: parseInt(e.target.value) || 3 }))}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Kode Ujian *</label>
          <div className="flex gap-2">
            <input
              className="input-field text-sm font-mono tracking-widest uppercase flex-1"
              placeholder="XXXXXX"
              maxLength={8}
              value={form.kode_ujian}
              onChange={e => setForm(p => ({ ...p, kode_ujian: e.target.value.toUpperCase() }))}
            />
            <button
              onClick={generateKode}
              className="btn-secondary text-sm px-4"
            >
              Generate
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">Kode ini yang dibagikan ke mahasiswa saat ujian berlangsung.</p>
        </div>
      </div>

      {/* Target peserta */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-700">Target Peserta</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Prodi *</label>
          <div className="flex gap-3">
            {['agroteknologi', 'agribisnis'].map(p => (
              <button
                key={p}
                onClick={() => setForm(prev => ({ ...prev, prodi_target: p, minat_target: [] }))}
                className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all capitalize ${
                  form.prodi_target === p
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
            {minatOptions.map(m => (
              <button
                key={m}
                onClick={() => toggleArr('minat_target', m)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all uppercase ${
                  form.minat_target.includes(m)
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
                onClick={() => toggleArr('kelas_target', k)}
                className={`w-12 h-10 rounded-xl text-sm font-bold border-2 transition-all ${
                  form.kelas_target.includes(k)
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          {form.kelas_target.length > 0 && (
            <button
              onClick={() => setForm(p => ({ ...p, kelas_target: [] }))}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1.5 underline"
            >
              Kosongkan pilihan kelas (= semua kelas)
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Angkatan (kosongkan = semua angkatan)
          </label>
          <p className="text-xs text-gray-400 mb-2">
            3 angkatan terbaru terpilih otomatis — sesuaikan jika ada peserta susulan dari angkatan lain.
          </p>
          <div className="flex flex-wrap gap-2">
            {angkatanOptions.map(a => (
              <button
                key={a}
                onClick={() => toggleAngkatan(a)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                  form.angkatan_target.includes(a)
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
          {form.angkatan_target.length > 0 && (
            <button
              onClick={() => setForm(p => ({ ...p, angkatan_target: [] }))}
              className="text-xs text-gray-400 hover:text-gray-600 mt-1.5 underline"
            >
              Kosongkan pilihan angkatan (= semua angkatan)
            </button>
          )}
        </div>
      </div>

      {/* Pengaturan */}
      <div className="card space-y-3">
        <h2 className="font-semibold text-gray-700">Pengaturan</h2>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary-600"
            checked={form.acak_soal}
            onChange={e => setForm(p => ({ ...p, acak_soal: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Acak urutan soal</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary-600"
            checked={form.acak_pilihan}
            onChange={e => setForm(p => ({ ...p, acak_pilihan: e.target.checked }))}
          />
          <span className="text-sm text-gray-700">Acak pilihan jawaban</span>
        </label>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Status awal</label>
          <select
            className="input-field text-sm"
            value={form.status}
            onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
          >
            <option value="draft">Draft (belum bisa diakses mahasiswa)</option>
            <option value="aktif">Aktif (langsung bisa diakses)</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-red-700 text-sm">⚠️ {error}</p>
        </div>
      )}

      <div className="flex gap-3 pb-6">
        <button onClick={() => router.back()} className="btn-secondary flex-1">Batal</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
          {saving ? 'Menyimpan...' : '✓ Simpan & Tambah Soal'}
        </button>
      </div>
    </div>
  )
}