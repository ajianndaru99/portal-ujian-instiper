'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import * as XLSX from 'xlsx'

interface UjianOption {
  id: string
  judul: string
  kode_ujian: string
  status: string
}

interface JawabanEsai {
  jawaban_id: string
  soal_id: string
  nomor_urut: number
  pertanyaan: string
  bobot_nilai: number
  jawaban_mahasiswa: string | null
  nilai_esai: number | null
  catatan_esai: string | null
}

interface MahasiswaEsai {
  sesi_id: string
  nim: string
  nama: string
  status: string
  jawabanList: JawabanEsai[]
  sudahDinilaiSemua: boolean
}

export default function PenilaianEsaiPage() {
  const [ujianList, setUjianList] = useState<UjianOption[]>([])
  const [selectedUjian, setSelectedUjian] = useState('')
  const [loading, setLoading] = useState(false)
  const [mahasiswaList, setMahasiswaList] = useState<MahasiswaEsai[]>([])
  const [expandedSesi, setExpandedSesi] = useState<string | null>(null)

  const [editValues, setEditValues] = useState<Record<string, { nilai: string; catatan: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [filterBelumNilai, setFilterBelumNilai] = useState(false)

  useEffect(() => { loadUjianList() }, [])

  async function loadUjianList() {
    const { data } = await supabase
      .from('ujian')
      .select('id, judul, kode_ujian, status')
      .order('created_at', { ascending: false })
    setUjianList(data || [])
  }

  async function loadJawabanEsai(ujianId: string) {
    if (!ujianId) return
    setLoading(true)
    setMahasiswaList([])
    setExpandedSesi(null)

    try {
      // Ambil semua soal esai untuk ujian ini
      const { data: soalEsai } = await supabase
        .from('soal')
        .select('id, nomor_urut, pertanyaan, bobot_nilai')
        .eq('ujian_id', ujianId)
        .eq('tipe', 'esai')
        .order('nomor_urut')

      if (!soalEsai || soalEsai.length === 0) {
        setMahasiswaList([])
        setLoading(false)
        return
      }

      const soalIds = soalEsai.map(s => s.id)

      // Ambil semua sesi yang sudah selesai untuk ujian ini
      const { data: sesiList } = await supabase
        .from('sesi_ujian')
        .select('id, nim, status, mahasiswa(nim, nama)')
        .eq('ujian_id', ujianId)
        .in('status', ['selesai', 'auto_submit', 'paksa_submit'])
        .order('nim')

      if (!sesiList || sesiList.length === 0) {
        setMahasiswaList([])
        setLoading(false)
        return
      }

      const sesiIds = sesiList.map(s => s.id)

      // Ambil semua jawaban esai untuk soal-soal & sesi-sesi ini
      const { data: jawabanList } = await supabase
        .from('jawaban')
        .select('id, sesi_id, soal_id, jawaban_mahasiswa, nilai_esai, catatan_esai')
        .in('soal_id', soalIds)
        .in('sesi_id', sesiIds)

      const result: MahasiswaEsai[] = sesiList.map((sesi: any) => {
        const jawabanMhs = soalEsai.map(soal => {
          const j = jawabanList?.find(jw => jw.sesi_id === sesi.id && jw.soal_id === soal.id)
          return {
            jawaban_id: j?.id || '',
            soal_id: soal.id,
            nomor_urut: soal.nomor_urut,
            pertanyaan: soal.pertanyaan,
            bobot_nilai: soal.bobot_nilai,
            jawaban_mahasiswa: j?.jawaban_mahasiswa || null,
            nilai_esai: j?.nilai_esai ?? null,
            catatan_esai: j?.catatan_esai || null,
          }
        })

        return {
          sesi_id: sesi.id,
          nim: sesi.mahasiswa?.nim || sesi.nim,
          nama: sesi.mahasiswa?.nama || '(nama tidak ditemukan)',
          status: sesi.status,
          jawabanList: jawabanMhs,
          sudahDinilaiSemua: jawabanMhs.every(j => j.nilai_esai !== null),
        }
      })

      setMahasiswaList(result)

      // Pre-fill nilai edit dari data yang sudah ada
      const initEdit: Record<string, { nilai: string; catatan: string }> = {}
      result.forEach(m => m.jawabanList.forEach(j => {
        if (j.jawaban_id) {
          initEdit[j.jawaban_id] = {
            nilai: j.nilai_esai !== null ? String(j.nilai_esai) : '',
            catatan: j.catatan_esai || '',
          }
        }
      }))
      setEditValues(initEdit)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function simpanNilai(jawabanId: string, sesiId: string, bobotMaks: number) {
    const val = editValues[jawabanId]
    if (!val) return

    const nilai = parseFloat(val.nilai)
    if (isNaN(nilai) || nilai < 0 || nilai > bobotMaks) {
      alert(`Nilai harus antara 0 - ${bobotMaks}`)
      return
    }

    setSavingId(jawabanId)
    try {
      const { error } = await supabase
        .from('jawaban')
        .update({ nilai_esai: nilai, catatan_esai: val.catatan || null })
        .eq('id', jawabanId)

      if (error) throw error

      // Hitung ulang nilai final sesi (PG + Esai)
      await supabase.rpc('hitung_nilai_final', { p_sesi_id: sesiId })

      // Update state lokal tanpa reload semua
      setMahasiswaList(prev => prev.map(m => {
        if (m.sesi_id !== sesiId) return m
        const newJawaban = m.jawabanList.map(j => j.jawaban_id === jawabanId ? { ...j, nilai_esai: nilai, catatan_esai: val.catatan } : j)
        return { ...m, jawabanList: newJawaban, sudahDinilaiSemua: newJawaban.every(j => j.nilai_esai !== null) }
      }))
    } catch (err) {
      console.error(err)
      alert('Gagal menyimpan nilai.')
    } finally {
      setSavingId(null)
    }
  }

  function downloadExcel() {
    if (mahasiswaList.length === 0) return
    const ujian = ujianList.find(u => u.id === selectedUjian)
    const namaFile = `Jawaban_Esai_${ujian?.kode_ujian || 'Ujian'}_${new Date().toISOString().slice(0, 10)}`

    // Sheet 1: Jawaban Esai Lengkap (1 baris = 1 mahasiswa, kolom = tiap soal)
    const soalSet = mahasiswaList[0]?.jawabanList || []
    const dataJawaban = mahasiswaList.map((m, i) => {
      const row: Record<string, any> = { 'No': i + 1, 'NIM': m.nim, 'Nama': m.nama }
      m.jawabanList.forEach(j => {
        row[`Soal ${j.nomor_urut} - Jawaban`] = j.jawaban_mahasiswa || '(tidak dijawab)'
        row[`Soal ${j.nomor_urut} - Nilai (maks ${j.bobot_nilai})`] = j.nilai_esai ?? ''
      })
      const total = m.jawabanList.reduce((sum, j) => sum + (j.nilai_esai || 0), 0)
      row['Total Nilai Esai'] = total
      row['Status Penilaian'] = m.sudahDinilaiSemua ? 'Selesai dinilai' : 'Belum lengkap'
      return row
    })

    // Sheet 2: Ringkasan per soal (untuk dosen baca pertanyaan & rekap cepat)
    const dataSoal = soalSet.map(s => ({
      'No Soal': s.nomor_urut,
      'Pertanyaan': s.pertanyaan,
      'Bobot Maksimal': s.bobot_nilai,
    }))

    const wb = XLSX.utils.book_new()

    const wsJawaban = XLSX.utils.json_to_sheet(dataJawaban)
    const colWidths = [{ wch: 4 }, { wch: 12 }, { wch: 22 }]
    soalSet.forEach(() => { colWidths.push({ wch: 40 }, { wch: 14 }) })
    colWidths.push({ wch: 14 }, { wch: 16 })
    wsJawaban['!cols'] = colWidths
    XLSX.utils.book_append_sheet(wb, wsJawaban, 'Jawaban Esai')

    const wsSoal = XLSX.utils.json_to_sheet(dataSoal)
    wsSoal['!cols'] = [{ wch: 8 }, { wch: 60 }, { wch: 14 }]
    XLSX.utils.book_append_sheet(wb, wsSoal, 'Daftar Soal Esai')

    XLSX.writeFile(wb, `${namaFile}.xlsx`)
  }

  const filteredList = filterBelumNilai ? mahasiswaList.filter(m => !m.sudahDinilaiSemua) : mahasiswaList
  const totalBelumNilai = mahasiswaList.filter(m => !m.sudahDinilaiSemua).length

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Penilaian Esai</h1>
          <p className="text-sm text-gray-400">Baca dan nilai jawaban esai mahasiswa secara manual</p>
        </div>
        {mahasiswaList.length > 0 && (
          <button onClick={downloadExcel} className="btn-secondary text-sm px-4 py-2.5">
            📥 Export Jawaban (Excel)
          </button>
        )}
      </div>

      <div className="card space-y-3">
        <label className="block text-sm font-semibold text-gray-700">Pilih Ujian</label>
        <select
          className="input-field text-sm"
          value={selectedUjian}
          onChange={e => { setSelectedUjian(e.target.value); loadJawabanEsai(e.target.value) }}
        >
          <option value="">-- Pilih ujian --</option>
          {ujianList.map(u => (
            <option key={u.id} value={u.id}>[{u.status.toUpperCase()}] {u.judul} — {u.kode_ujian}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Memuat jawaban esai...</div>
      ) : selectedUjian && mahasiswaList.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-400">Tidak ada soal esai atau belum ada mahasiswa yang menyelesaikan ujian ini.</p>
        </div>
      ) : mahasiswaList.length > 0 ? (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-primary-600"
                checked={filterBelumNilai}
                onChange={e => setFilterBelumNilai(e.target.checked)}
              />
              Tampilkan hanya yang belum selesai dinilai
            </label>
            {totalBelumNilai > 0 && (
              <span className="text-xs bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-medium">
                {totalBelumNilai} mahasiswa belum dinilai lengkap
              </span>
            )}
          </div>

          <div className="space-y-3">
            {filteredList.map(m => (
              <div key={m.sesi_id} className="card p-0 overflow-hidden">
                <button
                  onClick={() => setExpandedSesi(expandedSesi === m.sesi_id ? null : m.sesi_id)}
                  className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-800">{m.nama}</p>
                      <p className="text-xs text-gray-400 font-mono">{m.nim}</p>
                    </div>
                    {m.sudahDinilaiSemua ? (
                      <span className="badge badge-green">✓ Selesai dinilai</span>
                    ) : (
                      <span className="badge badge-yellow">Belum dinilai</span>
                    )}
                  </div>
                  <span className="text-gray-400 text-sm">{expandedSesi === m.sesi_id ? '▲' : '▼'}</span>
                </button>

                {expandedSesi === m.sesi_id && (
                  <div className="border-t border-gray-100 px-4 py-4 space-y-4 bg-gray-50/50">
                    {m.jawabanList.map(j => (
                      <div key={j.soal_id} className="bg-white rounded-xl p-4 border border-gray-100 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-gray-700">
                            <span className="text-gray-400">Soal {j.nomor_urut}.</span> {j.pertanyaan}
                          </p>
                          <span className="text-xs text-gray-400 whitespace-nowrap">Maks: {j.bobot_nilai}</span>
                        </div>

                        <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                          <p className="text-xs text-gray-400 mb-1">Jawaban mahasiswa:</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">
                            {j.jawaban_mahasiswa || <span className="text-gray-300 italic">Tidak dijawab</span>}
                          </p>
                        </div>

                        {j.jawaban_id && (
                          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
                            <div className="flex-1">
                              <label className="text-xs text-gray-500 mb-1 block">Catatan (opsional)</label>
                              <input
                                className="input-field text-sm py-2"
                                placeholder="Catatan untuk mahasiswa..."
                                value={editValues[j.jawaban_id]?.catatan || ''}
                                onChange={e => setEditValues(prev => ({ ...prev, [j.jawaban_id]: { ...prev[j.jawaban_id], catatan: e.target.value } }))}
                              />
                            </div>
                            <div className="w-28">
                              <label className="text-xs text-gray-500 mb-1 block">Nilai (0-{j.bobot_nilai})</label>
                              <input
                                type="number"
                                className="input-field text-sm py-2"
                                min={0}
                                max={j.bobot_nilai}
                                value={editValues[j.jawaban_id]?.nilai ?? ''}
                                onChange={e => setEditValues(prev => ({ ...prev, [j.jawaban_id]: { ...prev[j.jawaban_id], nilai: e.target.value } }))}
                              />
                            </div>
                            <button
                              onClick={() => simpanNilai(j.jawaban_id, m.sesi_id, j.bobot_nilai)}
                              disabled={savingId === j.jawaban_id}
                              className="btn-primary text-sm px-4 py-2 whitespace-nowrap"
                            >
                              {savingId === j.jawaban_id ? '...' : 'Simpan'}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
