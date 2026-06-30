-- =============================================
-- Schema Supabase untuk Portal Ujian
-- Jalankan di: https://app.supabase.com → SQL Editor
-- =============================================

-- Tabel ujian
CREATE TABLE IF NOT EXISTS ujian (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  judul       TEXT NOT NULL,
  kode_ujian  TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'aktif', 'selesai')),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabel soal
CREATE TABLE IF NOT EXISTS soal (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ujian_id        UUID NOT NULL REFERENCES ujian(id) ON DELETE CASCADE,
  nomor_urut      INTEGER NOT NULL,
  pertanyaan      TEXT NOT NULL,
  tipe            TEXT NOT NULL CHECK (tipe IN ('pg', 'esai')),
  opsi_jawaban    TEXT,       -- JSON array string: ["A. ...", "B. ...", ...]
  kunci_jawaban   TEXT,       -- 'A' | 'B' | 'C' | 'D' | NULL (untuk esai)
  bobot_nilai     INTEGER NOT NULL DEFAULT 10,
  created_at      TIMESTAMPTZ DEFAULT now(),

  UNIQUE (ujian_id, nomor_urut)
);

-- Indeks
CREATE INDEX IF NOT EXISTS idx_soal_ujian_id ON soal(ujian_id);

-- ============================================
-- CRITICAL INDEXES FOR SCALABILITY
-- ============================================

-- sesi_ujian
CREATE INDEX IF NOT EXISTS idx_sesi_token_sesi ON sesi_ujian(token_sesi);
CREATE INDEX IF NOT EXISTS idx_sesi_nim ON sesi_ujian(nim);
CREATE INDEX IF NOT EXISTS idx_sesi_ujian_id ON sesi_ujian(ujian_id);
CREATE INDEX IF NOT EXISTS idx_sesi_ujian_nim_composite ON sesi_ujian(ujian_id, nim);

-- jawaban
CREATE INDEX IF NOT EXISTS idx_jawaban_sesi_id ON jawaban(sesi_id);
CREATE INDEX IF NOT EXISTS idx_jawaban_sesi_soal ON jawaban(sesi_id, soal_id);

-- log_aktivitas
CREATE INDEX IF NOT EXISTS idx_log_sesi_id ON log_aktivitas(sesi_id);
CREATE INDEX IF NOT EXISTS idx_log_ujian_id ON log_aktivitas(ujian_id);

-- mahasiswa
CREATE INDEX IF NOT EXISTS idx_mahasiswa_nim ON mahasiswa(nim);

-- ── Data Contoh (opsional, hapus jika tidak diperlukan) ──────────────────────

INSERT INTO ujian (judul, kode_ujian, status) VALUES
  ('Ujian Tengah Semester Pemrograman Web', 'UTS-WEBPROG-2025', 'draft'),
  ('Ujian Akhir Semester Basis Data',       'UAS-BASDAT-2025',  'draft')
ON CONFLICT (kode_ujian) DO NOTHING;
