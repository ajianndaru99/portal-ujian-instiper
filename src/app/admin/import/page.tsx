'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

const TEMPLATE_SOAL = {
  headers: ['ujian_id', 'nomor_urut', 'pertanyaan', 'tipe', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci_jawaban', 'bobot_nilai'],
  contoh: [
    ['UUID-UJIAN', '1', 'Apa itu fotosintesis?', 'pg', 'Proses respirasi', 'Proses pembuatan makanan', 'Proses pembelahan', 'Proses penyerapan', 'B', '20'],
    ['UUID-UJIAN', '2', 'Jelaskan pertanian berkelanjutan!', 'esai', '', '', '', '', '', '20'],
  ],
  info: 'tipe: pg/esai | kunci_jawaban: A/B/C/D (kosongkan untuk esai) | opsi_a-d: kosongkan untuk esai',
}

function downloadTemplate() {
  const t = TEMPLATE_SOAL
  const rows = [t.headers, ...t.contoh]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `template_soal.csv`
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

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(parseCSV(e.target?.result as string).slice(0, 6))
    reader.readAsText(f, 'utf-8')
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
                .map((o, idx) => o?.trim() ? `${['A','B','C','D'][idx]}. ${o.trim()}` : null)
                .filter(Boolean)
            : null

          await supabase.from('soal').insert({
            ujian_id, nomor_urut, pertanyaan, tipe,
            opsi_jawaban: opsiArr ? JSON.stringify(opsiArr) : null,
            kunci_jawaban: tipe === 'pg' ? kunci || null : null,
            bobot_nilai: bobot,
          })
          res.success++
        } catch (err: any) {
          res.failed++
          res.errors.push(`Baris ${rowNum}: ${err.message}`)
        }
      }
      setResult(res)
      setImporting(false)
    }
    reader.readAsText(file, 'utf-8')
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Soal</h1>
        <p className="text-sm text-gray-400">
          Upload file CSV untuk menambah data soal secara massal. Atau gunakan konversi dari Google Form / Microsoft Word.
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

      {/* MODE CSV — Soal */}
      <div className="card bg-blue-50 border-blue-200 space-y-2">
        <p className="text-sm font-semibold text-blue-700">Format CSV — Soal</p>
        <p className="text-xs text-blue-600 font-mono break-all">{TEMPLATE_SOAL.headers.join(', ')}</p>
        <p className="text-xs text-blue-500">{TEMPLATE_SOAL.info}</p>
        <button onClick={downloadTemplate} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">
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
          ) : `📥 Import Soal sekarang`}
        </button>
      )}

      {result && (
        <button onClick={() => { setFile(null); setPreview([]); setResult(null); if (fileRef.current) fileRef.current.value = '' }}
          className="btn-secondary w-full">
          Upload File Lagi
        </button>
      )}
    </div>
  )
}