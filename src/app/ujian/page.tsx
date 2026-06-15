'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Soal, SesiUjian } from '@/lib/types'
import {
  formatDurasi, hitungSisaDetik,
  simpanSesiLokal, ambilSesiLokal, simpanJawabanLokal,
  tandaiSudahSync, hitungJawabanBelumSync, acakArray, ambilHurufOpsi
} from '@/lib/utils'

type StatusPeringatan = 'idle' | 'peringatan1' | 'peringatan2' | 'peringatan3' | 'auto_submit'

export default function UjianPage() {
  const router = useRouter()
  const [sesi, setSesi] = useState<SesiUjian | null>(null)
  const [soalList, setSoalList] = useState<Soal[]>([])
  const [soalTerurut, setSoalTerurut] = useState<Soal[]>([])
  const [indeksSoalAktif, setIndeksSoalAktif] = useState(0)
  const [jawabanState, setJawabanState] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [sisaDetik, setSisaDetik] = useState(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [statusPeringatan, setStatusPeringatan] = useState<StatusPeringatan>('idle')
  const [pelanggaranCount, setPelanggaranCount] = useState(0)
  const [showPeringatan, setShowPeringatan] = useState(false)
  const waktuKembaliRef = useRef<number | null>(null)
  const [showIdlePopup, setShowIdlePopup] = useState(false)
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null)
  const IDLE_TIMEOUT = 90000
  const syncTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isSyncingRef = useRef(false)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)
  const [showKonfirmasiSubmit, setShowKonfirmasiSubmit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const sudahSubmitRef = useRef(false)

  useEffect(() => { loadUjian() }, [])

  async function loadUjian() {
    try {
      const token = sessionStorage.getItem('sesi_token')
      const mahasiswaData = sessionStorage.getItem('mahasiswa_data')
      const ujianData = sessionStorage.getItem('ujian_data')
      if (!token || !mahasiswaData || !ujianData) { router.replace('/'); return }
      const mahasiswa = JSON.parse(mahasiswaData)
      const ujian = JSON.parse(ujianData)
      const { data: sesiDB, error: errSesi } = await supabase.from('sesi_ujian').select('*').eq('token_sesi', token).single()
      if (errSesi || !sesiDB) { router.replace('/'); return }
      if (['selesai', 'auto_submit', 'paksa_submit'].includes(sesiDB.status)) { router.replace('/selesai'); return }
      const { data: soalDB, error: errSoal } = await supabase
        .from('soal').select('id, ujian_id, nomor_urut, pertanyaan, tipe, opsi_jawaban, bobot_nilai')
        .eq('ujian_id', ujian.id).order('nomor_urut')
      if (errSoal || !soalDB) throw new Error('Gagal memuat soal')
      let soalFinal = soalDB as Soal[]
      if (ujian.acak_soal) {
        if (sesiDB.urutan_soal && sesiDB.urutan_soal.length > 0) {
          const urutanId = sesiDB.urutan_soal as string[]
          soalFinal = urutanId.map((id: string) => soalDB.find((s) => s.id === id)).filter(Boolean) as Soal[]
        } else {
          soalFinal = acakArray(soalDB as Soal[])
          await supabase.from('sesi_ujian').update({ urutan_soal: soalFinal.map((s) => s.id) }).eq('id', sesiDB.id)
        }
      }
      if (sesiDB.status === 'belum_mulai') {
        await supabase.from('sesi_ujian').update({ status: 'mengerjakan', waktu_mulai: new Date().toISOString() }).eq('id', sesiDB.id)
        sesiDB.status = 'mengerjakan'
        sesiDB.waktu_mulai = new Date().toISOString()
      }
      const { data: jawabanDB } = await supabase.from('jawaban').select('soal_id, jawaban_mahasiswa').eq('sesi_id', sesiDB.id)
      const jawabanMap: Record<string, string> = {}
      jawabanDB?.forEach((j) => { if (j.jawaban_mahasiswa) jawabanMap[j.soal_id] = j.jawaban_mahasiswa })
      const sesiLokal = ambilSesiLokal()
      if (sesiLokal && sesiLokal.sesi_id === sesiDB.id) {
        Object.entries(sesiLokal.jawaban).forEach(([soal_id, data]) => { if (data.jawaban) jawabanMap[soal_id] = data.jawaban })
      }
      if (!sesiLokal || sesiLokal.sesi_id !== sesiDB.id) {
        simpanSesiLokal({ sesi_id: sesiDB.id, token_sesi: token, ujian_id: ujian.id, nim: mahasiswa.nim,
          waktu_mulai: new Date(sesiDB.waktu_mulai).getTime(), jawaban: {}, jumlah_pelanggaran: sesiDB.jumlah_pelanggaran, last_sync: Date.now() })
      }
      setSesi({ ...sesiDB, ujian, mahasiswa })
      setSoalList(soalDB as Soal[])
      setSoalTerurut(soalFinal)
      setJawabanState(jawabanMap)
      setPelanggaranCount(sesiDB.jumlah_pelanggaran)
      setSisaDetik(hitungSisaDetik(sesiDB.waktu_mulai, ujian.durasi_menit))
      setLoading(false)
    } catch (err) { console.error(err); alert('Gagal memuat ujian. Hubungi pengawas.') }
  }

  useEffect(() => {
    async function requestWakeLock() {
      try { if ('wakeLock' in navigator) wakeLockRef.current = await (navigator as any).wakeLock.request('screen') } catch (e) {}
    }
    requestWakeLock()
    const fn = () => { if (document.visibilityState === 'visible') requestWakeLock() }
    document.addEventListener('visibilitychange', fn)
    return () => { document.removeEventListener('visibilitychange', fn); wakeLockRef.current?.release() }
  }, [])

  useEffect(() => {
    if (loading || !sesi) return
    timerRef.current = setInterval(() => {
      setSisaDetik((prev) => { if (prev <= 1) { clearInterval(timerRef.current!); handleAutoSubmitWaktu(); return 0 } return prev - 1 })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [loading, sesi])

  useEffect(() => {
    if (loading || !sesi) return
    syncTimerRef.current = setInterval(() => { syncJawaban() }, 15000)
    return () => clearInterval(syncTimerRef.current!)
  }, [loading, sesi, jawabanState])

  const syncJawaban = useCallback(async () => {
    if (isSyncingRef.current || !sesi) return
    isSyncingRef.current = true
    try {
      const sesiLokal = ambilSesiLokal()
      if (!sesiLokal) return
      const belumSync = hitungJawabanBelumSync(sesiLokal)
      if (belumSync.length === 0) return
      const upsertData = belumSync.map((soal_id) => ({ sesi_id: sesi.id, soal_id, jawaban_mahasiswa: sesiLokal.jawaban[soal_id]?.jawaban || null }))
      const { error } = await supabase.from('jawaban').upsert(upsertData, { onConflict: 'sesi_id,soal_id' })
      if (!error) tandaiSudahSync(sesiLokal, belumSync)
    } catch (e) { console.error('Sync gagal:', e) } finally { isSyncingRef.current = false }
  }, [sesi])

  const resetIdleTimer = useCallback(() => {
    setShowIdlePopup(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => { setShowIdlePopup(true) }, IDLE_TIMEOUT)
  }, [])

  useEffect(() => {
    if (loading) return
    const events = ['touchstart', 'touchmove', 'click', 'keydown']
    events.forEach((e) => window.addEventListener(e, resetIdleTimer))
    resetIdleTimer()
    return () => { events.forEach((e) => window.removeEventListener(e, resetIdleTimer)); if (idleTimerRef.current) clearTimeout(idleTimerRef.current) }
  }, [loading, resetIdleTimer])

  useEffect(() => {
    if (loading || !sesi) return
    async function handlePelanggaran(tipe: 'pindah_tab' | 'blur_app') {
      if (sudahSubmitRef.current) return
      waktuKembaliRef.current = Date.now()
      try {
        const { data } = await supabase.rpc('catat_pelanggaran', { p_sesi_id: sesi!.id, p_tipe: tipe, p_keterangan: tipe === 'pindah_tab' ? 'Tab berpindah' : 'Browser blur' })
        if (!data) return
        const jumlah = data.jumlah_pelanggaran as number
        const autoSubmit = data.auto_submit as boolean
        setPelanggaranCount(jumlah)
        if (autoSubmit) { setStatusPeringatan('auto_submit'); setShowPeringatan(true); sudahSubmitRef.current = true; await syncJawaban(); setTimeout(() => router.replace('/selesai'), 3000) }
        else { setStatusPeringatan(jumlah === 1 ? 'peringatan1' : jumlah === 2 ? 'peringatan2' : 'peringatan3'); setShowPeringatan(true) }
      } catch (e) { console.error(e) }
    }
    const onVisibility = () => { if (document.visibilityState === 'hidden') handlePelanggaran('pindah_tab') }
    const onBlur = () => { if (document.visibilityState === 'visible') handlePelanggaran('blur_app') }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('blur', onBlur) }
  }, [loading, sesi, syncJawaban, router])

  function handleJawab(soalId: string, jawaban: string) {
    setJawabanState((prev) => ({ ...prev, [soalId]: jawaban }))
    resetIdleTimer()
    const sesiLokal = ambilSesiLokal()
    if (sesiLokal) simpanJawabanLokal(sesiLokal, soalId, jawaban)
  }

  function handleNavigasiSoal(indeks: number) {
    setIndeksSoalAktif(indeks); resetIdleTimer(); window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleAutoSubmitWaktu() {
    if (sudahSubmitRef.current) return
    sudahSubmitRef.current = true
    await syncJawaban()
    await supabase.rpc('submit_ujian', { p_sesi_id: sesi!.id })
    router.replace('/selesai')
  }

  async function handleSubmitManual() {
    if (submitting || sudahSubmitRef.current) return
    setSubmitting(true); sudahSubmitRef.current = true
    try {
      await syncJawaban()
      const { error } = await supabase.rpc('submit_ujian', { p_sesi_id: sesi!.id })
      if (error) throw error
      router.replace('/selesai')
    } catch (err) { console.error(err); alert('Gagal submit. Coba lagi atau hubungi pengawas.'); setSubmitting(false); sudahSubmitRef.current = false }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 text-sm">Memuat soal ujian...</p>
      </div>
    )
  }

  if (!sesi || soalTerurut.length === 0) return null

  const soalAktif = soalTerurut[indeksSoalAktif]
  const totalSoal = soalTerurut.length
  const totalTerjawab = Object.keys(jawabanState).filter((id) => soalTerurut.some((s) => s.id === id)).length
  const isTimerWarning = sisaDetik <= 300
  const ujianData = sesi.ujian as any
  const mahasiswaData = sesi.mahasiswa as any

  return (
    <div
      className="min-h-screen bg-gray-50 flex flex-col relative"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onContextMenu={e => e.preventDefault()}
      onCopy={e => e.preventDefault()}
      onCut={e => e.preventDefault()}
    >
      <div className="watermark" aria-hidden="true">{mahasiswaData?.nim} • {mahasiswaData?.nama}</div>

      {/* HEADER */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex-1 min-w-0 mr-3">
              <p className="text-xs text-gray-400 truncate">{ujianData?.mata_kuliah?.nama_matkul}</p>
              <p className="text-sm font-semibold text-gray-800 truncate">{ujianData?.judul}</p>
            </div>
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-base ${isTimerWarning ? 'bg-red-50 text-red-600' : 'bg-primary-50 text-primary-700'}`}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {formatDurasi(sisaDetik)}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${(totalTerjawab / totalSoal) * 100}%` }} />
            </div>
            <span className="text-xs text-gray-500 flex-shrink-0">{totalTerjawab}/{totalSoal}</span>
          </div>
        </div>
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2">
            {soalTerurut.map((soal, idx) => {
              const terjawab = !!jawabanState[soal.id]
              const aktif = idx === indeksSoalAktif
              return (
                <button key={soal.id} onClick={() => handleNavigasiSoal(idx)}
                  className={`soal-pill flex-shrink-0 ${aktif ? 'soal-pill-aktif' : terjawab ? 'soal-pill-terjawab' : 'soal-pill-kosong'}`}>
                  {idx + 1}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* KONTEN SOAL */}
      <div className="flex-1 px-4 py-5 pb-32">
        <div className="card animate-fade-in" key={soalAktif.id}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-primary-600">Soal {indeksSoalAktif + 1} dari {totalSoal}</span>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${soalAktif.tipe === 'pg' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
              {soalAktif.tipe === 'pg' ? 'Pilihan Ganda' : 'Esai'}
            </span>
          </div>

          <div className="text-gray-800 text-base leading-relaxed mb-5 font-medium" style={{ pointerEvents: 'none' }}>
            {soalAktif.pertanyaan}
          </div>

          {soalAktif.tipe === 'pg' && soalAktif.opsi_jawaban && (
            <div className="space-y-3">
              {soalAktif.opsi_jawaban.map((opsi, idx) => {
                const huruf = ambilHurufOpsi(opsi)
                const dipilih = jawabanState[soalAktif.id] === huruf
                return (
                  <button key={idx} onClick={() => handleJawab(soalAktif.id, huruf)}
                    className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all duration-150 flex items-start gap-3 touch-manipulation ${dipilih ? 'border-primary-500 bg-primary-50' : 'border-gray-100 bg-gray-50 active:bg-gray-100'}`}>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5 ${dipilih ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}>{huruf}</span>
                    <span className={`text-sm leading-relaxed ${dipilih ? 'text-primary-800 font-medium' : 'text-gray-700'}`} style={{ pointerEvents: 'none' }}>
                      {opsi.substring(2).trim()}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {soalAktif.tipe === 'esai' && (
            <textarea
              className="input-field min-h-[140px] resize-none text-sm leading-relaxed"
              placeholder="Tulis jawaban kamu di sini..."
              value={jawabanState[soalAktif.id] || ''}
              onChange={(e) => handleJawab(soalAktif.id, e.target.value)}
              onFocus={resetIdleTimer}
              style={{ userSelect: 'text', WebkitUserSelect: 'text', pointerEvents: 'auto' }}
            />
          )}
        </div>
      </div>

      {/* NAVIGASI BAWAH */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => handleNavigasiSoal(Math.max(0, indeksSoalAktif - 1))} disabled={indeksSoalAktif === 0} className="btn-secondary px-4 py-3">
            ← Sebelumnya
          </button>
          {indeksSoalAktif < totalSoal - 1 ? (
            <button onClick={() => handleNavigasiSoal(indeksSoalAktif + 1)} className="btn-primary flex-1 py-3">Selanjutnya →</button>
          ) : (
            <button onClick={() => setShowKonfirmasiSubmit(true)} className="flex-1 py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 active:bg-green-800 transition-all">
              Kirim
            </button>
          )}
        </div>
      </div>

      {/* POPUP IDLE */}
      {showIdlePopup && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-2xl">
            <div className="text-4xl mb-3">⏰</div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">Masih mengerjakan?</h3>
            <p className="text-gray-500 text-sm mb-5">Tidak ada aktivitas terdeteksi. Ketuk tombol di bawah untuk melanjutkan.</p>
            <button onClick={() => { setShowIdlePopup(false); resetIdleTimer() }} className="btn-primary w-full">Ya, Saya Masih Di Sini</button>
          </div>
        </div>
      )}

      {/* POPUP PERINGATAN */}
      {showPeringatan && statusPeringatan !== 'idle' && statusPeringatan !== 'auto_submit' && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border-t-4 border-t-red-500">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">{statusPeringatan === 'peringatan1' ? '⚠️' : statusPeringatan === 'peringatan2' ? '🚨' : '🔴'}</div>
              <h3 className="font-bold text-red-700 text-lg">{statusPeringatan === 'peringatan1' ? 'Peringatan Pertama' : statusPeringatan === 'peringatan2' ? 'Peringatan Kedua!' : 'PERINGATAN TERAKHIR!'}</h3>
            </div>
            <p className="text-gray-700 text-sm leading-relaxed mb-2 text-center">
              {statusPeringatan === 'peringatan1' ? 'Perpindahan dari halaman ujian terdeteksi. Aktivitas ini telah dicatat.'
                : statusPeringatan === 'peringatan2' ? 'Pelanggaran kembali terdeteksi. Aktivitasmu terus dipantau.'
                : 'Pelanggaran TERAKHIR. Jika terdeteksi lagi, ujian akan langsung diakhiri sistem.'}
            </p>
            <div className="bg-red-50 rounded-xl p-3 mb-4">
              <p className="text-red-700 text-xs text-center font-medium">Pelanggaran ke-{pelanggaranCount} telah tercatat</p>
            </div>
            <button onClick={() => setShowPeringatan(false)} className="w-full py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 transition-all">
              Saya Mengerti, Lanjutkan Ujian
            </button>
          </div>
        </div>
      )}

      {/* POPUP AUTO-SUBMIT */}
      {statusPeringatan === 'auto_submit' && (
        <div className="overlay">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border-t-4 border-t-gray-800 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h3 className="font-bold text-gray-800 text-xl mb-2">Ujian Diakhiri</h3>
            <p className="text-gray-600 text-sm leading-relaxed mb-4">Ujian diakhiri otomatis karena pelanggaran berulang. Semua jawaban telah dikumpulkan.</p>
            <p className="text-gray-400 text-xs">Mengarahkan ke halaman ringkasan...</p>
          </div>
        </div>
      )}

      {/* POPUP KONFIRMASI KIRIM */}
      {showKonfirmasiSubmit && (
        <div className="overlay animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">📤</div>
              <h3 className="font-bold text-gray-800 text-lg">Kirim Jawaban?</h3>
              <p className="text-gray-500 text-sm mt-2">Pastikan semua jawaban sudah diisi. Jawaban tidak dapat diubah setelah dikirim.</p>
            </div>
            <div className="space-y-3">
              <button onClick={handleSubmitManual} disabled={submitting} className="btn-primary w-full">
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Mengirim...
                  </span>
                ) : 'Ya, Kirim Sekarang'}
              </button>
              <button onClick={() => setShowKonfirmasiSubmit(false)} disabled={submitting} className="btn-secondary w-full">Kembali</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
