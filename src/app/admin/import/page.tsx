'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseExcelGeneric } from '@/lib/excel-utils'

type ImportType = 'matkul' | 'soal'
type Mode = 'csv' | 'excel'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

const TEMPLATES = {
  matkul: {
    headers: ['kode_matkul', 'nama_matkul', 'kode_dosen', 'prodi', 'sks'],
    contoh: [
      ['AGT201', 'Teknologi Budidaya Kelapa Sawit', 'DSN001', 'agroteknologi', '3'],
      ['AGB301', 'Manajemen Risiko Agribisnis', 'DSN002', 'agribisnis', '3'],
    ],
    info: 'kode_dosen harus sudah terdaftar di menu Dosen | prodi: agroteknologi/agribisnis | sks: angka 1-6',
  },
  soal: {
    headers: ['ujian_id', 'nomor_urut', 'pertanyaan', 'tipe', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci_jawaban', 'bobot_nilai'],
    contoh: [
      ['UUID-UJIAN', '1', 'Apa itu fotosintesis?', 'pg', 'Proses respirasi', 'Proses pembuatan makanan', 'Proses pembelahan', 'Proses penyerapan', 'B', '20'],
      ['UUID-UJIAN', '2', 'Jelaskan pertanian berkelanjutan!', 'esai', '', '', '', '', '', '20'],
    ],
    info: 'tipe: pg/esai | kunci_jawaban: A/B/C/D (kosongkan untuk esai) | opsi_a-d: kosongkan untuk esai',
  },
}

const TAB_LABELS: Record<ImportType, string> = {
  matkul: '📚 Mata Kuliah',
  soal: '📝 Soal',
}

function downloadTemplate(type: ImportType) {
  const t = TEMPLATES[type]
  const rows = [t.headers, ...t.contoh]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template_${type}.csv`
  a.click()
}

function parseCSV(text: string): string[][] {
  return text.trim().split('\n').map(row => {
    const cols: string[] = []
    let cur = '', inQuote = false
    for (const ch of row) {
      if (ch === '"') { inQuote = !inQuote }
      else if (ch === ',' && !inQuote) { cols.push(cur.trim()); cur = '' }
      else cur += ch
    }
    cols.push(cur.trim())
    return cols
  })
}

/** Import baris mata kuliah yang sudah dalam bentuk objek {kode_matkul, nama_matkul, kode_dosen, prodi, sks} */
async function importMatkulRows(rows: Record<string, string>[]): Promise<ImportResult> {
  const res: ImportResult = { success: 0, failed: 0, errors: [] }

  const { data: dosenList } = await supabase.from('dosen').select('id, kode_dosen')
  const dosenMap: Record<string, string> = {}
  dosenList?.forEach(d => { dosenMap[d.kode_dosen.toUpperCase()] = d.id })

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    try {
      const kode_matkul = row.kode_matkul?.toUpperCase()
      const nama_matkul = row.nama_matkul
      const kode_dosen = row.kode_dosen?.toUpperCase()
      const prodi = row.prodi
      const sks = parseInt(row.sks) || 3

      if (!kode_matkul || !nama_matkul || !kode_dosen || !prodi) throw new Error('Kolom wajib kosong')
      if (!['agroteknologi', 'agribisnis'].includes(prodi)) throw new Error(`Prodi tidak valid: ${prodi}`)

      const dosen_id = dosenMap[kode_dosen]
      if (!dosen_id) throw new Error(`Dosen dengan kode "${kode_dosen}" tidak ditemukan. Tambahkan dosen terlebih dahulu.`)

      await supabase.from('mata_kuliah').upsert(
        { kode_matkul, nama_matkul, dosen_id, prodi, sks, is_active: true },
        { onConflict: 'kode_matkul' }
      )
      res.success++
    } catch (e: any) {
      res.failed++
      res.errors.push(`Baris ${rowNum}: ${e.message}`)
    }
  }
  return res
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<ImportType>('matkul')
  const [mode, setMode] = useState<Mode>('csv')

  // CSV (matkul & soal)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Excel (khusus matkul)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelRows, setExcelRows] = useState<Record<string, string>[]>([])
  const [excelImporting, setExcelImporting] = useState(false)
  const [excelResult, setExcelResult] = useState<ImportResult | null>(null)
  const excelFileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(parseCSV(e.target?.result as string).slice(0, 6))
    reader.readAsText(f, 'utf-8')
  }

  function handleExcelFile(f: File) {
    setExcelFile(f); setExcelResult(null); setExcelRows([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' })
        setExcelRows(parseExcelGeneric(workbook, TEMPLATES.matkul.headers))
      } catch (err) {
        console.error(err)
        setExcelRows([])
      }
    }
    reader.readAsBinaryString(f)
  }

  async function handleImport() {
    if (!file) return
    setImporting(true)
    setResult(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const rows = parseCSV(e.target?.result as string)
      const headers = rows[0].map(h => h.toLowerCase().trim())
      const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()))

      if (activeTab === 'matkul') {
        const parsed = dataRows.map(row => ({
          kode_matkul: row[headers.indexOf('kode_matkul')] || '',
          nama_matkul: row[headers.indexOf('nama_matkul')] || '',
          kode_dosen: row[headers.indexOf('kode_dosen')] || '',
          prodi: row[headers.indexOf('prodi')] || '',
          sks: row[headers.indexOf('sks')] || '3',
        }))
        setResult(await importMatkulRows(parsed))
        setImporting(false)
        return
      }

      // activeTab === 'soal'
      const res: ImportResult = { success: 0, failed: 0, errors: [] }
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNum = i + 2
        try {
          const ujian_id = row[headers.indexOf('ujian_id')]
          const nomor_urut = parseInt(row[headers.indexOf('nomor_urut')])
          const pertanyaan = row[headers.indexOf('pertanyaan')]
          const tipe = row[headers.indexOf('tipe')]
          const opsi_a = row[headers.indexOf('opsi_a')]
          const opsi_b = row[headers.indexOf('opsi_b')]
          const opsi_c = row[headers.indexOf('opsi_c')]
          const opsi_d = row[headers.indexOf('opsi_d')]
          const kunci = row[headers.indexOf('kunci_jawaban')]
          const bobot = parseInt(row[headers.indexOf('bobot_nilai')]) || 10

          if (!ujian_id || !pertanyaan || !tipe) throw new Error('Kolom wajib kosong')
          if (!['pg','esai'].includes(tipe)) throw new Error(`Tipe tidak valid: ${tipe}`)

          const opsiArr = tipe === 'pg'
            ? [opsi_a, opsi_b, opsi_c, opsi_d]
                .map((o, i) => o?.trim() ? `${['A','B','C','D'][i]}. ${o.trim()}` : null)
                .filter(Boolean)
            : null

          await supabase.from('soal').insert({
            ujian_id, nomor_urut, pertanyaan, tipe,
            opsi_jawaban: opsiArr ? JSON.stringify(opsiArr) : null,
            kunci_jawaban: tipe === 'pg' ? kunci || null : null,
            bobot_nilai: bobot,
          })
          res.success++
        } catch (e: any) {
          res.failed++
          res.errors.push(`Baris ${rowNum}: ${e.message}`)
        }
      }
      setResult(res)
      setImporting(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleExcelImport() {
    if (excelRows.length === 0) return
    setExcelImporting(true); setExcelResult(null)
    setExcelResult(await importMatkulRows(excelRows))
    setExcelImporting(false)
  }

  const t = TEMPLATES[activeTab]

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Mata Kuliah & Soal</h1>
        <p className="text-sm text-gray-400">
          Upload file untuk menambah data secara massal. Import Mahasiswa &amp; Dosen kini tersedia
          langsung di halaman masing-masing.
        </p>
      </div>

      {/* Link ke konversi Google Form */}
      <a href="/admin/import-google-form" className="card bg-emerald-50 border-emerald-200 flex items-center justify-between hover:bg-emerald-100 transition-colors no-underline">
        <div>
          <p className="text-sm font-semibold text-emerald-700">📋 Import Soal dari Google Form</p>
          <p className="text-xs text-emerald-600 mt-0.5">Konversi langsung dari jawaban Google Form (Sheets) ke soal ujian</p>
        </div>
        <span className="text-emerald-600 text-lg">→</span>
      </a>

      {/* Link ke import soal dari Word */}
      <a href="/admin/import-word-soal" className="card bg-blue-50 border-blue-200 flex items-center justify-between hover:bg-blue-100 transition-colors no-underline">
        <div>
          <p className="text-sm font-semibold text-blue-700">📄 Import Soal dari Word</p>
          <p className="text-xs text-blue-600 mt-0.5">Konversi dokumen .docx (PG + esai) langsung jadi soal ujian</p>
        </div>
        <span className="text-blue-600 text-lg">→</span>
      </a>

      {/* Tab kategori data */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {(['matkul', 'soal'] as ImportType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setMode('csv'); setFile(null); setPreview([]); setResult(null); setExcelFile(null); setExcelRows([]); setExcelResult(null) }}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Sub-tab mode: CSV vs Excel — hanya untuk Mata Kuliah */}
      {activeTab === 'matkul' && (
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button
            onClick={() => { setMode('csv'); setExcelFile(null); setExcelRows([]); setExcelResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${mode === 'csv' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            📄 Dari CSV
          </button>
          <button
            onClick={() => { setMode('excel'); setFile(null); setPreview([]); setResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${mode === 'excel' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            📊 Dari Excel
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODE EXCEL — khusus Mata Kuliah, format sederhana             */}
      {/* ============================================================ */}
      {activeTab === 'matkul' && mode === 'excel' && (
        <>
          <div className="card bg-blue-50 border-blue-200 space-y-2">
            <p className="text-sm font-semibold text-blue-700">Format Excel — Mata Kuliah</p>
            <p className="text-xs text-blue-600">
              Gunakan urutan kolom yang sama seperti template CSV (<span className="font-mono">{TEMPLATES.matkul.headers.join(', ')}</span>),
              simpan sebagai <span className="font-mono">.xlsx</span>. Baris header boleh tidak persis di baris pertama —
              sistem akan mencarinya otomatis di antara 10 baris pertama.
            </p>
            <p className="text-xs text-blue-500">
              Pastikan <strong>Dosen</strong> sudah ditambahkan terlebih dahulu (lewat halaman Dosen) sebelum import Mata Kuliah.
            </p>
            <button onClick={() => downloadTemplate('matkul')} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">↓ Download contoh format (CSV)</button>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${excelFile ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}
            onClick={() => excelFileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f) }}
          >
            <input ref={excelFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f) }} />
            {excelFile ? (
              <div><p className="text-2xl mb-2">📊</p><p className="font-semibold text-primary-700 text-sm">{excelFile.name}</p><p className="text-xs text-gray-400 mt-1">Klik untuk ganti file</p></div>
            ) : (
              <div><p className="text-3xl mb-2">📥</p><p className="text-sm text-gray-500">Drag & drop file Excel (.xlsx) di sini</p><p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p></div>
            )}
          </div>

          {excelFile && excelRows.length === 0 && !excelResult && (
            <div className="card bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-700">⚠️ Baris header tidak terdeteksi. Pastikan ada baris berisi nama kolom: {TEMPLATES.matkul.headers.join(', ')}.</p>
            </div>
          )}

          {excelRows.length > 0 && !excelResult && (
            <div className="card p-0 overflow-hidden">
              <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
                Terdeteksi {excelRows.length} mata kuliah — Preview (5 baris pertama)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50"><tr>
                    {TEMPLATES.matkul.headers.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>)}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {excelRows.slice(0, 5).map((row, i) => (
                      <tr key={i}>{TEMPLATES.matkul.headers.map(h => <td key={h} className="px-3 py-2 text-gray-700">{row[h] || '—'}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {excelRows.length > 5 && (
                <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">...dan {excelRows.length - 5} mata kuliah lainnya</p>
              )}
            </div>
          )}

          {excelResult && (
            <div className={`card ${excelResult.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="font-semibold text-sm mb-2">Hasil Import</p>
              <p className="text-sm">✅ Berhasil: <strong>{excelResult.success}</strong> baris</p>
              {excelResult.failed > 0 && <p className="text-sm">❌ Gagal: <strong>{excelResult.failed}</strong> baris</p>}
              {excelResult.errors.length > 0 && (
                <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                  {excelResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>)}
                </div>
              )}
            </div>
          )}

          {excelRows.length > 0 && !excelResult && (
            <button onClick={handleExcelImport} disabled={excelImporting} className="btn-primary w-full">
              {excelImporting ? 'Mengimport...' : `📥 Import ${excelRows.length} mata kuliah sekarang`}
            </button>
          )}
          {excelResult && (
            <button onClick={() => { setExcelFile(null); setExcelRows([]); setExcelResult(null); if (excelFileRef.current) excelFileRef.current.value = '' }}
              className="btn-secondary w-full">
              Upload File Lagi
            </button>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* MODE CSV — Mata Kuliah & Soal                                  */}
      {/* ============================================================ */}
      {(activeTab !== 'matkul' || mode === 'csv') && (
        <>
          <div className="card bg-blue-50 border-blue-200 space-y-2">
            <p className="text-sm font-semibold text-blue-700">Format CSV — {TAB_LABELS[activeTab].replace(/^\S+\s/, '')}</p>
            <p className="text-xs text-blue-600 font-mono break-all">{t.headers.join(', ')}</p>
            <p className="text-xs text-blue-500">{t.info}</p>
            {activeTab === 'matkul' && (
              <p className="text-xs text-blue-500">
                Pastikan <strong>Dosen</strong> sudah ditambahkan terlebih dahulu (lewat halaman Dosen) sebelum import Mata Kuliah.
              </p>
            )}
            <button onClick={() => downloadTemplate(activeTab)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">
              ↓ Download template CSV
            </button>
          </div>

          <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              file ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          >
            <input
              ref={fileRef} type="file" accept=".csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
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
                <p className="text-sm text-gray-500">Drag & drop file CSV di sini</p>
                <p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p>
              </div>
            )}
          </div>

          {preview.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">Preview (5 baris pertama)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {preview[0].map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {preview.slice(1).map((row, i) => (
                      <tr key={i}>
                        {row.map((cell, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">{cell || '—'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className={`card ${result.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className="font-semibold text-sm mb-2">Hasil Import</p>
              <p className="text-sm">✅ Berhasil: <strong>{result.success}</strong> baris</p>
              {result.failed > 0 && <p className="text-sm">❌ Gagal: <strong>{result.failed}</strong> baris</p>}
              {result.errors.length > 0 && (
                <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {file && !result && (
            <button onClick={handleImport} disabled={importing} className="btn-primary w-full">
              {importing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Mengimport...
                </span>
              ) : `📥 Import ${TAB_LABELS[activeTab].replace(/^\S+\s/, '')} sekarang`}
            </button>
          )}

          {result && (
            <button onClick={() => { setFile(null); setPreview([]); setResult(null); if (fileRef.current) fileRef.current.value = '' }}
              className="btn-secondary w-full">
              Upload File Lagi
            </button>
          )}
        </>
      )}
    </div>
  )
}