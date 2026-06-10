// ============================================================
// Types — Portal Ujian INSTIPER
// Sesuai dengan schema Supabase PostgreSQL
// ============================================================

export type TipeSoal = 'pg' | 'esai'
export type StatusUjian = 'draft' | 'aktif' | 'selesai' | 'dibatalkan'
export type StatusSesi = 'belum_mulai' | 'mengerjakan' | 'selesai' | 'auto_submit' | 'paksa_submit'
export type TipeProdi = 'agroteknologi' | 'agribisnis'
export type TipeMinat = 'spks' | 'antan' | 'smbp' | 'spa' | 'sea'
export type TipeLog = 'pindah_tab' | 'blur_app' | 'sesi_terputus' | 'auto_submit' | 'paksa_submit'
export type RoleAdmin = 'superadmin' | 'admin'

// ============================================================
// DATABASE ROWS
// ============================================================

export interface Mahasiswa {
  nim: string
  nama: string
  prodi: TipeProdi
  minat: TipeMinat
  angkatan: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Dosen {
  id: string
  kode_dosen: string
  nama: string
  email?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MataKuliah {
  id: string
  kode_matkul: string
  nama_matkul: string
  dosen_id: string
  prodi: TipeProdi
  sks: number
  is_active: boolean
  created_at: string
  updated_at: string
  // Join
  dosen?: Dosen
}

export interface Ujian {
  id: string
  matkul_id: string
  judul: string
  deskripsi?: string
  prodi_target: TipeProdi
  minat_target: TipeMinat[]
  durasi_menit: number
  tanggal_mulai?: string
  tanggal_selesai?: string
  kode_ujian?: string
  status: StatusUjian
  acak_soal: boolean
  acak_pilihan: boolean
  maks_pelanggaran: number
  created_by: string
  created_at: string
  updated_at: string
  // Join
  mata_kuliah?: MataKuliah
}

export interface Soal {
  id: string
  ujian_id: string
  nomor_urut: number
  pertanyaan: string
  tipe: TipeSoal
  opsi_jawaban?: string[] | null
  // kunci_jawaban TIDAK di-fetch di sisi mahasiswa
  bobot_nilai: number
  penjelasan?: string
  created_at: string
  updated_at: string
}

export interface SesiUjian {
  id: string
  ujian_id: string
  nim: string
  token_sesi: string
  urutan_soal?: string[] | null
  urutan_pilihan?: Record<string, string[]> | null
  waktu_mulai?: string
  waktu_selesai?: string
  waktu_auto_submit?: string
  status: StatusSesi
  jumlah_pelanggaran: number
  nilai_pg?: number
  nilai_esai?: number
  nilai_final?: number
  catatan_admin?: string
  created_at: string
  updated_at: string
  // Joined data (dari sessionStorage, bukan DB join)
  ujian?: Ujian
  mahasiswa?: Mahasiswa
}

export interface Jawaban {
  id: string
  sesi_id: string
  soal_id: string
  jawaban_mahasiswa?: string
  adalah_benar?: boolean
  nilai_esai?: number
  catatan_esai?: string
  waktu_pertama_jawab?: string
  waktu_terakhir_update?: string
  created_at: string
  updated_at: string
}

export interface LogAktivitas {
  id: string
  sesi_id: string
  nim: string
  ujian_id: string
  tipe_event: TipeLog
  keterangan?: string
  nomor_pelanggaran?: number
  timestamp: string
}

// ============================================================
// LOCAL STORAGE TYPES
// ============================================================

export interface JawabanLokal {
  jawaban: string
  sudah_sync: boolean
  updated_at: number
}

export interface SesiLokal {
  sesi_id: string
  token_sesi: string
  ujian_id: string
  nim: string
  waktu_mulai: number
  jawaban: Record<string, JawabanLokal>
  jumlah_pelanggaran: number
  last_sync: number
}

// ============================================================
// ADMIN VIEWS
// ============================================================

export interface RekapUjian {
  sesi_id: string
  nama_ujian: string
  nama_matkul: string
  nama_dosen: string
  nim: string
  nama_mahasiswa: string
  prodi: TipeProdi
  minat: TipeMinat
  angkatan: number
  status: StatusSesi
  waktu_mulai?: string
  waktu_selesai?: string
  jumlah_pelanggaran: number
  nilai_pg?: number
  nilai_esai?: number
  nilai_final?: number
  status_kecurangan: string
  tanggal_ujian?: string
}

export interface MonitorLive {
  ujian_id: string
  judul: string
  kode_ujian?: string
  status: StatusUjian
  total_terdaftar: number
  sedang_mengerjakan: number
  sudah_selesai: number
  auto_submit_count: number
  ada_pelanggaran: number
  rata_rata_nilai?: number
}
