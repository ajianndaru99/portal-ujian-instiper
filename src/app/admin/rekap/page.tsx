'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

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
  const [resetting, setResetting] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('semua')

  useEffect(() => { loadUjianList() }, [])

  async function loadUjianList() {
    const { data } = await supabase.from('ujian').select('id, judul, kode_ujian, status').order('created_at', { ascending: false })
    setUjianList(data || [])
  }

  async function loadRekap(ujianId: string) {
    if (!ujianId) return
    setLoading(true); setRekap([])
    try {
      const { data: sesiList } = await supabase
        .from('sesi_ujian')
        .select(`id, nim, status, waktu_mulai, waktu_selesai, jumlah_pelanggaran, nilai_pg, nilai_esai, nilai_final,
          mahasiswa(nim, nama, prodi, minat, angkatan, kelas),
          ujian(judul, mata_kuliah(nama_matkul, dosen(nama)))`)
        .eq('ujian_id', ujianId)
        .order('nim')

      if (!sesiList) { setLoading(false); return }

      const rows: RekapRow[] = sesiList.map((s: any) => ({
        sesi_id: s.id,
        nama_ujian: s.ujian?.judul || '',
        nama_matkul: s.ujian?.mata_kuliah?.nama_matkul || '',
        nama_dosen: s.ujian?.mata_kuliah?.dosen?.nama || '',
        nim: s.mahasiswa?.nim || s.nim,
        nama_mahasiswa: s.mahasiswa?.nama || '',
        prodi: s.mahasiswa?.prodi || '',
        minat: (s.mahasiswa?.minat || '').toUpperCase(),
        angkatan: s.mahasiswa?.angkatan || 0,
        kelas: s.mahasiswa?.kelas || '',
        status: s.status,
        waktu_mulai: s.waktu_mulai,
        waktu_selesai: s.waktu_selesai,
        jumlah_pelanggaran: s.jumlah_pelanggaran || 0,
        nilai_pg: s.nilai_pg,
        nilai_esai: s.nilai_esai,
        nilai_final: s.nilai_final,
      }))
      setRekap(rows)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  async function resetSesi(sesiId: string, nim: string, nama: string) {
    if (!confirm(`Reset sesi ujian untuk ${nama} (${nim})?\n\nSemua jawaban dan data sesi akan dihapus. Mahasiswa bisa mengerjakan ujian dari awal.`)) return
    setResetting(sesiId)
    try {
      await supabase.from('jawaban').delete().eq('sesi_id', sesiId)
      await supabase.from('log_aktivitas').delete().eq('sesi_id', sesiId)
      await supabase.from('sesi_ujian').delete().eq('id', sesiId)
      await loadRekap(selectedUjian)
    } catch (err) { console.error(err); alert('Gagal reset sesi.') }
    finally { setResetting(null) }
  }

  async function handleExportExcel() {
    if (rekap.length === 0) return
    setExporting(true)
    try {
      const ujian = ujianList.find(u => u.id === selectedUjian)
      const namaFile = `Rekap_${ujian?.kode_ujian || 'Ujian'}_${new Date().toISOString().slice(0, 10)}`

      const dataRekap = filtered.map((r, i) => ({
        'No': i + 1, 'NIM': r.nim, 'Nama Mahasiswa': r.nama_mahasiswa,
        'Prodi': r.prodi, 'Minat': r.minat, 'Kelas': r.kelas, 'Angkatan': r.angkatan,
        'Status': r.status, 'Waktu Mulai': formatWaktu(r.waktu_mulai), 'Waktu Selesai': formatWaktu(r.waktu_selesai),
        'Pelanggaran': r.jumlah_pelanggaran,
        'Nilai PG': r.nilai_pg !== null ? Number(r.nilai_pg.toFixed(2)) : '-',
        'Nilai Esai': r.nilai_esai !== null ? Number(r.nilai_esai.toFixed(2)) : '-',
        'Nilai Final': r.nilai_final !== null ? Number(r.nilai_final.toFixed(2)) : '-',
        'Huruf Mutu': nilaiKeHuruf(r.nilai_final),
      }))

      const selesai = rekap.filter(r => ['selesai','auto_submit','paksa_submit'].includes(r.status))
      const nilaiValid = selesai.map(r => r.nilai_final).filter((n): n is number => n !== null)
      const rataRata = nilaiValid.length > 0 ? nilaiValid.reduce((a,b) => a+b, 0) / nilaiValid.length : 0
      const lulus = nilaiValid.filter(n => n >= 55).length

      const dataStatistik = [
        { 'Keterangan': 'Nama Ujian', 'Nilai': ujian?.judul || '' },
        { 'Keterangan': 'Mata Kuliah', 'Nilai': rekap[0]?.nama_matkul || '' },
        { 'Keterangan': 'Dosen', 'Nilai': rekap[0]?.nama_dosen || '' },
        { 'Keterangan': 'Tanggal Export', 'Nilai': new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) },
        { 'Keterangan': '', 'Nilai': '' },
        { 'Keterangan': 'Total Peserta', 'Nilai': rekap.length },
        { 'Keterangan': 'Sudah Mengerjakan', 'Nilai': selesai.length },
        { 'Keterangan': 'Rata-rata Nilai', 'Nilai': rataRata.toFixed(2) },
        { 'Keterangan': 'Nilai Tertinggi', 'Nilai': nilaiValid.length > 0 ? Math.max(...nilaiValid).toFixed(2) : '-' },
        { 'Keterangan': 'Nilai Terendah', 'Nilai': nilaiValid.length > 0 ? Math.min(...nilaiValid).toFixed(2) : '-' },
        { 'Keterangan': 'Jumlah Lulus (≥55)', 'Nilai': lulus },
        { 'Keterangan': 'Persentase Kelulusan', 'Nilai': nilaiValid.length > 0 ? `${((lulus/nilaiValid.length)*100).toFixed(1)}%` : '-' },
        { 'Keterangan': 'Ada Pelanggaran', 'Nilai': rekap.filter(r => r.jumlah_pelanggaran > 0).length },
        { 'Keterangan': 'Auto-submit', 'Nilai': rekap.filter(r => r.status === 'auto_submit').length },
      ]

      const wb = XLSX.utils.book_new()
      const wsRekap = XLSX.utils.json_to_sheet(dataRekap)
      wsRekap['!cols'] = [{ wch: 4 },{ wch: 12 },{ wch: 25 },{ wch: 14 },{ wch: 8 },{ wch: 7 },{ wch: 9 },{ wch: 16 },{ wch: 16 },{ wch: 16 },{ wch: 12 },{ wch: 10 },{ wch: 10 },{ wch: 12 },{ wch: 12 }]
      XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekap Nilai')
      const wsStatistik = XLSX.utils.json_to_sheet(dataStatistik)
      wsStatistik['!cols'] = [{ wch: 28 },{ wch: 35 }]
      XLSX.utils.book_append_sheet(wb, wsStatistik, 'Statistik')
      XLSX.writeFile(wb, `${namaFile}.xlsx`)
    } catch (err) { console.error(err); alert('Gagal export.') }
    finally { setExporting(false) }
  }

  const filtered = rekap.filter(r => {
    const s = search.toLowerCase()
    return (r.nim.includes(s) || r.nama_mahasiswa.toLowerCase().includes(s)) &&
      (filterStatus === 'semua' || r.status === filterStatus)
  })

  const selesaiCount = rekap.filter(r => ['selesai','auto_submit','paksa_submit'].includes(r.status)).length
  const nilaiList = rekap.map(r => r.nilai_final).filter((n): n is number => n !== null)
  const rataRata = nilaiList.length > 0 ? nilaiList.reduce((a,b) => a+b, 0) / nilaiList.length : null

  const S: React.CSSProperties = { fontFamily: "'Plus Jakarta Sans', sans-serif" }

  return (
    <div style={{ maxWidth: 1000, ...S }}>
      {/* Header */}
      <div className="section-header">
        <div>
          <p className="section-title">Rekap Nilai</p>
          <p className="section-subtitle">Lihat hasil ujian dan export ke Excel</p>
        </div>
        {rekap.length > 0 && (
          <button onClick={handleExportExcel} disabled={exporting}
            className="admin-btn admin-btn-primary">
            {exporting ? (
              <><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg> Mengekspor...</>
            ) : (<><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> Export Excel</>)}
          </button>
        )}
      </div>

      {/* Pilih ujian */}
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text-muted)', display: 'block', marginBottom: 8 }}>
          Pilih Ujian
        </label>
        <select className="admin-input"
          value={selectedUjian}
          onChange={e => { setSelectedUjian(e.target.value); loadRekap(e.target.value) }}>
          <option value="">-- Pilih ujian untuk melihat rekap --</option>
          {ujianList.map(u => (
            <option key={u.id} value={u.id}>[{u.status.toUpperCase()}] {u.judul} — {u.kode_ujian}</option>
          ))}
        </select>
      </div>

      {/* Stat cards */}
      {rekap.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Total Peserta', value: rekap.length, cls: 'stat-card-blue', color: '#2563eb' },
            { label: 'Sudah Selesai', value: selesaiCount, cls: 'stat-card-green', color: '#16a34a' },
            { label: 'Rata-rata Nilai', value: rataRata !== null ? rataRata.toFixed(1) : '-', cls: 'stat-card-amber', color: '#d97706' },
            { label: 'Ada Pelanggaran', value: rekap.filter(r => r.jumlah_pelanggaran > 0).length, cls: 'stat-card-red', color: '#dc2626' },
          ].map(s => (
            <div key={s.label} className={`stat-card ${s.cls}`}>
              <p style={{ fontSize: '1.5rem', fontWeight: 800, color: s.color, letterSpacing: '-0.04em' }}>{s.value}</p>
              <p style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', marginTop: 4, fontWeight: 500 }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter */}
      {rekap.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input className="admin-input" style={{ flex: 1, minWidth: 160 }}
            placeholder="Cari NIM atau nama..." value={search} onChange={e => setSearch(e.target.value)} />
          <select className="admin-input" style={{ width: 160 }}
            value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="semua">Semua Status</option>
            <option value="belum_mulai">Belum Mulai</option>
            <option value="mengerjakan">Mengerjakan</option>
            <option value="selesai">Selesai</option>
            <option value="auto_submit">Auto Submit</option>
          </select>
        </div>
      )}

      {/* Tabel */}
      {loading ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '40px' }}>
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p style={{ color: 'var(--admin-text-subtle)', fontSize: '0.875rem' }}>Memuat rekap...</p>
        </div>
      ) : rekap.length > 0 ? (
        <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {['No','NIM','Nama','Minat','Kls','Angk.','Status','Pelang.','Nilai PG','Nilai Esai','Final','Huruf','Aksi'].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={13} style={{ textAlign: 'center', padding: 32, color: 'var(--admin-text-subtle)' }}>Tidak ada data.</td></tr>
                ) : filtered.map((r, i) => (
                  <tr key={r.sesi_id} style={{ background: r.jumlah_pelanggaran > 0 ? '#fff5f5' : undefined }}>
                    <td style={{ color: 'var(--admin-text-subtle)', width: 36 }}>{i + 1}</td>
                    <td><span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-text)' }}>{r.nim}</span></td>
                    <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{r.nama_mahasiswa}</td>
                    <td><span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase' }}>{r.minat}</span></td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.kelas}</td>
                    <td style={{ color: 'var(--admin-text-muted)' }}>{r.angkatan}</td>
                    <td>
                      <span className={`status-pill status-${r.status === 'auto_submit' ? 'dibatalkan' : r.status === 'mengerjakan' ? 'mengerjakan' : r.status === 'selesai' ? 'aktif' : 'draft'}`}
                        style={{ fontSize: '0.65rem' }}>
                        {r.status === 'belum_mulai' ? 'Belum mulai' : r.status === 'mengerjakan' ? 'Aktif' : r.status === 'selesai' ? 'Selesai' : r.status === 'auto_submit' ? 'Auto-submit' : r.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {r.jumlah_pelanggaran > 0
                        ? <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>{r.jumlah_pelanggaran}×</span>
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.nilai_pg !== null ? r.nilai_pg.toFixed(1) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{r.nilai_esai !== null ? r.nilai_esai.toFixed(1) : <span style={{ color: '#cbd5e1' }}>—</span>}</td>
                    <td style={{ textAlign: 'center' }}>
                      {r.nilai_final !== null
                        ? <span style={{ fontWeight: 700, color: r.nilai_final >= 55 ? '#16a34a' : '#dc2626' }}>{r.nilai_final.toFixed(1)}</span>
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: nilaiKeHuruf(r.nilai_final) === 'A' ? '#16a34a' : ['B+','B'].includes(nilaiKeHuruf(r.nilai_final)) ? '#2563eb' : nilaiKeHuruf(r.nilai_final) === '-' ? '#cbd5e1' : '#d97706' }}>
                        {nilaiKeHuruf(r.nilai_final)}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => resetSesi(r.sesi_id, r.nim, r.nama_mahasiswa)}
                        disabled={resetting === r.sesi_id}
                        style={{
                          fontSize: '0.7rem', padding: '3px 8px', borderRadius: 6,
                          background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca',
                          cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                          opacity: resetting === r.sesi_id ? 0.5 : 1
                        }}>
                        {resetting === r.sesi_id ? '...' : '↺ Reset'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--admin-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-subtle)' }}>
              {filtered.length} dari {rekap.length} peserta · Tombol ↺ Reset untuk izinkan mahasiswa ujian ulang
            </p>
          </div>
        </div>
      ) : selectedUjian ? (
        <div className="admin-card" style={{ textAlign: 'center', padding: '40px' }}>
          <p style={{ color: 'var(--admin-text-subtle)', fontSize: '0.875rem' }}>Belum ada peserta yang terdaftar.</p>
        </div>
      ) : null}
    </div>
  )
}
