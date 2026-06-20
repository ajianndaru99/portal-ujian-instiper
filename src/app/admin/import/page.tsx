'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

type ImportType = 'mahasiswa' | 'dosen' | 'matkul' | 'soal'
type ImportMode = 'csv' | 'excel'

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

const TEMPLATES = {
  mahasiswa: {
    headers: ['nim', 'nama', 'prodi', 'minat', 'kelas', 'angkatan'],
    contoh: [
      ['2025001', 'Ahmad Fauzi', 'agroteknologi', 'spks', 'A', '2025'],
      ['2025002', 'Siti Rahayu', 'agroteknologi', 'antan', 'B', '2025'],
      ['2025003', 'Budi Santoso', 'agribisnis', 'smbp', 'A', '2025'],
    ],
    info: 'prodi: agroteknologi/agribisnis | minat: spks/antan/smbp/sea/spa | kelas: A/B/C/D',
  },
  dosen: {
    headers: ['kode_dosen', 'nama', 'email'],
    contoh: [
      ['DSN001', 'Dr. Ahmad Fauzan, M.Sc.', 'ahmad@instiper.ac.id'],
      ['DSN002', 'Dr. Sri Wahyuni, S.P., M.Si.', 'sri@instiper.ac.id'],
    ],
    info: 'email bersifat opsional (boleh dikosongkan)',
  },
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
  mahasiswa: '🎓 Mahasiswa',
  dosen: '👨‍🏫 Dosen',
  matkul: '📚 Mata Kuliah',
  soal: '📝 Soal',
}

const MINAT_BY_PRODI: Record<string, string[]> = {
  agroteknologi: ['spks', 'antan'],
  agribisnis: ['smbp', 'sea', 'spa'],
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

      // Kolom No harus berupa angka (urutan baris)
      const noValid = typeof kolomNo === 'number' && Number.isFinite(kolomNo)
      if (!noValid) continue

      // NIM harus bisa dikonversi ke angka (boleh berasal dari sel angka atau teks angka)
      const nimNumber = typeof kolomNim === 'number' ? kolomNim : parseFloat(String(kolomNim ?? '').trim())
      if (!Number.isFinite(nimNumber)) continue
      const nim = String(Math.trunc(nimNumber))
      if (nim.length < 5) continue // saring angka pendek yang kemungkinan bukan NIM

      // Nama harus teks non-kosong
      const nama = String(kolomNama ?? '').trim()
      if (!nama) continue

      // Hindari duplikat dalam file yang sama (mis. baris ke-export dua kali)
      if (nimSudahDiambil.has(nim)) continue
      nimSudahDiambil.add(nim)

      hasil.push({ nim, nama, sheet: sheetName })
    }
  }

  return hasil
}

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<ImportType>('mahasiswa')
  const [mode, setMode] = useState<ImportMode>('csv')

  // State untuk CSV (alur lama, tidak diubah)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // State untuk Excel mahasiswa (alur baru)
  const [excelFile, setExcelFile] = useState<File | null>(null)
  const [excelPreview, setExcelPreview] = useState<ParsedRow[]>([])
  const [excelImporting, setExcelImporting] = useState(false)
  const [excelResult, setExcelResult] = useState<ExcelImportResult | null>(null)
  const excelFileRef = useRef<HTMLInputElement>(null)

  const [excelForm, setExcelForm] = useState({
    prodi: 'agroteknologi',
    minat: 'spks',
    kelas: 'A',
    angkatan: new Date().getFullYear(),
    overwrite: false,
  })

  function handleFile(f: File) {
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const rows = parseCSV(e.target?.result as string)
      setPreview(rows.slice(0, 6)) // Show header + 5 rows preview
    }
    reader.readAsText(f, 'utf-8')
  }

  function handleExcelFile(f: File) {
    setExcelFile(f); setExcelResult(null); setExcelPreview([])
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const parsed = parseExcelMahasiswa(workbook)
        setExcelPreview(parsed)
      } catch (err) {
        console.error(err)
        setExcelPreview([])
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

      const res: ImportResult = { success: 0, failed: 0, errors: [] }

      // Pre-load dosen map untuk import mata kuliah (kode_dosen -> id)
      let dosenMap: Record<string, string> = {}
      if (activeTab === 'matkul') {
        const { data: dosenList } = await supabase.from('dosen').select('id, kode_dosen')
        dosenList?.forEach(d => { dosenMap[d.kode_dosen.toUpperCase()] = d.id })
      }

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i]
        const rowNum = i + 2 // 1-indexed, skip header

        try {
          if (activeTab === 'mahasiswa') {
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

            await supabase.from('mahasiswa').upsert({ nim, nama, prodi, minat, kelas, angkatan, is_active: true }, { onConflict: 'nim' })

          } else if (activeTab === 'dosen') {
            const kode_dosen = row[headers.indexOf('kode_dosen')]
            const nama = row[headers.indexOf('nama')]
            const email = row[headers.indexOf('email')] || null

            if (!kode_dosen || !nama) throw new Error('Kolom wajib kosong')

            await supabase.from('dosen').upsert({ kode_dosen, nama, email, is_active: true }, { onConflict: 'kode_dosen' })

          } else if (activeTab === 'matkul') {
            const kode_matkul = row[headers.indexOf('kode_matkul')]?.toUpperCase()
            const nama_matkul = row[headers.indexOf('nama_matkul')]
            const kode_dosen = row[headers.indexOf('kode_dosen')]?.toUpperCase()
            const prodi = row[headers.indexOf('prodi')]
            const sks = parseInt(row[headers.indexOf('sks')]) || 3

            if (!kode_matkul || !nama_matkul || !kode_dosen || !prodi) throw new Error('Kolom wajib kosong')
            if (!['agroteknologi', 'agribisnis'].includes(prodi)) throw new Error(`Prodi tidak valid: ${prodi}`)

            const dosen_id = dosenMap[kode_dosen]
            if (!dosen_id) throw new Error(`Dosen dengan kode "${kode_dosen}" tidak ditemukan. Tambahkan dosen terlebih dahulu.`)

            await supabase.from('mata_kuliah').upsert(
              { kode_matkul, nama_matkul, dosen_id, prodi, sks, is_active: true },
              { onConflict: 'kode_matkul' }
            )

          } else if (activeTab === 'soal') {
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
          }

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
    setExcelImporting(true)
    setExcelResult(null)

    const res: ExcelImportResult = {
      ditambah: 0, diupdate: 0, dilewati: 0, gagal: 0,
      detailDilewati: [], detailGagal: [],
    }

    // Cek NIM mana saja yang sudah terdaftar, sekali query untuk semua baris
    const semuaNim = excelPreview.map(r => r.nim)
    const { data: existing, error: errCek } = await supabase
      .from('mahasiswa')
      .select('nim')
      .in('nim', semuaNim)

    if (errCek) {
      res.gagal = excelPreview.length
      res.detailGagal.push({ baris: '-', nim: '-', alasan: `Gagal cek data lama: ${errCek.message}` })
      setExcelResult(res)
      setExcelImporting(false)
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
          nim: row.nim,
          nama: row.nama,
          prodi: excelForm.prodi,
          minat: excelForm.minat,
          kelas: excelForm.kelas,
          angkatan: excelForm.angkatan,
          is_active: true,
        }

        const { error } = await supabase.from('mahasiswa').upsert(payload, { onConflict: 'nim' })
        if (error) throw new Error(error.message)

        if (sudahAda) res.diupdate++
        else res.ditambah++
      } catch (e: any) {
        res.gagal++
        res.detailGagal.push({ baris: row.sheet, nim: row.nim, alasan: e.message || 'Gagal menyimpan' })
      }
    }

    setExcelResult(res)
    setExcelImporting(false)
  }

  function resetExcelForm() {
    setExcelFile(null)
    setExcelPreview([])
    setExcelResult(null)
    if (excelFileRef.current) excelFileRef.current.value = ''
  }

  const t = TEMPLATES[activeTab]

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Data</h1>
        <p className="text-sm text-gray-400">Upload file untuk menambah data secara massal</p>
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
      <a href="/admin/import-word-soal" className="card bg-indigo-50 border-indigo-200 flex items-center justify-between hover:bg-indigo-100 transition-colors no-underline">
        <div>
          <p className="text-sm font-semibold text-indigo-700">📄 Import Soal dari Word</p>
          <p className="text-xs text-indigo-600 mt-0.5">Untuk soal yang dikirim dosen dalam format dokumen Word (.docx)</p>
        </div>
        <span className="text-indigo-600 text-lg">→</span>
      </a>

      {/* Tab kategori data */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
        {(['mahasiswa', 'dosen', 'matkul', 'soal'] as ImportType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setMode('csv'); setFile(null); setPreview([]); setResult(null) }}
            className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Sub-tab mode: CSV vs Excel — hanya untuk mahasiswa */}
      {activeTab === 'mahasiswa' && (
        <div className="flex gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button
            onClick={() => { setMode('csv'); setExcelFile(null); setExcelPreview([]); setExcelResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              mode === 'csv' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            📄 Dari CSV
          </button>
          <button
            onClick={() => { setMode('excel'); setFile(null); setPreview([]); setResult(null) }}
            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
              mode === 'excel' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            📊 Dari Excel (daftar nilai/absensi)
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODE EXCEL — khusus mahasiswa, format daftar nilai/absensi    */}
      {/* ============================================================ */}
      {activeTab === 'mahasiswa' && mode === 'excel' && (
        <>
          <div className="card bg-blue-50 border-blue-200 space-y-2">
            <p className="text-sm font-semibold text-blue-700">Format Excel — Daftar Nilai/Absensi</p>
            <p className="text-xs text-blue-600">
              Cocok untuk file rekap dari kampus (kolom No, NIM, Nama). Sistem otomatis memindai
              semua sheet dalam file dan mengambil baris yang berisi data peserta — baris header,
              kosong, atau tanda tangan akan dilewati otomatis.
            </p>
            <p className="text-xs text-blue-500">
              Prodi, Minat, Kelas, dan Angkatan tidak ada di file ini, jadi isi melalui form di bawah —
              nilainya berlaku sama untuk semua mahasiswa yang ter-import.
            </p>
          </div>

          {/* Form atribut tambahan */}
          <div className="card space-y-3">
            <p className="text-xs font-semibold text-gray-600">Atribut untuk semua mahasiswa yang di-import</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Prodi</label>
                <select
                  className="input-field text-sm"
                  value={excelForm.prodi}
                  onChange={e => setExcelForm(p => ({ ...p, prodi: e.target.value, minat: MINAT_BY_PRODI[e.target.value][0] }))}
                >
                  <option value="agroteknologi">Agroteknologi</option>
                  <option value="agribisnis">Agribisnis</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Minat</label>
                <select
                  className="input-field text-sm"
                  value={excelForm.minat}
                  onChange={e => setExcelForm(p => ({ ...p, minat: e.target.value }))}
                >
                  {(MINAT_BY_PRODI[excelForm.prodi] || []).map(m => (
                    <option key={m} value={m}>{m.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Kelas</label>
                <select
                  className="input-field text-sm"
                  value={excelForm.kelas}
                  onChange={e => setExcelForm(p => ({ ...p, kelas: e.target.value }))}
                >
                  {['A', 'B', 'C', 'D'].map(k => <option key={k} value={k}>Kelas {k}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Angkatan</label>
                <input
                  type="number"
                  className="input-field text-sm"
                  value={excelForm.angkatan}
                  onChange={e => setExcelForm(p => ({ ...p, angkatan: parseInt(e.target.value) || new Date().getFullYear() }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-600 pt-1">
              <input
                type="checkbox"
                checked={excelForm.overwrite}
                onChange={e => setExcelForm(p => ({ ...p, overwrite: e.target.checked }))}
              />
              Timpa data mahasiswa yang NIM-nya sudah terdaftar (nama &amp; atribut akan diperbarui)
            </label>
          </div>

          {/* Upload area */}
          <div
            className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
              excelFile ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-300'
            }`}
            onClick={() => excelFileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleExcelFile(f) }}
          >
            <input
              ref={excelFileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f) }}
            />
            {excelFile ? (
              <div>
                <p className="text-2xl mb-2">📊</p>
                <p className="font-semibold text-primary-700 text-sm">{excelFile.name}</p>
                <p className="text-xs text-gray-400 mt-1">Klik untuk ganti file</p>
              </div>
            ) : (
              <div>
                <p className="text-3xl mb-2">📥</p>
                <p className="text-sm text-gray-500">Drag & drop file Excel (.xlsx) di sini</p>
                <p className="text-xs text-gray-400 mt-1">atau klik untuk pilih file</p>
              </div>
            )}
          </div>

          {/* Preview hasil parsing */}
          {excelFile && excelPreview.length === 0 && !excelResult && (
            <div className="card bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-700">
                ⚠️ Tidak ada baris data mahasiswa yang terdeteksi di file ini. Pastikan file memiliki
                kolom No, NIM, dan Nama dalam urutan tersebut.
              </p>
            </div>
          )}

          {excelPreview.length > 0 && !excelResult && (
            <div className="card p-0 overflow-hidden">
              <p className="px-4 py-3 text-xs font-semibold text-gray-500 border-b border-gray-100">
                Terdeteksi {excelPreview.length} mahasiswa — Preview (10 baris pertama)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">NIM</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Nama</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-600">Sheet</th>
                    </tr>
                  </thead>
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
                <p className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
                  ...dan {excelPreview.length - 10} mahasiswa lainnya
                </p>
              )}
            </div>
          )}

          {/* Hasil import Excel */}
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
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {excelResult.detailDilewati.map((d, i) => (
                      <p key={i} className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1">
                        {d.nim} — {d.nama}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {excelResult.detailGagal.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-red-500 mb-1">Gagal</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {excelResult.detailGagal.map((d, i) => (
                      <p key={i} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                        NIM {d.nim} ({d.baris}): {d.alasan}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tombol aksi */}
          {excelPreview.length > 0 && !excelResult && (
            <button onClick={handleExcelImport} disabled={excelImporting} className="btn-primary w-full">
              {excelImporting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Mengimport...
                </span>
              ) : `📥 Import ${excelPreview.length} mahasiswa sekarang`}
            </button>
          )}

          {excelResult && (
            <button onClick={resetExcelForm} className="btn-secondary w-full">
              Upload File Lagi
            </button>
          )}
        </>
      )}

      {/* ============================================================ */}
      {/* MODE CSV — alur lama, tidak berubah                           */}
      {/* ============================================================ */}
      {(activeTab !== 'mahasiswa' || mode === 'csv') && (
        <>
          {/* Info format */}
          <div className="card bg-blue-50 border-blue-200 space-y-2">
            <p className="text-sm font-semibold text-blue-700">Format CSV — {TAB_LABELS[activeTab].replace(/^\S+\s/, '')}</p>
            <p className="text-xs text-blue-600 font-mono break-all">{t.headers.join(', ')}</p>
            <p className="text-xs text-blue-500">{t.info}</p>
            {activeTab === 'matkul' && (
              <p className="text-xs text-blue-500">
                Urutan import yang disarankan: <strong>Dosen → Mata Kuliah → Mahasiswa → Ujian → Soal</strong>
              </p>
            )}
            <button onClick={() => downloadTemplate(activeTab)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline">
              ↓ Download template CSV
            </button>
          </div>

          {/* Upload area */}
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

          {/* Preview */}
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

          {/* Result */}
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

          {/* Tombol import */}
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