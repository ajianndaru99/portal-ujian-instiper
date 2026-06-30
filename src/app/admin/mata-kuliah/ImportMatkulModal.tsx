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

const TEMPLATE_MATKUL = {
  headers: ['kode_matkul', 'nama_matkul', 'kode_dosen', 'prodi', 'sks'],
  contoh: [
    ['AGT201', 'Teknologi Budidaya Kelapa Sawit', 'DSN001', 'agroteknologi', '3'],
    ['AGB301', 'Manajemen Risiko Agribisnis', 'DSN002', 'agribisnis', '3'],
  ],
  info: 'kode_dosen harus sudah terdaftar di menu Dosen | prodi: agroteknologi/agribisnis | sks: angka 1-6',
}

function downloadTemplate() {
  const t = TEMPLATE_MATKUL
  const rows = [t.headers, ...t.contoh]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template_matkul.csv`
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

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function ImportMatkulModal({ onClose, onSuccess }: Props) {
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
        setExcelRows(parseExcelGeneric(workbook, TEMPLATE_MATKUL.headers))
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

      const parsed = dataRows.map(row => ({
        kode_matkul: row[headers.indexOf('kode_matkul')] || '',
        nama_matkul: row[headers.indexOf('nama_matkul')] || '',
        kode_dosen: row[headers.indexOf('kode_dosen')] || '',
        prodi: row[headers.indexOf('prodi')] || '',
        sks: row[headers.indexOf('sks')] || '3',
      }))
      
      setResult(await importMatkulRows(parsed))
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

  const adaPerubahan = result !== null || excelResult !== null

  return (
    <div className="overlay animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Import Mata Kuliah</h3>
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
              <p className="text-sm font-semibold text-blue-700">Format Excel — Mata Kuliah</p>
              <p className="text-xs text-blue-600 font-mono break-all">{TEMPLATE_MATKUL.headers.join(', ')}</p>
              <p className="text-xs text-blue-500">{TEMPLATE_MATKUL.info}</p>
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
                <p className="text-sm text-amber-700">⚠️ Tidak ada baris data terdeteksi atau format salah.</p>
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
                {excelImporting ? 'Mengimport...' : `📥 Import ${excelRows.length} mata kuliah`}
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
              <p className="text-sm font-semibold text-blue-700">Format CSV — Mata Kuliah</p>
              <p className="text-xs text-blue-600 font-mono break-all">{TEMPLATE_MATKUL.headers.join(', ')}</p>
              <p className="text-xs text-blue-500">{TEMPLATE_MATKUL.info}</p>
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
                {importing ? 'Mengimport...' : '📥 Import Mata Kuliah Sekarang'}
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
