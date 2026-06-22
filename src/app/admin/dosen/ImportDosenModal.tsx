'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseExcelGeneric } from '@/lib/excel-utils'

type Mode = 'csv' | 'excel'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

const TEMPLATE_HEADERS = ['kode_dosen', 'nama', 'email']
const TEMPLATE_CONTOH = [
  ['DSN001', 'Dr. Ahmad Fauzan, M.Sc.', 'ahmad@instiper.ac.id'],
  ['DSN002', 'Dr. Sri Wahyuni, S.P., M.Si.', 'sri@instiper.ac.id'],
]

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_CONTOH]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_dosen.csv'
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

async function importDosenRows(rows: { kode_dosen: string; nama: string; email: string }[]): Promise<ImportResult> {
  const res: ImportResult = { success: 0, failed: 0, errors: [] }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2
    try {
      if (!row.kode_dosen || !row.nama) throw new Error('Kolom wajib kosong')
      await supabase.from('dosen').upsert(
        { kode_dosen: row.kode_dosen, nama: row.nama, email: row.email || null, is_active: true },
        { onConflict: 'kode_dosen' }
      )
      res.success++
    } catch (e: any) {
      res.failed++
      res.errors.push(`Baris ${rowNum}: ${e.message}`)
    }
  }
  return res
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function ImportDosenModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('csv')

  // CSV
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Excel
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
        setExcelRows(parseExcelGeneric(workbook, TEMPLATE_HEADERS))
      } catch (err) {
        console.error(err)
        setExcelRows([])
      }
    }
    reader.readAsBinaryString(f)
  }

  async function handleImport() {
    if (!file) return
    setImporting(true); setResult(null)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const rows = parseCSV(e.target?.result as string)
      const headers = rows[0].map(h => h.toLowerCase().trim())
      const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()))
      const parsed = dataRows.map(row => ({
        kode_dosen: row[headers.indexOf('kode_dosen')] || '',
        nama: row[headers.indexOf('nama')] || '',
        email: row[headers.indexOf('email')] || '',
      }))
      setResult(await importDosenRows(parsed))
      setImporting(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function handleExcelImport() {
    if (excelRows.length === 0) return
    setExcelImporting(true); setExcelResult(null)
    const parsed = excelRows.map(r => ({ kode_dosen: r.kode_dosen, nama: r.nama, email: r.email }))
    setExcelResult(await importDosenRows(parsed))
    setExcelImporting(false)
  }

  const adaPerubahan = result !== null || excelResult !== null

  return (
    <div className="overlay animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Import Data Dosen</h3>
          <button onClick={() => { if (adaPerubahan) onSuccess(); else onClose() }} className="text-gray-400 text-xl">×</button>
        </div>

        {/* Sub-tab mode */}
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

        {/* ===== MODE EXCEL ===== */}
        {mode === 'excel' && (
          <>
            <div className="card bg-blue-50 border-blue-200 space-y-2">
              <p className="text-sm font-semibold text-blue-700">Format Excel — Dosen</p>
              <p className="text-xs text-blue-600">
                Gunakan urutan kolom yang sama seperti template CSV (<span className="font-mono">{TEMPLATE_HEADERS.join(', ')}</span>),
                simpan sebagai <span className="font-mono">.xlsx</span>. Baris header boleh tidak persis di baris pertama
                (misal ada judul di atasnya) — sistem akan mencarinya otomatis.
              </p>
              <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">↓ Download contoh format (CSV)</button>
            </div>

            <div
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${excelFile ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}
              onClick={() => excelFileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f) }}
            >
              <input ref={excelFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f) }} />
              {excelFile ? (
                <div><p className="text-2xl mb-2">📊</p><p className="font-semibold text-primary-700 text-sm">{excelFile.name}</p><p className="text-xs text-gray-400 mt-1">Klik untuk ganti file</p></div>
              ) : (
                <div><p className="text-3xl mb-2">📥</p><p className="text-sm text-gray-500">Drag & drop file Excel (.xlsx)</p><p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p></div>
              )}
            </div>

            {excelFile && excelRows.length === 0 && !excelResult && (
              <div className="card bg-amber-50 border-amber-200">
                <p className="text-sm text-amber-700">⚠️ Baris header tidak terdeteksi. Pastikan ada baris berisi nama kolom: {TEMPLATE_HEADERS.join(', ')}.</p>
              </div>
            )}

            {excelRows.length > 0 && !excelResult && (
              <div className="card p-0 overflow-hidden">
                <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
                  Terdeteksi {excelRows.length} dosen — Preview (5 baris pertama)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      {TEMPLATE_HEADERS.map(h => <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {excelRows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{TEMPLATE_HEADERS.map(h => <td key={h} className="px-3 py-2 text-gray-700">{row[h] || '—'}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {excelRows.length > 5 && (
                  <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">...dan {excelRows.length - 5} dosen lainnya</p>
                )}
              </div>
            )}

            {excelResult && (
              <div className={`card ${excelResult.failed === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="font-semibold text-sm mb-2">Hasil Import</p>
                <p className="text-sm">✅ Berhasil: <strong>{excelResult.success}</strong> baris</p>
                {excelResult.failed > 0 && <p className="text-sm">❌ Gagal: <strong>{excelResult.failed}</strong> baris</p>}
                {excelResult.errors.length > 0 && (
                  <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                    {excelResult.errors.map((e, i) => <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            {excelRows.length > 0 && !excelResult && (
              <button onClick={handleExcelImport} disabled={excelImporting} className="btn-primary w-full">
                {excelImporting ? 'Mengimport...' : `📥 Import ${excelRows.length} dosen sekarang`}
              </button>
            )}
            {excelResult && (
              <button onClick={onSuccess} className="btn-primary w-full">Selesai & Tutup</button>
            )}
          </>
        )}

        {/* ===== MODE CSV ===== */}
        {mode === 'csv' && (
          <>
            <div className="card bg-blue-50 border-blue-200 space-y-2">
              <p className="text-sm font-semibold text-blue-700">Format CSV — Dosen</p>
              <p className="text-xs text-blue-600 font-mono break-all">{TEMPLATE_HEADERS.join(', ')}</p>
              <p className="text-xs text-blue-500">email bersifat opsional (boleh dikosongkan)</p>
              <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">↓ Download template CSV</button>
            </div>

            <div
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-colors ${file ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <input ref={fileRef} type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              {file ? (
                <div><p className="text-2xl mb-2">📄</p><p className="font-semibold text-primary-700 text-sm">{file.name}</p><p className="text-xs text-gray-400 mt-1">Klik untuk ganti file</p></div>
              ) : (
                <div><p className="text-3xl mb-2">📥</p><p className="text-sm text-gray-500">Drag & drop file CSV</p><p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p></div>
              )}
            </div>

            {preview.length > 0 && (
              <div className="card p-0 overflow-hidden">
                <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">Preview (5 baris pertama)</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      {preview[0].map((h, i) => <th key={i} className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {preview.slice(1).map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j} className="px-3 py-2 text-gray-700 max-w-[150px] truncate">{cell || '—'}</td>)}</tr>
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
                  <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                    {result.errors.map((e, i) => <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{e}</p>)}
                  </div>
                )}
              </div>
            )}

            {file && !result && (
              <button onClick={handleImport} disabled={importing} className="btn-primary w-full">
                {importing ? 'Mengimport...' : '📥 Import Dosen Sekarang'}
              </button>
            )}
            {result && (
              <button onClick={onSuccess} className="btn-primary w-full">Selesai & Tutup</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}