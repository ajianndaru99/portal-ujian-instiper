import { SesiLokal, JawabanLokal } from './types'

const STORAGE_KEY = 'portal_ujian_sesi'

// ============================================================
// FORMAT WAKTU
// ============================================================

/**
 * Format detik menjadi MM:SS atau HH:MM:SS
 */
export function formatDurasi(totalDetik: number): string {
  if (totalDetik < 0) totalDetik = 0
  const jam = Math.floor(totalDetik / 3600)
  const menit = Math.floor((totalDetik % 3600) / 60)
  const detik = totalDetik % 60

  if (jam > 0) {
    return `${String(jam).padStart(2, '0')}:${String(menit).padStart(2, '0')}:${String(detik).padStart(2, '0')}`
  }
  return `${String(menit).padStart(2, '0')}:${String(detik).padStart(2, '0')}`
}

/**
 * Hitung sisa detik berdasarkan waktu_mulai dan durasi
 */
export function hitungSisaDetik(waktuMulai: string, durasiMenit: number): number {
  const mulai = new Date(waktuMulai).getTime()
  const selesai = mulai + durasiMenit * 60 * 1000
  const sekarang = Date.now()
  return Math.max(0, Math.floor((selesai - sekarang) / 1000))
}

// ============================================================
// LOCAL STORAGE
// ============================================================

/**
 * Simpan sesi ke localStorage
 */
export function simpanSesiLokal(sesi: SesiLokal): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sesi))
  } catch (e) {
    console.warn('Gagal simpan sesi lokal:', e)
  }
}

/**
 * Ambil sesi dari localStorage
 */
export function ambilSesiLokal(): SesiLokal | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SesiLokal
  } catch {
    return null
  }
}

/**
 * Hapus sesi dari localStorage
 */
export function hapusSesiLokal(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.warn('Gagal hapus sesi lokal:', e)
  }
}

/**
 * Simpan jawaban ke localStorage (offline-first)
 */
export function simpanJawabanLokal(sesi: SesiLokal, soalId: string, jawaban: string): void {
  sesi.jawaban[soalId] = {
    jawaban,
    sudah_sync: false,
    updated_at: Date.now(),
  }
  simpanSesiLokal(sesi)
}

/**
 * Tandai jawaban sudah disync ke DB
 */
export function tandaiSudahSync(sesi: SesiLokal, soalIds: string[]): void {
  soalIds.forEach((id) => {
    if (sesi.jawaban[id]) {
      sesi.jawaban[id].sudah_sync = true
    }
  })
  sesi.last_sync = Date.now()
  simpanSesiLokal(sesi)
}

/**
 * Ambil daftar soal_id yang belum disync
 */
export function hitungJawabanBelumSync(sesi: SesiLokal): string[] {
  return Object.entries(sesi.jawaban)
    .filter(([, data]) => !data.sudah_sync)
    .map(([soalId]) => soalId)
}

// ============================================================
// ARRAY UTILITIES
// ============================================================

/**
 * Fisher-Yates shuffle — acak array secara merata
 */
export function acakArray<T>(arr: T[]): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ============================================================
// SOAL UTILITIES
// ============================================================

/**
 * Ambil huruf opsi dari string seperti "A. Jawaban..."
 * Mengembalikan "A", "B", "C", dst.
 */
export function ambilHurufOpsi(opsi: string): string {
  const match = opsi.match(/^([A-Z])\./i)
  return match ? match[1].toUpperCase() : opsi.charAt(0).toUpperCase()
}

/**
 * Format label waktu ujian
 */
export function formatTanggalWaktu(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  })
}

/**
 * Hitung durasi dalam menit antara dua timestamp ISO
 */
export function hitungDurasiMenit(mulai: string, selesai: string): number {
  const ms = new Date(selesai).getTime() - new Date(mulai).getTime()
  return Math.round(ms / 60000)
}

/**
 * Konversi nilai (0-100) ke huruf mutu
 */
export function nilaiKeHuruf(nilai: number): string {
  if (nilai >= 85) return 'A'
  if (nilai >= 75) return 'B+'
  if (nilai >= 65) return 'B'
  if (nilai >= 55) return 'C+'
  if (nilai >= 45) return 'C'
  if (nilai >= 35) return 'D'
  return 'E'
}

// ============================================================
// RETRY UTILITY
// ============================================================

/**
 * Wrap an async function with exponential backoff retry logic.
 * Used to handle transient Supabase connection failures when
 * the free tier pooler is temporarily full.
 *
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelayMs - Base delay in ms, doubles each retry (default: 2000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 2000
): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt)
        console.warn(`Retry ${attempt + 1}/${maxRetries} in ${delay}ms...`, err)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}
