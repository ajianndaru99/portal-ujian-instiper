'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

type Mode = 'csv' | 'excel'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
}

interface ExcelImportResult {
  ditambah: number
  diupdate: number
  dilewati: number
  gagal: number
  detailDilewati: { nim: string; nama: string }[]
  detailGagal: { baris: string; nim: string; alasan: string }[]
}

interface ParsedRow {
  nim: string
  nama: string
  sheet: string
}

const MINAT_BY_PRODI: Record<string, string[]> = {
  agroteknologi: ['spks', 'antan'],
  agribisnis: ['smbp', 'sea', 'spa'],
}

const TEMPLATE_HEADERS = ['nim', 'nama', 'prodi', 'minat', 'kelas', 'angkatan']
const TEMPLATE_CONTOH = [
  ['2025001', 'Ahmad Fauzi', 'agroteknologi', 'spks', 'A', '2025'],
  ['2025002', 'Siti Rahayu', 'agroteknologi', 'antan', 'B', '2025'],
  ['2025003', 'Budi Santoso', 'agribisnis', 'smbp', 'A', '2025'],
]

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS, ...TEMPLATE_CONTOH]
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'template_mahasiswa.csv'
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

/**
 * Memindai semua sheet pada workbook Excel dan mengambil baris yang
 * polanya cocok dengan data peserta: kolom No (angka), NIM (angka),
 * Nama (teks non-kosong). Cocok untuk format absensi/daftar nilai
 * resmi kampus yang punya header berulang, baris kosong, dan blok
 * tanda tangan di berbagai sheet — semua itu otomatis terlewati
 * karena tidak cocok pola di atas.
 */
function parseExcelMahasiswa(workbook: XLSX.WorkBook): ParsedRow[] {
  const hasil: ParsedRow[] = []
  const nimSudahDiambil = new Set<string>()

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    for (const row of rows) {
      if (!row || row.length < 3) continue
      const kolomNo = row[0]
      const kolomNim = row[1]
      const kolomNama = row[2]

      const noValid = typeof kolomNo === 'number' && Number.isFinite(kolomNo)
      if (!noValid) continue

      const nimNumber = typeof kolomNim === 'number' ? kolomNim : parseFloat(String(kolomNim ?? '').trim())
      if (!Number.isFinite(nimNumber)) continue
      const nim = String(Math.trunc(nimNumber))
      if (nim.length < 5) continue

      const nama = String(kolomNama ?? '').trim()
      if (!nama) continue

      if (nimSudahDiambil.has(nim)) continue
      nimSudahDiambil.add(nim)

      hasil.push({ nim, nama, sheet: sheetName })
    }
  }
  return hasil
}

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function ImportMahasiswaModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('csv')

  // CSV
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Excel
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelPreview, setExcelPreview] = useState<ParsedRow[]>([])
  const [excelImporting, setExcelImporting] = useState(false)
  const [excelResult, setExcelResult] = useState<ExcelImportResult | null>(null)
  const excelFileRef = useRef<HTMLInputElement>(null)
  const [excelForm, setExcelForm] = useState({
    prodi: 'agroteknologi', minat: 'spks', kelas: 'A',
    angkatan: new Date().getFullYear(), overwrite: false,
  })

  function handleFile(f: File) {
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(parseCSV(e.target?.result as string).slice(0, 6))
    reader.readAsText(f, 'utf-8')
  }

  function handleExcelFile(f: File) {
    setExcelFile(f); setExcelResult(null); setExcelPreview([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const workbook = XLSX.read(e.target?.result, { type: 'binary' })
        setExcelPreview(parseExcelMahasiswa(workbook))
      } catch (err) {
        console.error(err)
        setExcelPreview([])
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
      const res: ImportResult = { success: 0, failed: 0, errors: [] }

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNum = i + 2
        try {
          const nim = row[headers.indexOf('nim')]
          const nama = row[headers.indexOf('nama')]
          const prodi = row[headers.indexOf('prodi')]
          const minat = row[headers.indexOf('minat')]
          const kelas = row[headers.indexOf('kelas')] || 'A'
          const angkatan = parseInt(row[headers.indexOf('angkatan')])

          if (!nim || !nama || !prodi || !minat) throw new Error('Kolom wajib kosong')
          if (!['agroteknologi', 'agribisnis'].includes(prodi)) throw new Error(`Prodi tidak valid: ${prodi}`)
          if (!['spks','antan','smbp','sea','spa'].includes(minat)) throw new Error(`Minat tidak valid: ${minat}`)
          if (isNaN(angkatan)) throw new Error('Angkatan harus angka')

          await supabase.from('mahasiswa').upsert(
            { nim, nama, prodi, minat, kelas, angkatan, is_active: true },
            { onConflict: 'nim' }
          )
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
    if (excelPreview.length === 0) return
    setExcelImporting(true); setExcelResult(null)

    const res: ExcelImportResult = { ditambah: 0, diupdate: 0, dilewati: 0, gagal: 0, detailDilewati: [], detailGagal: [] }
    const semuaNim = excelPreview.map(r => r.nim)
    const { data: existing, error: errCek } = await supabase.from('mahasiswa').select('nim').in('nim', semuaNim)

    if (errCek) {
      res.gagal = excelPreview.length
      res.detailGagal.push({ baris: '-', nim: '-', alasan: `Gagal cek data lama: ${errCek.message}` })
      setExcelResult(res); setExcelImporting(false)
      return
    }

    const nimSudahAda = new Set((existing || []).map(r => r.nim))

    for (const row of excelPreview) {
      try {
        const sudahAda = nimSudahAda.has(row.nim)
        if (sudahAda && !excelForm.overwrite) {
          res.dilewati++
          res.detailDilewati.push({ nim: row.nim, nama: row.nama })
          continue
        }
        const payload = {
          nim: row.nim, nama: row.nama, prodi: excelForm.prodi,
          minat: excelForm.minat, kelas: excelForm.kelas,
          angkatan: excelForm.angkatan, is_active: true,
        }
        const { error } = await supabase.from('mahasiswa').upsert(payload, { onConflict: 'nim' })
        if (error) throw new Error(error.message)
        if (sudahAda) res.diupdate++; else res.ditambah++
      } catch (e: any) {
        res.gagal++
        res.detailGagal.push({ baris: row.sheet, nim: row.nim, alasan: e.message || 'Gagal menyimpan' })
      }
    }
    setExcelResult(res); setExcelImporting(false)
  }

  const adaPerubahan = result !== null || excelResult !== null

  return (
    <div className="overlay animate-fade-in" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Import Data Mahasiswa</h3>
          <button onClick={() => { if (adaPerubahan) onSuccess(); else onClose() }} className="text-gray-400 text-xl">×</button>
        </div>

        {/* Sub-tab mode */}
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button
            onClick={() => { setMode('csv'); setExcelFile(null); setExcelPreview([]); setExcelResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${mode === 'csv' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            📄 Dari CSV
          </button>
          <button
            onClick={() => { setMode('excel'); setFile(null); setPreview([]); setResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${mode === 'excel' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            📊 Dari Excel (daftar nilai/absensi)
          </button>
        </div>

        {/* ===== MODE EXCEL ===== */}
        {mode === 'excel' && (
          <>
            <div className="card bg-blue-50 border-blue-200 space-y-2">
              <p className="text-sm font-semibold text-blue-700">Format Excel — Daftar Nilai/Absensi</p>
              <p className="text-xs text-blue-600">
                Cocok untuk file rekap dari kampus (kolom No, NIM, Nama). Sistem otomatis memindai
                semua sheet dan mengambil baris berisi data peserta — header berulang, baris kosong,
                atau tanda tangan dilewati otomatis.
              </p>
              <p className="text-xs text-blue-500">
                Prodi, Minat, Kelas, Angkatan tidak ada di file ini — isi lewat form di bawah, berlaku
                untuk semua mahasiswa yang ter-import.
              </p>
            </div>

            <div className="card space-y-3">
              <p className="text-xs font-semibold text-gray-600">Atribut untuk semua mahasiswa yang di-import</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Prodi</label>
                  <select className="input-field text-sm" value={excelForm.prodi}
                    onChange={e => setExcelForm(p => ({ ...p, prodi: e.target.value, minat: MINAT_BY_PRODI[e.target.value][0] }))}>
                    <option value="agroteknologi">Agroteknologi</option>
                    <option value="agribisnis">Agribisnis</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Minat</label>
                  <select className="input-field text-sm" value={excelForm.minat}
                    onChange={e => setExcelForm(p => ({ ...p, minat: e.target.value }))}>
                    {(MINAT_BY_PRODI[excelForm.prodi] || []).map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Kelas</label>
                  <select className="input-field text-sm" value={excelForm.kelas}
                    onChange={e => setExcelForm(p => ({ ...p, kelas: e.target.value }))}>
                    {['A','B','C','D','E','F','G','H','I','J','K','L'].map(k => <option key={k} value={k}>Kelas {k}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Angkatan</label>
                  <input type="number" className="input-field text-sm" value={excelForm.angkatan}
                    onChange={e => setExcelForm(p => ({ ...p, angkatan: parseInt(e.target.value) || new Date().getFullYear() }))} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
                <input type="checkbox" checked={excelForm.overwrite}
                  onChange={e => setExcelForm(p => ({ ...p, overwrite: e.target.checked }))} />
                Timpa data mahasiswa yang NIM-nya sudah terdaftar
              </label>
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

            {excelFile && excelPreview.length === 0 && !excelResult && (
              <div className="card bg-amber-50 border-amber-200">
                <p className="text-sm text-amber-700">⚠️ Tidak ada baris data mahasiswa terdeteksi. Pastikan kolom No, NIM, Nama berurutan.</p>
              </div>
            )}

            {excelPreview.length > 0 && !excelResult && (
              <div className="card p-0 overflow-hidden">
                <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
                  Terdeteksi {excelPreview.length} mahasiswa — Preview (10 baris pertama)
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">NIM</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Nama</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Sheet</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {excelPreview.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-gray-700">{row.nim}</td>
                          <td className="px-3 py-2 text-gray-700">{row.nama}</td>
                          <td className="px-3 py-2 text-gray-400">{row.sheet}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {excelPreview.length > 10 && (
                  <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">...dan {excelPreview.length - 10} mahasiswa lainnya</p>
                )}
              </div>
            )}

            {excelResult && (
              <div className={`card ${excelResult.gagal === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                <p className="font-semibold text-sm mb-2">Hasil Import</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <p>✅ Ditambah: <strong>{excelResult.ditambah}</strong></p>
                  <p>🔄 Diupdate: <strong>{excelResult.diupdate}</strong></p>
                  <p>⏭️ Dilewati: <strong>{excelResult.dilewati}</strong></p>
                  <p>❌ Gagal: <strong>{excelResult.gagal}</strong></p>
                </div>
                {excelResult.detailDilewati.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">Dilewati (NIM sudah terdaftar)</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {excelResult.detailDilewati.map((d, i) => (
                        <p key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">{d.nim} — {d.nama}</p>
                      ))}
                    </div>
                  </div>
                )}
                {excelResult.detailGagal.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-red-500 mb-1">Gagal</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {excelResult.detailGagal.map((d, i) => (
                        <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">NIM {d.nim} ({d.baris}): {d.alasan}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {excelPreview.length > 0 && !excelResult && (
              <button onClick={handleExcelImport} disabled={excelImporting} className="btn-primary w-full">
                {excelImporting ? 'Mengimport...' : `📥 Import ${excelPreview.length} mahasiswa sekarang`}
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
              <p className="text-sm font-semibold text-blue-700">Format CSV — Mahasiswa</p>
              <p className="text-xs text-blue-600 font-mono break-all">{TEMPLATE_HEADERS.join(', ')}</p>
              <p className="text-xs text-blue-500">prodi: agroteknologi/agribisnis | minat: spks/antan/smbp/sea/spa | kelas: A/B/C/D</p>
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
                {importing ? 'Mengimport...' : '📥 Import Mahasiswa Sekarang'}
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