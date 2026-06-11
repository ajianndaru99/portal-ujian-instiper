'use client'

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type ImportType = 'mahasiswa' | 'dosen' | 'soal'

interface ImportResult {
  success: number
  failed: number
  errors: string[]
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
  soal: {
    headers: ['ujian_id', 'nomor_urut', 'pertanyaan', 'tipe', 'opsi_a', 'opsi_b', 'opsi_c', 'opsi_d', 'kunci_jawaban', 'bobot_nilai'],
    contoh: [
      ['UUID-UJIAN', '1', 'Apa itu fotosintesis?', 'pg', 'Proses respirasi', 'Proses pembuatan makanan', 'Proses pembelahan', 'Proses penyerapan', 'B', '20'],
      ['UUID-UJIAN', '2', 'Jelaskan pertanian berkelanjutan!', 'esai', '', '', '', '', '', '20'],
    ],
    info: 'tipe: pg/esai | kunci_jawaban: A/B/C/D (kosongkan untuk esai) | opsi_a-d: kosongkan untuk esai',
  },
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

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<ImportType>('mahasiswa')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string[][]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    setFile(f); setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const rows = parseCSV(e.target?.result as string)
      setPreview(rows.slice(0, 6)) // Show header + 5 rows preview
    }
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

  const t = TEMPLATES[activeTab]

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-800">Import Data</h1>
        <p className="text-sm text-gray-400">Upload file CSV untuk menambah data secara massal</p>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        {(['mahasiswa', 'dosen', 'soal'] as ImportType[]).map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setFile(null); setPreview([]); setResult(null) }}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'mahasiswa' ? '🎓 Mahasiswa' : tab === 'dosen' ? '👨‍🏫 Dosen' : '📝 Soal'}
          </button>
        ))}
      </div>

      {/* Info format */}
      <div className="card bg-blue-50 border-blue-200 space-y-2">
        <p className="text-sm font-semibold text-blue-700">Format CSV — {activeTab}</p>
        <p className="text-xs text-blue-600 font-mono">{t.headers.join(', ')}</p>
        <p className="text-xs text-blue-500">{t.info}</p>
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
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              Mengimport...
            </span>
          ) : `📥 Import ${activeTab} sekarang`}
        </button>
      )}

      {result && (
        <button onClick={() => { setFile(null); setPreview([]); setResult(null); if(fileRef.current) fileRef.current.value = '' }}
          className="btn-secondary w-full">
          Upload File Lagi
        </button>
      )}
    </div>
  )
}
