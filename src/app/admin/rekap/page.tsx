'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface RekapRow {
  sesi_id: string
  nama_ujian: string
  nama_matkul: string
  nama_dosen: string
  nim: string
  nama_mahasiswa: string
  prodi: string
  minat: string
  angkatan: number
  kelas: string
  status: string
  waktu_mulai: string | null
  waktu_selesai: string | null
  jumlah_pelanggaran: number
  nilai_pg: number | null
  nilai_esai: number | null
  nilai_final: number | null
  status_kecurangan: string
}

interface UjianOption {
  id: string
  judul: string
  kode_ujian: string
  status: string
}

function formatWaktu(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  })
}

function nilaiKeHuruf(nilai: number | null): string {
  if (nilai === null || nilai === undefined) return '-'
  if (nilai >= 85) return 'A'
  if (nilai >= 75) return 'B+'
  if (nilai >= 65) return 'B'
  if (nilai >= 55) return 'C+'
  if (nilai >= 45) return 'C'
  if (nilai >= 35) return 'D'
  return 'E'
}

export default function AdminRekapPage() {
  const [ujianList, setUjianList] = useState<UjianOption[]>([])
  const [selectedUjian, setSelectedUjian] = useState('')
  const [rekap, setRekap] = useState<RekapRow[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('semua')

  useEffect(() => { loadUjianList() }, [])

  async function loadUjianList() {
    const { data } = await supabase
      .from('ujian')
      .select('id, judul, kode_ujian, status')
      .order('created_at', { ascending: false })
    setUjianList(data || [])
  }

  async function loadRekap(ujianId: string) {
    if (!ujianId) return
    setLoading(true)
    setRekap([])

    try {
      // Ambil semua sesi ujian beserta data relasi
      const { data: sesiList } = await supabase
        .from('sesi_ujian')
        .select(`
          id,
          nim,
          status,
          waktu_mulai,
          waktu_selesai,
          jumlah_pelanggaran,
          nilai_pg,
          nilai_esai,
          nilai_final,
          mahasiswa ( nim, nama, prodi, minat, angkatan, kelas ),
          ujian (
            judul,
            mata_kuliah (
              nama_matkul,
              dosen ( nama )
            )
          )
        `)
        .eq('ujian_id', ujianId)
        .order('nim')

      if (!sesiList) { setLoading(false); return }

      const rows: RekapRow[] = sesiList.map((s: any) => {
        const mhs = s.mahasiswa || {}
        const ujian = s.ujian || {}
        const matkul = ujian.mata_kuliah || {}
        const dosen = matkul.dosen || {}

        const statusKecurangan =
          s.status === 'auto_submit' ? 'Auto-submit (pelanggaran)' :
          s.status === 'paksa_submit' ? 'Paksa submit (admin)' :
          s.jumlah_pelanggaran >= 3 ? 'Pelanggaran berat' :
          s.jumlah_pelanggaran >= 1 ? `Pelanggaran (${s.jumlah_pelanggaran}×)` :
          'Bersih'

        return {
          sesi_id: s.id,
          nama_ujian: ujian.judul || '',
          nama_matkul: matkul.nama_matkul || '',
          nama_dosen: dosen.nama || '',
          nim: mhs.nim || s.nim,
          nama_mahasiswa: mhs.nama || '',
          prodi: mhs.prodi || '',
          minat: (mhs.minat || '').toUpperCase(),
          angkatan: mhs.angkatan || 0,
          kelas: mhs.kelas || '',
          status: s.status,
          waktu_mulai: s.waktu_mulai,
          waktu_selesai: s.waktu_selesai,
          jumlah_pelanggaran: s.jumlah_pelanggaran || 0,
          nilai_pg: s.nilai_pg,
          nilai_esai: s.nilai_esai,
          nilai_final: s.nilai_final,
          status_kecurangan: statusKecurangan,
        }
      })

      setRekap(rows)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleExportExcel() {
    if (rekap.length === 0) return
    setExporting(true)

    try {
      // Dynamic import SheetJS
      const XLSX = await import('xlsx')

      const ujian = ujianList.find(u => u.id === selectedUjian)
      const namaFile = `Rekap_${ujian?.kode_ujian || 'Ujian'}_${new Date().toISOString().slice(0, 10)}`

      // Sheet 1: Rekap Nilai
      const dataRekap = filtered.map((r, i) => ({
        'No': i + 1,
        'NIM': r.nim,
        'Nama Mahasiswa': r.nama_mahasiswa,
        'Prodi': r.prodi,
        'Minat': r.minat,
        'Kelas': r.kelas,
        'Angkatan': r.angkatan,
        'Status Pengerjaan': r.status,
        'Waktu Mulai': formatWaktu(r.waktu_mulai),
        'Waktu Selesai': formatWaktu(r.waktu_selesai),
        'Pelanggaran': r.jumlah_pelanggaran,
        'Status Kecurangan': r.status_kecurangan,
        'Nilai PG': r.nilai_pg !== null ? Number(r.nilai_pg.toFixed(2)) : '-',
        'Nilai Esai': r.nilai_esai !== null ? Number(r.nilai_esai.toFixed(2)) : '-',
        'Nilai Final': r.nilai_final !== null ? Number(r.nilai_final.toFixed(2)) : '-',
        'Huruf Mutu': nilaiKeHuruf(r.nilai_final),
      }))

      // Sheet 2: Statistik
      const selesai = rekap.filter(r => ['selesai', 'auto_submit', 'paksa_submit'].includes(r.status))
      const nilaiValid = selesai.map(r => r.nilai_final).filter((n): n is number => n !== null)
      const rataRata = nilaiValid.length > 0 ? nilaiValid.reduce((a, b) => a + b, 0) / nilaiValid.length : 0
      const tertinggi = nilaiValid.length > 0 ? Math.max(...nilaiValid) : 0
      const terendah = nilaiValid.length > 0 ? Math.min(...nilaiValid) : 0
      const lulus = nilaiValid.filter(n => n >= 55).length

      const dataStatistik = [
        { 'Keterangan': 'Nama Ujian', 'Nilai': ujian?.judul || '' },
        { 'Keterangan': 'Mata Kuliah', 'Nilai': rekap[0]?.nama_matkul || '' },
        { 'Keterangan': 'Dosen', 'Nilai': rekap[0]?.nama_dosen || '' },
        { 'Keterangan': 'Tanggal Export', 'Nilai': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
        { 'Keterangan': '', 'Nilai': '' },
        { 'Keterangan': 'Total Peserta Terdaftar', 'Nilai': rekap.length },
        { 'Keterangan': 'Sudah Mengerjakan', 'Nilai': selesai.length },
        { 'Keterangan': 'Belum Mengerjakan', 'Nilai': rekap.filter(r => r.status === 'belum_mulai').length },
        { 'Keterangan': 'Sedang Mengerjakan', 'Nilai': rekap.filter(r => r.status === 'mengerjakan').length },
        { 'Keterangan': '', 'Nilai': '' },
        { 'Keterangan': 'Rata-rata Nilai Final', 'Nilai': rataRata.toFixed(2) },
        { 'Keterangan': 'Nilai Tertinggi', 'Nilai': tertinggi.toFixed(2) },
        { 'Keterangan': 'Nilai Terendah', 'Nilai': terendah.toFixed(2) },
        { 'Keterangan': 'Jumlah Lulus (≥55)', 'Nilai': lulus },
        { 'Keterangan': 'Jumlah Tidak Lulus (<55)', 'Nilai': nilaiValid.length - lulus },
        { 'Keterangan': 'Persentase Kelulusan', 'Nilai': nilaiValid.length > 0 ? `${((lulus / nilaiValid.length) * 100).toFixed(1)}%` : '-' },
        { 'Keterangan': '', 'Nilai': '' },
        { 'Keterangan': 'Ada Pelanggaran', 'Nilai': rekap.filter(r => r.jumlah_pelanggaran > 0).length },
        { 'Keterangan': 'Auto-submit', 'Nilai': rekap.filter(r => r.status === 'auto_submit').length },
      ]

      // Buat workbook
      const wb = XLSX.utils.book_new()

      // Sheet Rekap
      const wsRekap = XLSX.utils.json_to_sheet(dataRekap)
      wsRekap['!cols'] = [
        { wch: 4 }, { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 },
        { wch: 7 }, { wch: 9 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      ]
      XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekap Nilai')

      // Sheet Statistik
      const wsStatistik = XLSX.utils.json_to_sheet(dataStatistik)
      wsStatistik['!cols'] = [{ wch: 30 }, { wch: 35 }]
      XLSX.utils.book_append_sheet(wb, wsStatistik, 'Statistik')

      // Download
      XLSX.writeFile(wb, `${namaFile}.xlsx`)
    } catch (err) {
      console.error(err)
      alert('Gagal export. Coba lagi.')
    } finally {
      setExporting(false)
    }
  }

  const filtered = rekap.filter(r => {
    const s = search.toLowerCase()
    const matchSearch = r.nim.includes(s) || r.nama_mahasiswa.toLowerCase().includes(s)
    const matchStatus = filterStatus === 'semua' || r.status === filterStatus
    return matchSearch && matchStatus
  })

  const selesaiCount = rekap.filter(r => ['selesai', 'auto_submit', 'paksa_submit'].includes(r.status)).length
  const nilaiList = rekap.map(r => r.nilai_final).filter((n): n is number => n !== null)
  const rataRata = nilaiList.length > 0 ? nilaiList.reduce((a, b) => a + b, 0) / nilaiList.length : null

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Rekap Nilai</h1>
          <p className="text-sm text-gray-400">Export hasil ujian ke Excel</p>
        </div>
        {rekap.length > 0 && (
          <button
            onClick={handleExportExcel}
            disabled={exporting}
            className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2"
          >
            {exporting ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                Mengekspor...
              </>
            ) : '📥 Export Excel'}
          </button>
        )}
      </div>

      {/* Pilih ujian */}
      <div className="card space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Pilih Ujian</label>
        <select
          className="input-field text-sm"
          value={selectedUjian}
          onChange={e => { setSelectedUjian(e.target.value); loadRekap(e.target.value) }}
        >
          <option value="">-- Pilih ujian untuk melihat rekap --</option>
          {ujianList.map(u => (
            <option key={u.id} value={u.id}>
              [{u.status.toUpperCase()}] {u.judul} — {u.kode_ujian}
            </option>
          ))}
        </select>
      </div>

      {/* Statistik cepat */}
      {rekap.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-800">{rekap.length}</p>
            <p className="text-xs text-gray-400 mt-1">Total Peserta</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-600">{selesaiCount}</p>
            <p className="text-xs text-gray-400 mt-1">Sudah Selesai</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-primary-600">
              {rataRata !== null ? rataRata.toFixed(1) : '-'}
            </p>
            <p className="text-xs text-gray-400 mt-1">Rata-rata Nilai</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-red-500">
              {rekap.filter(r => r.jumlah_pelanggaran > 0).length}
            </p>
            <p className="text-xs text-gray-400 mt-1">Ada Pelanggaran</p>
          </div>
        </div>
      )}

      {/* Filter tabel */}
      {rekap.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <input
            className="input-field text-sm flex-1 min-w-[160px]"
            placeholder="Cari NIM atau nama..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-field text-sm w-44"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="semua">Semua Status</option>
            <option value="belum_mulai">Belum Mulai</option>
            <option value="mengerjakan">Sedang Mengerjakan</option>
            <option value="selesai">Selesai</option>
            <option value="auto_submit">Auto Submit</option>
            <option value="paksa_submit">Paksa Submit</option>
          </select>
        </div>
      )}

      {/* Tabel rekap */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat rekap...</div>
      ) : rekap.length === 0 && selectedUjian ? (
        <div className="card text-center py-10">
          <p className="text-gray-400">Belum ada peserta yang terdaftar atau mengerjakan ujian ini.</p>
        </div>
      ) : rekap.length > 0 ? (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {['No', 'NIM', 'Nama', 'Minat', 'Kls', 'Angk.', 'Status', 'Pelanggaran', 'Nilai PG', 'Nilai Esai', 'Nilai Final', 'Huruf'].map(h => (
                    <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr><td colSpan={12} className="text-center py-8 text-gray-400">Tidak ada data.</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.sesi_id} className={`hover:bg-gray-50 transition-colors ${r.jumlah_pelanggaran > 0 ? 'bg-red-50/30' : ''}`}>
                    <td className="px-3 py-3 text-gray-400 text-xs">{i + 1}</td>
                    <td className="px-3 py-3 font-mono text-xs font-semibold text-gray-700">{r.nim}</td>
                    <td className="px-3 py-3 font-medium text-gray-800 whitespace-nowrap">{r.nama_mahasiswa}</td>
                    <td className="px-3 py-3"><span className="text-xs font-bold text-primary-600 uppercase">{r.minat}</span></td>
                    <td className="px-3 py-3 text-center font-bold text-gray-700">{r.kelas}</td>
                    <td className="px-3 py-3 text-gray-500">{r.angkatan}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
                        r.status === 'selesai' ? 'bg-green-100 text-green-700' :
                        r.status === 'auto_submit' ? 'bg-red-100 text-red-700' :
                        r.status === 'mengerjakan' ? 'bg-blue-100 text-blue-700' :
                        r.status === 'paksa_submit' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {r.status === 'belum_mulai' ? 'Belum mulai' :
                         r.status === 'mengerjakan' ? 'Mengerjakan' :
                         r.status === 'selesai' ? 'Selesai' :
                         r.status === 'auto_submit' ? 'Auto-submit' :
                         r.status === 'paksa_submit' ? 'Paksa submit' : r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.jumlah_pelanggaran > 0 ? (
                        <span className="text-xs font-bold text-red-600">{r.jumlah_pelanggaran}×</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-gray-800">
                      {r.nilai_pg !== null ? r.nilai_pg.toFixed(1) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center font-semibold text-gray-800">
                      {r.nilai_esai !== null ? r.nilai_esai.toFixed(1) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.nilai_final !== null ? (
                        <span className={`font-bold ${r.nilai_final >= 55 ? 'text-green-600' : 'text-red-600'}`}>
                          {r.nilai_final.toFixed(1)}
                        </span>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`text-sm font-bold ${
                        nilaiKeHuruf(r.nilai_final) === 'A' ? 'text-green-600' :
                        ['B+','B'].includes(nilaiKeHuruf(r.nilai_final)) ? 'text-blue-600' :
                        ['C+','C'].includes(nilaiKeHuruf(r.nilai_final)) ? 'text-amber-600' :
                        nilaiKeHuruf(r.nilai_final) !== '-' ? 'text-red-600' : 'text-gray-300'
                      }`}>
                        {nilaiKeHuruf(r.nilai_final)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-400">Menampilkan {filtered.length} dari {rekap.length} peserta</p>
            {rekap.length > 0 && (
              <button onClick={handleExportExcel} disabled={exporting} className="text-xs text-primary-600 hover:text-primary-700 font-semibold">
                📥 Export Excel
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
