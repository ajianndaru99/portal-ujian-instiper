'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface UjianOption {
  id: string
  judul: string
  kode_ujian: string
  status: string
}

interface ParsedSoal {
  pertanyaan: string
  tipe: 'pg' | 'esai'
  opsi: string[]
}

interface SoalDraft extends ParsedSoal {
  include: boolean
  kunci: string // '' jika belum dipilih / esai
  bobot: number
}

export default function ImportWordSoalPage() {
  const [ujianList, setUjianList] = useState<UjianOption[]>([])
  const [selectedUjian, setSelectedUjian] = useState('')
  const [loaded, setLoaded] = useState(false)

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [warning, setWarning] = useState('')
  const [drafts, setDrafts] = useState<SoalDraft[]>([])
  const [existingMaxNomor, setExistingMaxNomor] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

  if (!loaded) {
    supabase.from('ujian').select('id, judul, kode_ujian, status').order('created_at', { ascending: false })
      .then(({ data }) => { setUjianList(data || []); setLoaded(true) })
  }

  function handleFileChange(f: File) {
    setFile(f)
    setUploadError('')
    setResult(null)
    setDrafts([])
  }

  async function handleUpload() {
    if (!file) { setUploadError('Pilih file Word (.docx) terlebih dahulu.'); return }
    if (!selectedUjian) { setUploadError('Pilih ujian tujuan terlebih dahulu.'); return }

    setUploading(true)
    setUploadError('')
    setResult(null)

    try {
      // Cek nomor urut tertinggi yang sudah ada di ujian ini agar tidak konflik
      const { data: soalExist } = await supabase
        .from('soal')
        .select('nomor_urut')
        .eq('ujian_id', selectedUjian)
        .order('nomor_urut', { ascending: false })
        .limit(1)
      setExistingMaxNomor(soalExist?.[0]?.nomor_urut || 0)

      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/word-soal-structure', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok) {
        setUploadError(json.error || 'Gagal memproses file Word.')
        setUploading(false)
        return
      }

      setWarning(json.warning || '')
      const initialDrafts: SoalDraft[] = json.questions.map((q: ParsedSoal) => ({
        ...q,
        include: true,
        kunci: '',
        bobot: 10,
      }))
      setDrafts(initialDrafts)
    } catch (err) {
      console.error(err)
      setUploadError('Terjadi kesalahan saat memproses file.')
    } finally {
      setUploading(false)
    }
  }

  function updateDraft(idx: number, patch: Partial<SoalDraft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  const includedDrafts = drafts.filter(d => d.include)
  const totalBobot = includedDrafts.reduce((s, d) => s + (d.bobot || 0), 0)
  const belumPilihKunci = includedDrafts.filter(d => d.tipe === 'pg' && !d.kunci).length

  async function handleImport() {
    if (!selectedUjian) { alert('Pilih ujian tujuan terlebih dahulu.'); return }
    if (includedDrafts.length === 0) { alert('Tidak ada soal yang dipilih untuk diimpor.'); return }

    setImporting(true)
    const res = { success: 0, failed: 0, errors: [] as string[] }

    for (let i = 0; i < includedDrafts.length; i++) {
      const d = includedDrafts[i]
      try {
        const opsiArr = d.tipe === 'pg'
          ? d.opsi.map((o, idx) => `${String.fromCharCode(65 + idx)}. ${o}`)
          : null

        const { error } = await supabase.from('soal').insert({
          ujian_id: selectedUjian,
          nomor_urut: existingMaxNomor + i + 1,
          pertanyaan: d.pertanyaan,
          tipe: d.tipe,
          opsi_jawaban: opsiArr ? JSON.stringify(opsiArr) : null,
          kunci_jawaban: d.tipe === 'pg' ? (d.kunci || null) : null,
          bobot_nilai: d.bobot || 10,
        })
        if (error) throw error
        res.success++
      } catch (e: any) {
        res.failed++
        res.errors.push(`Soal "${d.pertanyaan.substring(0, 30)}...": ${e.message || 'Gagal menyimpan'}`)
      }
    }

    setResult(res)
    setImporting(false)
  }

  function reset() {
    setFile(null)
    setUploadError('')
    setWarning('')
    setDrafts([])
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (result) {
    return (
      <div className="max-w-2xl space-y-5">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Import Soal dari Word</h1>
          <p className="text-sm text-gray-400">Hasil import</p>
        </div>
        <div className={`card ${result.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="font-semibold text-sm mb-2">Hasil Import</p>
          <p className="text-sm">✅ Berhasil: <strong>{result.success}</strong> soal</p>
          {result.failed > 0 && <p className="text-sm">❌ Gagal: <strong>{result.failed}</strong> soal</p>}
          {result.errors.length > 0 && (
            <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
              {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>)}
            </div>
          )}
        </div>
        <div className="flex gap-3 pb-4">
          <button onClick={reset} className="btn-secondary flex-1">Import File Lain</button>
          {selectedUjian && (
            <a href={`/admin/ujian/${selectedUjian}`} className="btn-primary flex-1 text-center">Lihat & Edit Soal →</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Soal dari Word</h1>
        <p className="text-sm text-gray-400">Untuk soal yang dikirim dosen dalam format dokumen Word (.docx)</p>
      </div>

      {/* Panduan & template */}
      <details className="card bg-amber-50 border-amber-200" open>
        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
          💡 Cara mendapatkan file Word yang bisa dibaca sistem
        </summary>
        <div className="mt-3 space-y-2 text-xs text-amber-700">
          <p>1. Unduh template Word resmi di bawah ini, lalu bagikan ke dosen untuk diisi.</p>
          <p>2. Dosen menulis pertanyaan dan pilihan jawaban <strong>menggunakan format yang sudah disediakan di template</strong> (jangan ketik angka/huruf secara manual).</p>
          <p>3. Soal pilihan ganda otomatis dikenali dari adanya pilihan A-D di bawah pertanyaan. Soal tanpa pilihan jawaban otomatis dikenali sebagai esai.</p>
          <p className="text-amber-600">⚠️ Kunci jawaban tidak ikut terbaca otomatis dari file Word — pilih manual untuk tiap soal pilihan ganda setelah file berhasil dibaca sistem.</p>
          <p className="text-amber-600">⚠️ Jika file dosen tidak mengikuti format template (misalnya angka diketik manual, bukan numbering Word), sistem tidak akan bisa membaca soal secara otomatis. Gunakan menu <strong>Tambah Soal</strong> di halaman ujian untuk input manual sebagai alternatif.</p>
        </div>
        <a
          href="/templates/template_soal.docx"
          download
          className="inline-flex items-center gap-1.5 mt-3 text-xs font-semibold text-amber-700 hover:text-amber-900 underline"
        >
          ↓ Download Template Word
        </a>
      </details>

      {/* Pilih ujian */}
      <div className="card space-y-3">
        <label className="block text-sm font-semibold text-gray-700">1. Pilih Ujian Tujuan</label>
        <select className="input-field text-sm" value={selectedUjian} onChange={e => setSelectedUjian(e.target.value)}>
          <option value="">-- Pilih ujian --</option>
          {ujianList.map(u => (
            <option key={u.id} value={u.id}>[{u.status.toUpperCase()}] {u.judul} — {u.kode_ujian}</option>
          ))}
        </select>
      </div>

      {/* Upload file */}
      <div className="card space-y-3">
        <label className="block text-sm font-semibold text-gray-700">2. Upload File Word dari Dosen</label>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            file ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
          }`}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileChange(f) }}
        >
          <input
            ref={fileRef} type="file" accept=".docx" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileChange(f) }}
          />
          {file ? (
            <div>
              <p className="text-2xl mb-2">📄</p>
              <p className="font-semibold text-primary-700 text-sm">{file.name}</p>
              <p className="text-xs text-gray-400 mt-1">Klik untuk ganti file</p>
            </div>
          ) : (
            <div>
              <p className="text-3xl mb-2">📥</p>
              <p className="text-sm text-gray-500">Drag & drop file Word (.docx) di sini</p>
              <p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p>
            </div>
          )}
        </div>

        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-700 text-sm">⚠️ {uploadError}</p>
          </div>
        )}

        {file && drafts.length === 0 && (
          <button onClick={handleUpload} disabled={uploading} className="btn-primary w-full">
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Membaca file...
              </span>
            ) : 'Baca Soal dari File →'}
          </button>
        )}
      </div>

      {/* Hasil parsing */}
      {drafts.length > 0 && (
        <>
          <div className="card bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700">
              ✅ Ditemukan <strong>{drafts.length} soal</strong> dari file "<strong>{file?.name}</strong>".
            </p>
            {warning && <p className="text-xs text-blue-600 mt-1">⚠️ {warning}</p>}
          </div>

          <div className="space-y-3">
            {drafts.map((d, i) => (
              <div key={i} className={`card ${!d.include ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary-600 mt-1"
                    checked={d.include}
                    onChange={e => updateDraft(i, { include: e.target.checked })}
                  />
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-800">{d.pertanyaan}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        d.tipe === 'pg' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                      }`}>
                        {d.tipe === 'pg' ? 'Pilihan Ganda' : 'Esai'}
                      </span>
                    </div>

                    {d.tipe === 'pg' && d.opsi.length > 0 && (
                      <div className="space-y-1.5">
                        {d.opsi.map((opt, oi) => {
                          const huruf = String.fromCharCode(65 + oi)
                          return (
                            <button
                              key={oi}
                              onClick={() => updateDraft(i, { kunci: huruf })}
                              disabled={!d.include}
                              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
                                d.kunci === huruf ? 'border-green-400 bg-green-50' : 'border-gray-100 bg-gray-50 hover:border-gray-200'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                d.kunci === huruf ? 'bg-green-500 text-white' : 'bg-white border border-gray-300 text-gray-500'
                              }`}>{huruf}</span>
                              <span className="text-gray-700">{opt}</span>
                            </button>
                          )
                        })}
                        {!d.kunci && (
                          <p className="text-xs text-amber-600">⚠️ Pilih kunci jawaban yang benar di atas</p>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Bobot:</label>
                      <input
                        type="number"
                        className="input-field text-xs py-1 px-2 w-20"
                        value={d.bobot}
                        onChange={e => updateDraft(i, { bobot: parseInt(e.target.value) || 0 })}
                        disabled={!d.include}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary & import */}
          <div className="card bg-gray-50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Soal dipilih</span>
              <span className="font-semibold text-gray-800">{includedDrafts.length} soal</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total bobot</span>
              <span className={`font-semibold ${totalBobot === 100 ? 'text-green-600' : 'text-amber-600'}`}>{totalBobot}/100</span>
            </div>
            {belumPilihKunci > 0 && (
              <p className="text-xs text-amber-600">⚠️ {belumPilihKunci} soal pilihan ganda belum dipilih kunci jawabannya</p>
            )}
          </div>

          <button onClick={handleImport} disabled={importing} className="btn-primary w-full">
            {importing ? 'Mengimpor...' : `Import ${includedDrafts.length} Soal Terpilih →`}
          </button>
        </>
      )}
    </div>
  )
}
