-- ============================================================
-- SISTEM UJIAN ONLINE FAPERTA INSTIPER YOGYAKARTA
-- Supabase PostgreSQL Schema
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE tipe_soal AS ENUM ('pg', 'esai');
CREATE TYPE status_ujian AS ENUM ('draft', 'aktif', 'selesai', 'dibatalkan');
CREATE TYPE status_sesi AS ENUM ('belum_mulai', 'mengerjakan', 'selesai', 'auto_submit', 'paksa_submit');
CREATE TYPE tipe_prodi AS ENUM ('agroteknologi', 'agribisnis');
CREATE TYPE tipe_minat AS ENUM ('spks', 'antan', 'smbp', 'spa', 'sea');
CREATE TYPE tipe_log AS ENUM ('pindah_tab', 'blur_app', 'sesi_terputus', 'auto_submit', 'paksa_submit');
CREATE TYPE role_admin AS ENUM ('superadmin', 'admin');

-- ============================================================
-- TABLE: admins
-- ============================================================

CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  role role_admin NOT NULL DEFAULT 'admin',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: dosen
-- ============================================================

CREATE TABLE dosen (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kode_dosen TEXT UNIQUE NOT NULL,
  nama TEXT NOT NULL,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: mahasiswa
-- ============================================================

CREATE TABLE mahasiswa (
  nim TEXT PRIMARY KEY,
  nama TEXT NOT NULL,
  prodi tipe_prodi NOT NULL,
  minat tipe_minat NOT NULL,
  angkatan INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT angkatan_valid CHECK (angkatan >= 2000 AND angkatan <= 2100)
);

-- ============================================================
-- TABLE: mata_kuliah
-- ============================================================

CREATE TABLE mata_kuliah (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kode_matkul TEXT UNIQUE NOT NULL,
  nama_matkul TEXT NOT NULL,
  dosen_id UUID NOT NULL REFERENCES dosen(id) ON DELETE RESTRICT,
  prodi tipe_prodi NOT NULL,
  sks INTEGER NOT NULL DEFAULT 3,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: ujian
-- ============================================================

CREATE TABLE ujian (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matkul_id UUID NOT NULL REFERENCES mata_kuliah(id) ON DELETE RESTRICT,
  judul TEXT NOT NULL,
  deskripsi TEXT,
  prodi_target tipe_prodi NOT NULL,
  minat_target tipe_minat[] NOT NULL DEFAULT '{}',
  durasi_menit INTEGER NOT NULL DEFAULT 90,
  tanggal_mulai TIMESTAMPTZ,
  tanggal_selesai TIMESTAMPTZ,
  kode_ujian TEXT UNIQUE,
  status status_ujian NOT NULL DEFAULT 'draft',
  acak_soal BOOLEAN NOT NULL DEFAULT true,
  acak_pilihan BOOLEAN NOT NULL DEFAULT true,
  maks_pelanggaran INTEGER NOT NULL DEFAULT 4,
  created_by UUID NOT NULL REFERENCES admins(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT durasi_valid CHECK (durasi_menit > 0 AND durasi_menit <= 480),
  CONSTRAINT tanggal_valid CHECK (
    tanggal_mulai IS NULL OR 
    tanggal_selesai IS NULL OR 
    tanggal_selesai > tanggal_mulai
  )
);

-- ============================================================
-- TABLE: soal
-- ============================================================

CREATE TABLE soal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ujian_id UUID NOT NULL REFERENCES ujian(id) ON DELETE CASCADE,
  nomor_urut INTEGER NOT NULL,
  pertanyaan TEXT NOT NULL,
  tipe tipe_soal NOT NULL DEFAULT 'pg',
  -- Untuk PG: ["A. ...", "B. ...", "C. ...", "D. ...", "E. ..."]
  opsi_jawaban JSONB,
  -- Untuk PG: "A" / "B" / dst. Untuk esai: null (dinilai manual)
  kunci_jawaban TEXT,
  bobot_nilai NUMERIC(5,2) NOT NULL DEFAULT 1.0,
  penjelasan TEXT, -- Opsional: penjelasan jawaban benar
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT nomor_urut_positif CHECK (nomor_urut > 0),
  CONSTRAINT bobot_positif CHECK (bobot_nilai > 0),
  UNIQUE(ujian_id, nomor_urut)
);

-- ============================================================
-- TABLE: sesi_ujian
-- Satu baris = satu mahasiswa mengerjakan satu ujian
-- ============================================================

CREATE TABLE sesi_ujian (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ujian_id UUID NOT NULL REFERENCES ujian(id) ON DELETE RESTRICT,
  nim TEXT NOT NULL REFERENCES mahasiswa(nim) ON DELETE RESTRICT,
  token_sesi TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  -- Urutan soal yang diacak khusus untuk mahasiswa ini (array of soal_id)
  urutan_soal JSONB,
  -- Urutan pilihan yang diacak per soal { soal_id: ["C","A","E","B","D"] }
  urutan_pilihan JSONB,
  waktu_mulai TIMESTAMPTZ,
  waktu_selesai TIMESTAMPTZ,
  waktu_auto_submit TIMESTAMPTZ,
  status status_sesi NOT NULL DEFAULT 'belum_mulai',
  jumlah_pelanggaran INTEGER NOT NULL DEFAULT 0,
  nilai_pg NUMERIC(6,2),
  nilai_esai NUMERIC(6,2),
  nilai_final NUMERIC(6,2),
  catatan_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(ujian_id, nim)
);

-- ============================================================
-- TABLE: jawaban
-- Satu baris = satu jawaban mahasiswa untuk satu soal
-- ============================================================

CREATE TABLE jawaban (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sesi_id UUID NOT NULL REFERENCES sesi_ujian(id) ON DELETE CASCADE,
  soal_id UUID NOT NULL REFERENCES soal(id) ON DELETE CASCADE,
  jawaban_mahasiswa TEXT,
  adalah_benar BOOLEAN, -- NULL untuk esai (belum dinilai)
  nilai_esai NUMERIC(5,2), -- Diisi manual oleh admin untuk esai
  catatan_esai TEXT, -- Catatan admin saat menilai esai
  waktu_pertama_jawab TIMESTAMPTZ,
  waktu_terakhir_update TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(sesi_id, soal_id)
);

-- ============================================================
-- TABLE: log_aktivitas
-- Rekam semua aktivitas mencurigakan
-- ============================================================

CREATE TABLE log_aktivitas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sesi_id UUID NOT NULL REFERENCES sesi_ujian(id) ON DELETE CASCADE,
  nim TEXT NOT NULL,
  ujian_id UUID NOT NULL,
  tipe_event tipe_log NOT NULL,
  keterangan TEXT,
  nomor_pelanggaran INTEGER, -- Ke berapa kali (untuk pindah_tab & blur)
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES untuk performa query
-- ============================================================

-- Mahasiswa
CREATE INDEX idx_mahasiswa_prodi ON mahasiswa(prodi);
CREATE INDEX idx_mahasiswa_minat ON mahasiswa(minat);
CREATE INDEX idx_mahasiswa_angkatan ON mahasiswa(angkatan);

-- Ujian
CREATE INDEX idx_ujian_status ON ujian(status);
CREATE INDEX idx_ujian_kode ON ujian(kode_ujian);
CREATE INDEX idx_ujian_matkul ON ujian(matkul_id);
CREATE INDEX idx_ujian_prodi ON ujian(prodi_target);
CREATE INDEX idx_ujian_tanggal ON ujian(tanggal_mulai, tanggal_selesai);

-- Soal
CREATE INDEX idx_soal_ujian ON soal(ujian_id);
CREATE INDEX idx_soal_tipe ON soal(tipe);

-- Sesi
CREATE INDEX idx_sesi_ujian ON sesi_ujian(ujian_id);
CREATE INDEX idx_sesi_nim ON sesi_ujian(nim);
CREATE INDEX idx_sesi_status ON sesi_ujian(status);
CREATE INDEX idx_sesi_token ON sesi_ujian(token_sesi);

-- Jawaban
CREATE INDEX idx_jawaban_sesi ON jawaban(sesi_id);
CREATE INDEX idx_jawaban_soal ON jawaban(soal_id);

-- Log
CREATE INDEX idx_log_sesi ON log_aktivitas(sesi_id);
CREATE INDEX idx_log_nim ON log_aktivitas(nim);
CREATE INDEX idx_log_ujian ON log_aktivitas(ujian_id);
CREATE INDEX idx_log_tipe ON log_aktivitas(tipe_event);
CREATE INDEX idx_log_timestamp ON log_aktivitas(timestamp);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Fungsi: update kolom updated_at otomatis
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Terapkan trigger updated_at ke semua tabel
CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_dosen_updated_at
  BEFORE UPDATE ON dosen
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_mahasiswa_updated_at
  BEFORE UPDATE ON mahasiswa
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_matkul_updated_at
  BEFORE UPDATE ON mata_kuliah
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ujian_updated_at
  BEFORE UPDATE ON ujian
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_soal_updated_at
  BEFORE UPDATE ON soal
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sesi_updated_at
  BEFORE UPDATE ON sesi_ujian
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_jawaban_updated_at
  BEFORE UPDATE ON jawaban
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FUNCTION: Generate kode ujian unik (6 karakter alphanumeric)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_kode_ujian()
RETURNS TEXT AS $$
DECLARE
  kode TEXT;
  exists_check INTEGER;
BEGIN
  LOOP
    -- Generate 6 karakter uppercase alphanumeric
    kode := upper(substring(encode(gen_random_bytes(6), 'base64') FROM 1 FOR 6));
    -- Hapus karakter non-alphanumeric
    kode := regexp_replace(kode, '[^A-Z0-9]', '', 'g');
    -- Pastikan panjang 6, ulangi jika kurang
    IF length(kode) >= 6 THEN
      kode := substring(kode FROM 1 FOR 6);
      -- Cek apakah kode sudah ada
      SELECT COUNT(*) INTO exists_check FROM ujian WHERE kode_ujian = kode;
      IF exists_check = 0 THEN
        RETURN kode;
      END IF;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Auto-hitung nilai PG setelah ujian selesai
-- ============================================================

CREATE OR REPLACE FUNCTION hitung_nilai_pg(p_sesi_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  total_bobot NUMERIC := 0;
  bobot_benar NUMERIC := 0;
  nilai NUMERIC := 0;
BEGIN
  -- Hitung total bobot soal PG dalam ujian ini
  SELECT COALESCE(SUM(s.bobot_nilai), 0)
  INTO total_bobot
  FROM jawaban j
  JOIN soal s ON s.id = j.soal_id
  WHERE j.sesi_id = p_sesi_id
    AND s.tipe = 'pg';

  -- Hitung bobot soal PG yang dijawab benar
  SELECT COALESCE(SUM(s.bobot_nilai), 0)
  INTO bobot_benar
  FROM jawaban j
  JOIN soal s ON s.id = j.soal_id
  WHERE j.sesi_id = p_sesi_id
    AND s.tipe = 'pg'
    AND j.adalah_benar = true;

  -- Hitung nilai (skala 0-100)
  IF total_bobot > 0 THEN
    nilai := (bobot_benar / total_bobot) * 100;
  END IF;

  -- Update nilai_pg di sesi_ujian
  UPDATE sesi_ujian
  SET nilai_pg = ROUND(nilai, 2)
  WHERE id = p_sesi_id;

  RETURN ROUND(nilai, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Auto-grade jawaban PG saat disubmit
-- ============================================================

CREATE OR REPLACE FUNCTION grade_jawaban_pg()
RETURNS TRIGGER AS $$
DECLARE
  kunci TEXT;
  tipe_q tipe_soal;
BEGIN
  -- Ambil kunci jawaban dan tipe soal
  SELECT kunci_jawaban, tipe
  INTO kunci, tipe_q
  FROM soal
  WHERE id = NEW.soal_id;

  -- Hanya grade kalau PG
  IF tipe_q = 'pg' THEN
    NEW.adalah_benar := (
      LOWER(TRIM(NEW.jawaban_mahasiswa)) = LOWER(TRIM(kunci))
    );
  END IF;

  -- Set waktu pertama jawab
  IF NEW.waktu_pertama_jawab IS NULL AND NEW.jawaban_mahasiswa IS NOT NULL THEN
    NEW.waktu_pertama_jawab := NOW();
  END IF;

  NEW.waktu_terakhir_update := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grade_jawaban
  BEFORE INSERT OR UPDATE OF jawaban_mahasiswa ON jawaban
  FOR EACH ROW EXECUTE FUNCTION grade_jawaban_pg();

-- ============================================================
-- FUNCTION: Catat log pelanggaran & cek auto-submit
-- ============================================================

CREATE OR REPLACE FUNCTION catat_pelanggaran(
  p_sesi_id UUID,
  p_tipe tipe_log,
  p_keterangan TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_sesi sesi_ujian%ROWTYPE;
  v_jumlah_baru INTEGER;
  v_maks INTEGER;
  v_auto_submit BOOLEAN := false;
BEGIN
  -- Ambil data sesi
  SELECT * INTO v_sesi FROM sesi_ujian WHERE id = p_sesi_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sesi tidak ditemukan');
  END IF;

  IF v_sesi.status != 'mengerjakan' THEN
    RETURN jsonb_build_object('error', 'Sesi tidak aktif');
  END IF;

  -- Ambil batas pelanggaran dari ujian
  SELECT maks_pelanggaran INTO v_maks
  FROM ujian WHERE id = v_sesi.ujian_id;

  -- Hitung nomor pelanggaran (hanya untuk tipe yang dihitung)
  IF p_tipe IN ('pindah_tab', 'blur_app') THEN
    v_jumlah_baru := v_sesi.jumlah_pelanggaran + 1;

    -- Update counter pelanggaran
    UPDATE sesi_ujian
    SET jumlah_pelanggaran = v_jumlah_baru
    WHERE id = p_sesi_id;

    -- Insert log
    INSERT INTO log_aktivitas (sesi_id, nim, ujian_id, tipe_event, keterangan, nomor_pelanggaran)
    VALUES (p_sesi_id, v_sesi.nim, v_sesi.ujian_id, p_tipe, p_keterangan, v_jumlah_baru);

    -- Cek apakah sudah mencapai batas → auto-submit
    IF v_jumlah_baru >= v_maks THEN
      UPDATE sesi_ujian
      SET 
        status = 'auto_submit',
        waktu_selesai = NOW(),
        waktu_auto_submit = NOW()
      WHERE id = p_sesi_id;

      -- Hitung nilai PG
      PERFORM hitung_nilai_pg(p_sesi_id);

      v_auto_submit := true;

      -- Log event auto_submit
      INSERT INTO log_aktivitas (sesi_id, nim, ujian_id, tipe_event, keterangan)
      VALUES (p_sesi_id, v_sesi.nim, v_sesi.ujian_id, 'auto_submit', 
              'Auto-submit karena mencapai batas pelanggaran');
    END IF;

  ELSE
    -- Untuk sesi_terputus: catat saja, tidak hitung pelanggaran
    INSERT INTO log_aktivitas (sesi_id, nim, ujian_id, tipe_event, keterangan)
    VALUES (p_sesi_id, v_sesi.nim, v_sesi.ujian_id, p_tipe, p_keterangan);
  END IF;

  RETURN jsonb_build_object(
    'jumlah_pelanggaran', v_jumlah_baru,
    'batas_pelanggaran', v_maks,
    'auto_submit', v_auto_submit,
    'sisa_peringatan', GREATEST(0, v_maks - COALESCE(v_jumlah_baru, 0))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Submit ujian (normal)
-- ============================================================

CREATE OR REPLACE FUNCTION submit_ujian(p_sesi_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_sesi sesi_ujian%ROWTYPE;
  v_nilai NUMERIC;
BEGIN
  SELECT * INTO v_sesi FROM sesi_ujian WHERE id = p_sesi_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesi tidak ditemukan');
  END IF;

  IF v_sesi.status NOT IN ('mengerjakan', 'belum_mulai') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sesi sudah selesai');
  END IF;

  -- Update status sesi
  UPDATE sesi_ujian
  SET 
    status = 'selesai',
    waktu_selesai = NOW()
  WHERE id = p_sesi_id;

  -- Hitung nilai PG
  v_nilai := hitung_nilai_pg(p_sesi_id);

  RETURN jsonb_build_object(
    'success', true,
    'waktu_selesai', NOW(),
    'nilai_pg', v_nilai
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FUNCTION: Hitung nilai final (PG + Esai)
-- ============================================================

CREATE OR REPLACE FUNCTION hitung_nilai_final(p_sesi_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_nilai_pg NUMERIC := 0;
  v_nilai_esai NUMERIC := 0;
  v_bobot_pg NUMERIC := 0;
  v_bobot_esai NUMERIC := 0;
  v_total_bobot NUMERIC := 0;
  v_nilai_final NUMERIC := 0;
BEGIN
  -- Ambil nilai PG dan bobot total PG
  SELECT 
    COALESCE(SUM(s.bobot_nilai), 0),
    COALESCE(SUM(CASE WHEN j.adalah_benar = true THEN s.bobot_nilai ELSE 0 END), 0)
  INTO v_bobot_pg, v_nilai_pg
  FROM jawaban j
  JOIN soal s ON s.id = j.soal_id
  WHERE j.sesi_id = p_sesi_id AND s.tipe = 'pg';

  -- Ambil nilai esai (sudah dinilai manual)
  SELECT 
    COALESCE(SUM(s.bobot_nilai), 0),
    COALESCE(SUM(COALESCE(j.nilai_esai, 0)), 0)
  INTO v_bobot_esai, v_nilai_esai
  FROM jawaban j
  JOIN soal s ON s.id = j.soal_id
  WHERE j.sesi_id = p_sesi_id AND s.tipe = 'esai';

  v_total_bobot := v_bobot_pg + v_bobot_esai;

  IF v_total_bobot > 0 THEN
    v_nilai_final := ((v_nilai_pg + v_nilai_esai) / v_total_bobot) * 100;
  END IF;

  -- Update tabel sesi_ujian
  UPDATE sesi_ujian
  SET 
    nilai_pg = CASE WHEN v_bobot_pg > 0 THEN ROUND((v_nilai_pg / v_bobot_pg) * 100, 2) ELSE 0 END,
    nilai_esai = CASE WHEN v_bobot_esai > 0 THEN ROUND((v_nilai_esai / v_bobot_esai) * 100, 2) ELSE NULL END,
    nilai_final = ROUND(v_nilai_final, 2)
  WHERE id = p_sesi_id;

  RETURN ROUND(v_nilai_final, 2);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS pada semua tabel
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE dosen ENABLE ROW LEVEL SECURITY;
ALTER TABLE mahasiswa ENABLE ROW LEVEL SECURITY;
ALTER TABLE mata_kuliah ENABLE ROW LEVEL SECURITY;
ALTER TABLE ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE soal ENABLE ROW LEVEL SECURITY;
ALTER TABLE sesi_ujian ENABLE ROW LEVEL SECURITY;
ALTER TABLE jawaban ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_aktivitas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES: Admin (authenticated via Supabase Auth)
-- Admin bisa akses semua data
-- ============================================================

CREATE POLICY "Admin full access - admins"
  ON admins FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - dosen"
  ON dosen FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - mahasiswa"
  ON mahasiswa FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - matkul"
  ON mata_kuliah FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - ujian"
  ON ujian FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - soal"
  ON soal FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - sesi"
  ON sesi_ujian FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - jawaban"
  ON jawaban FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access - log"
  ON log_aktivitas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- RLS POLICIES: Mahasiswa (anon role dengan token sesi)
-- Mahasiswa hanya akses data miliknya sendiri
-- ============================================================

-- Mahasiswa bisa baca soal ujian yang sedang aktif
CREATE POLICY "Anon baca soal ujian aktif"
  ON soal FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM ujian u
      WHERE u.id = soal.ujian_id
        AND u.status = 'aktif'
    )
  );

-- Mahasiswa baca sesi miliknya
CREATE POLICY "Anon baca sesi sendiri"
  ON sesi_ujian FOR SELECT
  TO anon
  USING (true); -- dikontrol via token di aplikasi

-- Mahasiswa update sesi miliknya
CREATE POLICY "Anon update sesi sendiri"
  ON sesi_ujian FOR UPDATE
  TO anon
  USING (true);

-- Mahasiswa insert/update jawaban
CREATE POLICY "Anon kelola jawaban sendiri"
  ON jawaban FOR ALL
  TO anon
  USING (true);

-- Mahasiswa insert log aktivitas
CREATE POLICY "Anon insert log"
  ON log_aktivitas FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================================
-- DATA AWAL (SEED)
-- ============================================================

-- Insert admin default
-- PENTING: Ganti password setelah deploy pertama!
-- Password di-handle oleh Supabase Auth, bukan di sini
-- Jalankan di Supabase Dashboard > Authentication > Users
-- Email: admin@faperta-instiper.ac.id

-- Contoh data dosen
INSERT INTO dosen (kode_dosen, nama, email) VALUES
  ('DSN001', 'Dr. Ir. Budi Santoso, M.P.', 'budi.santoso@instiper.ac.id'),
  ('DSN002', 'Dr. Sri Wahyuni, S.P., M.Si.', 'sri.wahyuni@instiper.ac.id'),
  ('DSN003', 'Ir. Ahmad Fauzan, M.Sc.', 'ahmad.fauzan@instiper.ac.id');

-- Contoh data mata kuliah
INSERT INTO mata_kuliah (kode_matkul, nama_matkul, dosen_id, prodi) VALUES
  ('AGT101', 'Dasar Agronomi', (SELECT id FROM dosen WHERE kode_dosen = 'DSN001'), 'agroteknologi'),
  ('AGT201', 'Teknologi Budidaya Kelapa Sawit', (SELECT id FROM dosen WHERE kode_dosen = 'DSN001'), 'agroteknologi'),
  ('AGB101', 'Pengantar Agribisnis', (SELECT id FROM dosen WHERE kode_dosen = 'DSN002'), 'agribisnis'),
  ('AGB201', 'Manajemen Agribisnis', (SELECT id FROM dosen WHERE kode_dosen = 'DSN003'), 'agribisnis');

-- ============================================================
-- VIEWS untuk kemudahan query di Admin Panel
-- ============================================================

-- View: Rekap sesi ujian lengkap
CREATE OR REPLACE VIEW v_rekap_ujian AS
SELECT
  su.id AS sesi_id,
  u.judul AS nama_ujian,
  mk.nama_matkul,
  d.nama AS nama_dosen,
  m.nim,
  m.nama AS nama_mahasiswa,
  m.prodi,
  m.minat,
  m.angkatan,
  su.status,
  su.waktu_mulai,
  su.waktu_selesai,
  su.jumlah_pelanggaran,
  su.nilai_pg,
  su.nilai_esai,
  su.nilai_final,
  CASE 
    WHEN su.status = 'auto_submit' THEN 'Ya - Auto Submit'
    WHEN su.jumlah_pelanggaran > 0 THEN 'Ada Indikasi'
    ELSE 'Bersih'
  END AS status_kecurangan,
  u.tanggal_mulai AS tanggal_ujian
FROM sesi_ujian su
JOIN ujian u ON u.id = su.ujian_id
JOIN mata_kuliah mk ON mk.id = u.matkul_id
JOIN dosen d ON d.id = mk.dosen_id
JOIN mahasiswa m ON m.nim = su.nim;

-- View: Statistik ujian live
CREATE OR REPLACE VIEW v_monitor_live AS
SELECT
  u.id AS ujian_id,
  u.judul,
  u.kode_ujian,
  u.status,
  COUNT(su.id) AS total_terdaftar,
  COUNT(CASE WHEN su.status = 'mengerjakan' THEN 1 END) AS sedang_mengerjakan,
  COUNT(CASE WHEN su.status IN ('selesai', 'auto_submit', 'paksa_submit') THEN 1 END) AS sudah_selesai,
  COUNT(CASE WHEN su.status = 'auto_submit' THEN 1 END) AS auto_submit_count,
  COUNT(CASE WHEN su.jumlah_pelanggaran > 0 THEN 1 END) AS ada_pelanggaran,
  AVG(CASE WHEN su.nilai_final IS NOT NULL THEN su.nilai_final END) AS rata_rata_nilai
FROM ujian u
LEFT JOIN sesi_ujian su ON su.ujian_id = u.id
GROUP BY u.id, u.judul, u.kode_ujian, u.status;

-- View: Log kecurangan detail
CREATE OR REPLACE VIEW v_log_kecurangan AS
SELECT
  la.id,
  m.nim,
  m.nama AS nama_mahasiswa,
  m.prodi,
  m.minat,
  u.judul AS nama_ujian,
  la.tipe_event,
  la.keterangan,
  la.nomor_pelanggaran,
  la.timestamp,
  su.jumlah_pelanggaran AS total_pelanggaran,
  su.status AS status_sesi
FROM log_aktivitas la
JOIN sesi_ujian su ON su.id = la.sesi_id
JOIN mahasiswa m ON m.nim = la.nim
JOIN ujian u ON u.id = la.ujian_id
ORDER BY la.timestamp DESC;

-- ============================================================
-- REALTIME: Enable untuk live monitoring
-- ============================================================

-- Enable realtime pada tabel yang perlu live update
ALTER PUBLICATION supabase_realtime ADD TABLE sesi_ujian;
ALTER PUBLICATION supabase_realtime ADD TABLE log_aktivitas;
ALTER PUBLICATION supabase_realtime ADD TABLE jawaban;

-- ============================================================
-- SELESAI
-- ============================================================
-- Catatan penting setelah menjalankan schema ini:
-- 1. Buat user admin pertama di Supabase Dashboard > Authentication > Users
--    Email: admin@faperta-instiper.ac.id (atau sesuai keinginan)
-- 2. Setelah membuat user auth, insert ke tabel admins:
--    INSERT INTO admins (id, email, nama, role) VALUES 
--    ('[UUID dari auth.users]', 'admin@faperta-instiper.ac.id', 'Super Admin', 'superadmin');
-- 3. Aktifkan connection pooler di Supabase > Settings > Database > Connection Pooling
--    Mode: Transaction, Port: 6543
-- ============================================================
