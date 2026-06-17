'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UjianOption {
  id: string
  judul: string
  kode_ujian: string
  status: string
}

type Mode = 'kuis' | 'sheets'

// ============================================================
// MODE: KUIS LANGSUNG (baca struktur form dari link viewform)
// ============================================================

interface ParsedQuestion {
  title: string
  type: 'pg' | 'esai' | 'lainnya'
  options: string[]
}

interface SoalDraft extends ParsedQuestion {
  include: boolean
  kunci: string // '' jika belum dipilih / esai
  bobot: number
}

function KuisLangsungPanel({ ujianList, selectedUjian, setSelectedUjian }: {
  ujianList: UjianOption[]
  selectedUjian: string
  setSelectedUjian: (v: string) => void
}) {
  const [formUrl, setFormUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [drafts, setDrafts] = useState<SoalDraft[]>([])
  const [warning, setWarning] = useState('')
  const [existingMaxNomor, setExistingMaxNomor] = useState(0)

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)

  async function handleAmbilForm() {
    if (!formUrl.trim()) { setFetchError('Masukkan link Google Form terlebih dahulu.'); return }
    if (!selectedUjian) { setFetchError('Pilih ujian tujuan terlebih dahulu.'); return }

    setFetching(true); setFetchError(''); setResult(null); setDrafts([])

    try {
      // Cek nomor urut tertinggi yang sudah ada di ujian ini agar tidak konflik
      const { data: soalExist } = await supabase
        .from('soal')
        .select('nomor_urut')
        .eq('ujian_id', selectedUjian)
        .order('nomor_urut', { ascending: false })
        .limit(1)
      setExistingMaxNomor(soalExist?.[0]?.nomor_urut || 0)

      const res = await fetch(`/api/google-form-structure?url=${encodeURIComponent(formUrl.trim())}`)
      const json = await res.json()
      if (!res.ok) { setFetchError(json.error || 'Gagal mengambil data form.'); setFetching(false); return }

      setFormTitle(json.title)
      setWarning(json.warning || '')
      const initialDrafts: SoalDraft[] = json.questions.map((q: ParsedQuestion) => ({
        ...q,
        include: q.type === 'pg' || q.type === 'esai',
        kunci: '',
        bobot: 10,
      }))
      setDrafts(initialDrafts)
    } catch (err) {
      console.error(err)
      setFetchError('Terjadi kesalahan saat memproses form.')
    } finally {
      setFetching(false)
    }
  }

  function updateDraft(idx: number, patch: Partial<SoalDraft>) {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, ...patch } : d))
  }

  const includedDrafts = drafts.filter(d => d.include)
  const totalBobot = includedDrafts.reduce((s, d) => s + (d.bobot || 0), 0)
  const belumPilihKunci = includedDrafts.filter(d => d.type === 'pg' && !d.kunci).length

  async function handleImport() {
    if (!selectedUjian) { alert('Pilih ujian tujuan terlebih dahulu.'); return }
    if (includedDrafts.length === 0) { alert('Tidak ada soal yang dipilih untuk diimpor.'); return }

    setImporting(true)
    const res = { success: 0, failed: 0, errors: [] as string[] }

    for (let i = 0; i < includedDrafts.length; i++) {
      const d = includedDrafts[i]
      try {
        const opsiArr = d.type === 'pg'
          ? d.options.map((o, idx) => `${['A','B','C','D','E','F'][idx] || idx + 1}. ${o}`)
          : null

        const { error } = await supabase.from('soal').insert({
          ujian_id: selectedUjian,
          nomor_urut: existingMaxNomor + i + 1,
          pertanyaan: d.title,
          tipe: d.type === 'pg' ? 'pg' : 'esai',
          opsi_jawaban: opsiArr ? JSON.stringify(opsiArr) : null,
          kunci_jawaban: d.type === 'pg' ? (d.kunci || null) : null,
          bobot_nilai: d.bobot || 10,
        })
        if (error) throw error
        res.success++
      } catch (e: any) {
        res.failed++
        res.errors.push(`Soal "${d.title.substring(0, 30)}...": ${e.message || 'Gagal menyimpan'}`)
      }
    }

    setResult(res)
    setImporting(false)
  }

  function reset() {
    setFormUrl(''); setFetchError(''); setFormTitle(''); setDrafts([]); setResult(null); setWarning('')
  }

  if (result) {
    return (
      <div className="space-y-4">
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
          <button onClick={reset} className="btn-secondary flex-1">Import Form Lain</button>
          {selectedUjian && (
            <a href={`/admin/ujian/${selectedUjian}`} className="btn-primary flex-1 text-center">Lihat & Edit Soal →</a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Cara akses */}
      <details className="card bg-amber-50 border-amber-200">
        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
          💡 Cara mendapatkan link yang benar
        </summary>
        <div className="mt-3 space-y-2 text-xs text-amber-700">
          <p>1. Buka Google Form kuis yang sudah dibuat dosen (form yang soal-soalnya mau diambil)</p>
          <p>2. Klik tombol <strong>Send</strong> (kanan atas) → pilih ikon <strong>link 🔗</strong> → klik <strong>Copy</strong></p>
          <p>3. Paste link tersebut di bawah ini. Link harus berbentuk <code className="bg-amber-100 px-1 rounded">.../forms/d/e/.../viewform</code>, bukan link yang ada <code className="bg-amber-100 px-1 rounded">/edit</code></p>
          <p className="text-amber-600">⚠️ Kunci jawaban tidak ikut terbaca otomatis — kamu akan diminta memilihnya manual untuk tiap soal pilihan ganda setelah soal berhasil diambil.</p>
        </div>
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

      {/* Link form */}
      <div className="card space-y-3">
        <label className="block text-sm font-semibold text-gray-700">2. Link Google Form (Kuis Dosen)</label>
        <input
          className="input-field text-sm"
          placeholder="https://docs.google.com/forms/d/e/.../viewform"
          value={formUrl}
          onChange={e => setFormUrl(e.target.value)}
        />
        {fetchError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-red-700 text-sm">⚠️ {fetchError}</p>
          </div>
        )}
        <button onClick={handleAmbilForm} disabled={fetching} className="btn-primary w-full">
          {fetching ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Membaca form...
            </span>
          ) : 'Ambil Soal dari Form →'}
        </button>
      </div>

      {/* Hasil parsing */}
      {drafts.length > 0 && (
        <>
          <div className="card bg-blue-50 border-blue-200">
            <p className="text-sm text-blue-700">
              ✅ Ditemukan <strong>{drafts.length} pertanyaan</strong> dari form "<strong>{formTitle}</strong>".
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
                      <p className="text-sm font-medium text-gray-800">{d.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                        d.type === 'pg' ? 'bg-blue-50 text-blue-600' : d.type === 'esai' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {d.type === 'pg' ? 'Pilihan Ganda' : d.type === 'esai' ? 'Esai' : 'Tidak didukung'}
                      </span>
                    </div>

                    {d.type === 'pg' && d.options.length > 0 && (
                      <div className="space-y-1.5">
                        {d.options.map((opt, oi) => {
                          const huruf = ['A','B','C','D','E','F'][oi] || String(oi + 1)
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

// ============================================================
// MODE: SHEETS (mapping kolom manual, untuk form pendataan soal)
// ============================================================

interface FieldDef {
  key: string
  label: string
  required: boolean
  keywords: string[]
}

const FIELDS: FieldDef[] = [
  { key: 'nomor_urut',   label: 'Nomor Urut Soal', required: false, keywords: ['nomor', 'urut', 'no.', 'no '] },
  { key: 'pertanyaan',   label: 'Pertanyaan / Soal', required: true,  keywords: ['pertanyaan', 'soal', 'question'] },
  { key: 'tipe',         label: 'Tipe Soal (PG/Esai)', required: true,  keywords: ['tipe', 'jenis soal', 'jenis'] },
  { key: 'opsi_a',       label: 'Pilihan A', required: false, keywords: ['pilihan a', 'opsi a', 'jawaban a'] },
  { key: 'opsi_b',       label: 'Pilihan B', required: false, keywords: ['pilihan b', 'opsi b', 'jawaban b'] },
  { key: 'opsi_c',       label: 'Pilihan C', required: false, keywords: ['pilihan c', 'opsi c', 'jawaban c'] },
  { key: 'opsi_d',       label: 'Pilihan D', required: false, keywords: ['pilihan d', 'opsi d', 'jawaban d'] },
  { key: 'kunci_jawaban',label: 'Kunci Jawaban', required: false, keywords: ['kunci', 'jawaban benar'] },
  { key: 'bobot_nilai',  label: 'Bobot Nilai', required: false, keywords: ['bobot', 'nilai', 'poin', 'skor'] },
]

const PANDUAN_PERTANYAAN = [
  { no: 1, judul: 'Nomor Urut Soal', tipe: 'Jawaban singkat', catatan: 'Boleh dikosongkan' },
  { no: 2, judul: 'Pertanyaan', tipe: 'Paragraf', catatan: 'Wajib diisi' },
  { no: 3, judul: 'Tipe Soal', tipe: 'Pilihan ganda: Pilihan Ganda / Esai', catatan: 'Wajib diisi' },
  { no: 4, judul: 'Pilihan A-D', tipe: 'Jawaban singkat', catatan: 'Kosongkan jika Esai' },
  { no: 8, judul: 'Kunci Jawaban', tipe: 'A / B / C / D', catatan: 'Kosongkan jika Esai' },
  { no: 9, judul: 'Bobot Nilai', tipe: 'Jawaban singkat', catatan: 'Total semua soal sebaiknya = 100' },
]

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuote) {
      if (ch === '"' && next === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuote = false }
      else cur += ch
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && next === '\n') i++
        row.push(cur); cur = ''
        if (row.some(c => c.trim() !== '')) rows.push(row)
        row = []
      } else cur += ch
    }
  }
  if (cur !== '' || row.length > 0) { row.push(cur); if (row.some(c => c.trim() !== '')) rows.push(row) }
  return rows
}

function autoMatch(headers: string[], field: FieldDef): number {
  const lower = headers.map(h => h.toLowerCase())
  for (const kw of field.keywords) {
    const idx = lower.findIndex(h => h.includes(kw))
    if (idx !== -1) return idx
  }
  return -1
}

function normalizeTipe(v: string): 'pg' | 'esai' {
  const s = (v || '').toLowerCase()
  if (s.includes('esai') || s.includes('essay')) return 'esai'
  return 'pg'
}

function normalizeKunci(v: string, tipe: 'pg' | 'esai'): string | null {
  if (tipe !== 'pg') return null
  const t = (v || '').trim().toUpperCase()
  if (t.startsWith('A') || t.startsWith('B') || t.startsWith('C') || t.startsWith('D')) return t[0]
  return null
}

function SheetsPanel({ ujianList, selectedUjian, setSelectedUjian }: {
  ujianList: UjianOption[]
  selectedUjian: string
  setSelectedUjian: (v: string) => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [sheetUrl, setSheetUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')

  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Record<string, number>>({})

  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [existingMaxNomor, setExistingMaxNomor] = useState(0)

  async function handleAmbilData() {
    if (!sheetUrl.trim()) { setFetchError('Masukkan link Google Sheets terlebih dahulu.'); return }
    if (!selectedUjian) { setFetchError('Pilih ujian tujuan terlebih dahulu.'); return }
    setFetching(true); setFetchError(''); setResult(null)

    try {
      const res = await fetch(`/api/sheet-csv?url=${encodeURIComponent(sheetUrl.trim())}`)
      const json = await res.json()
      if (!res.ok) { setFetchError(json.error || 'Gagal mengambil data.'); setFetching(false); return }

      const parsed = parseCSV(json.csv)
      if (parsed.length < 2) { setFetchError('Data sheet kosong atau hanya berisi header.'); setFetching(false); return }

      const hdrs = parsed[0].map((h: string) => h.trim())
      const dataRows = parsed.slice(1).filter(r => r.some(c => c.trim() !== ''))

      const autoMap: Record<string, number> = {}
      FIELDS.forEach(f => { autoMap[f.key] = autoMatch(hdrs, f) })

      if (selectedUjian) {
        const { data: soalExist } = await supabase.from('soal').select('nomor_urut').eq('ujian_id', selectedUjian).order('nomor_urut', { ascending: false }).limit(1)
        setExistingMaxNomor(soalExist?.[0]?.nomor_urut || 0)
      }

      setHeaders(hdrs)
      setRows(dataRows)
      setMapping(autoMap)
      setStep(2)
    } catch (err) {
      console.error(err)
      setFetchError('Terjadi kesalahan saat memproses data.')
    } finally {
      setFetching(false)
    }
  }

  function buildSoalFromRow(row: string[], idx: number) {
    const get = (key: string) => mapping[key] !== undefined && mapping[key] >= 0 ? (row[mapping[key]] || '').trim() : ''
    const tipe = normalizeTipe(get('tipe'))
    const nomorStr = get('nomor_urut')
    const nomor_urut = nomorStr && !isNaN(parseInt(nomorStr)) ? parseInt(nomorStr) : existingMaxNomor + idx + 1
    const opsiRaw = [get('opsi_a'), get('opsi_b'), get('opsi_c'), get('opsi_d')]
    const opsiArr = tipe === 'pg' ? opsiRaw.map((o, i) => o ? `${['A','B','C','D'][i]}. ${o}` : null).filter(Boolean) as string[] : null
    const bobotStr = get('bobot_nilai')
    const bobot_nilai = bobotStr && !isNaN(parseInt(bobotStr)) ? parseInt(bobotStr) : 10
    return {
      ujian_id: selectedUjian, nomor_urut, pertanyaan: get('pertanyaan'), tipe,
      opsi_jawaban: opsiArr && opsiArr.length > 0 ? JSON.stringify(opsiArr) : null,
      kunci_jawaban: normalizeKunci(get('kunci_jawaban'), tipe), bobot_nilai,
    }
  }

  async function handleImport() {
    if (!selectedUjian) { alert('Pilih ujian tujuan terlebih dahulu.'); return }
    if (mapping['pertanyaan'] === undefined || mapping['pertanyaan'] < 0) { alert('Kolom "Pertanyaan" wajib dipetakan.'); return }
    if (mapping['tipe'] === undefined || mapping['tipe'] < 0) { alert('Kolom "Tipe Soal" wajib dipetakan.'); return }

    setImporting(true)
    const res = { success: 0, failed: 0, errors: [] as string[] }
    for (let i = 0; i < rows.length; i++) {
      try {
        const soal = buildSoalFromRow(rows[i], i)
        if (!soal.pertanyaan) throw new Error('Pertanyaan kosong')
        const { error } = await supabase.from('soal').insert(soal)
        if (error) throw error
        res.success++
      } catch (e: any) {
        res.failed++
        res.errors.push(`Baris ${i + 2}: ${e.message || 'Gagal menyimpan'}`)
      }
    }
    setResult(res); setImporting(false); setStep(3)
  }

  function reset() {
    setStep(1); setHeaders([]); setRows([]); setMapping({}); setResult(null); setSheetUrl(''); setFetchError('')
  }

  const previewRows = rows.slice(0, 5)

  return (
    <div className="space-y-5">
      <details className="card bg-amber-50 border-amber-200">
        <summary className="text-sm font-semibold text-amber-700 cursor-pointer">
          📋 Panduan: Struktur Google Form (untuk dosen input data soal)
        </summary>
        <div className="mt-3 space-y-2">
          <p className="text-xs text-amber-700">
            Gunakan ini jika dosen mengisi form khusus untuk <strong>mendata soal</strong> (bukan kuis interaktif). Tiap submit form = satu soal.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-amber-100">
                <tr>
                  <th className="px-2 py-1.5 text-left font-semibold text-amber-800">No</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-amber-800">Judul</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-amber-800">Tipe Field</th>
                  <th className="px-2 py-1.5 text-left font-semibold text-amber-800">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {PANDUAN_PERTANYAAN.map(p => (
                  <tr key={p.no}>
                    <td className="px-2 py-1.5 text-amber-700">{p.no}</td>
                    <td className="px-2 py-1.5 font-medium text-amber-800">{p.judul}</td>
                    <td className="px-2 py-1.5 text-amber-700">{p.tipe}</td>
                    <td className="px-2 py-1.5 text-amber-600">{p.catatan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-amber-600">
            Buka tab Responses di Form → klik ikon Sheets hijau → di Sheets klik Share → "Siapa saja yang memiliki link" (Viewer) → copy link sheet.
          </p>
        </div>
      </details>

      {step === 1 && (
        <>
          <div className="card space-y-3">
            <label className="block text-sm font-semibold text-gray-700">1. Pilih Ujian Tujuan</label>
            <select className="input-field text-sm" value={selectedUjian} onChange={e => setSelectedUjian(e.target.value)}>
              <option value="">-- Pilih ujian --</option>
              {ujianList.map(u => (
                <option key={u.id} value={u.id}>[{u.status.toUpperCase()}] {u.judul} — {u.kode_ujian}</option>
              ))}
            </select>
          </div>

          <div className="card space-y-3">
            <label className="block text-sm font-semibold text-gray-700">2. Link Google Sheets (Jawaban Form)</label>
            <input
              className="input-field text-sm"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
            />
            <p className="text-xs text-gray-400">Pastikan sheet dibagikan dengan akses "Siapa saja yang memiliki link".</p>
            {fetchError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-red-700 text-sm">⚠️ {fetchError}</p>
              </div>
            )}
            <button onClick={handleAmbilData} disabled={fetching} className="btn-primary w-full">
              {fetching ? 'Mengambil data...' : 'Ambil Data dari Sheet →'}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="card bg-green-50 border-green-200">
            <p className="text-sm text-green-700">
              ✅ Ditemukan <strong>{rows.length} baris data</strong>. Cocokkan kolom di bawah ini.
            </p>
          </div>

          <div className="card space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">Cocokkan Kolom</h2>
            <div className="space-y-2.5">
              {FIELDS.map(f => (
                <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm text-gray-600">{f.label} {f.required && <span className="text-red-500">*</span>}</label>
                  <select className="input-field text-sm py-2" value={mapping[f.key] ?? -1}
                    onChange={e => setMapping(prev => ({ ...prev, [f.key]: parseInt(e.target.value) }))}>
                    <option value={-1}>-- Tidak digunakan --</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `Kolom ${i + 1}`}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">Preview (5 dari {rows.length})</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>{['No','Pertanyaan','Tipe','A','B','C','D','Kunci','Bobot'].map(h => <th key={h} className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {previewRows.map((row, i) => {
                    const s = buildSoalFromRow(row, i)
                    const opsi: string[] = s.opsi_jawaban ? JSON.parse(s.opsi_jawaban) : []
                    return (
                      <tr key={i}>
                        <td className="px-2 py-2 text-gray-500">{s.nomor_urut}</td>
                        <td className="px-2 py-2 text-gray-700 max-w-[180px] truncate">{s.pertanyaan || <span className="text-red-400">(kosong)</span>}</td>
                        <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${s.tipe === 'pg' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{s.tipe}</span></td>
                        {[0,1,2,3].map(idx => <td key={idx} className="px-2 py-2 text-gray-500 max-w-[100px] truncate">{opsi[idx] ? opsi[idx].substring(3) : '—'}</td>)}
                        <td className="px-2 py-2 text-center font-bold text-gray-700">{s.kunci_jawaban || '—'}</td>
                        <td className="px-2 py-2 text-center text-gray-500">{s.bobot_nilai}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3 pb-4">
            <button onClick={reset} className="btn-secondary flex-1">← Kembali</button>
            <button onClick={handleImport} disabled={importing} className="btn-primary flex-1">
              {importing ? 'Mengimpor...' : `Import ${rows.length} Soal →`}
            </button>
          </div>
        </>
      )}

      {step === 3 && result && (
        <>
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
            <button onClick={reset} className="btn-secondary flex-1">Import Lagi</button>
            {selectedUjian && <a href={`/admin/ujian/${selectedUjian}`} className="btn-primary flex-1 text-center">Lihat & Edit Soal →</a>}
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================
// HALAMAN UTAMA
// ============================================================

export default function ImportGoogleFormPage() {
  const [mode, setMode] = useState<Mode>('kuis')
  const [ujianList, setUjianList] = useState<UjianOption[]>([])
  const [selectedUjian, setSelectedUjian] = useState('')
  const [loaded, setLoaded] = useState(false)

  if (!loaded) {
    supabase.from('ujian').select('id, judul, kode_ujian, status').order('created_at', { ascending: false })
      .then(({ data }) => { setUjianList(data || []); setLoaded(true) })
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Soal dari Google Form</h1>
        <p className="text-sm text-gray-400">Ambil soal langsung dari Google Form, tanpa input ulang manual</p>
      </div>

      {/* Tab mode */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('kuis')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'kuis' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🎯 Form Kuis Dosen
        </button>
        <button
          onClick={() => setMode('sheets')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${mode === 'sheets' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          📊 Form Pendataan (Sheets)
        </button>
      </div>

      <div className="card bg-blue-50 border-blue-200">
        <p className="text-xs text-blue-700">
          {mode === 'kuis'
            ? 'Gunakan ini jika dosen sudah punya Google Form kuis (mahasiswa pilih A/B/C/D langsung di form). Soal & pilihan diambil otomatis dari link form — kunci jawaban dipilih manual.'
            : 'Gunakan ini jika dosen mengisi form khusus untuk mendata soal satu per satu (form berisi pertanyaan: "Pertanyaan", "Tipe Soal", dst).'}
        </p>
      </div>

      {mode === 'kuis' ? (
        <KuisLangsungPanel ujianList={ujianList} selectedUjian={selectedUjian} setSelectedUjian={setSelectedUjian} />
      ) : (
        <SheetsPanel ujianList={ujianList} selectedUjian={selectedUjian} setSelectedUjian={setSelectedUjian} />
      )}
    </div>
  )
}
