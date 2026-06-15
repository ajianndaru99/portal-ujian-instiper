# Portal Ujian — Import Google Form

Fitur konversi jawaban Google Form (via Google Sheets) menjadi soal ujian di database Supabase.

---

## Cara Running (5 menit)

### 1. Install dependencies

```bash
cd portal-ujian
npm install
```

### 2. Setup Supabase

1. Buka [https://app.supabase.com](https://app.supabase.com) → buat project baru (gratis)
2. Buka **SQL Editor** → paste isi file `supabase-schema.sql` → klik **Run**
3. Buka **Project Settings → API**:
   - Copy **Project URL** → isi `NEXT_PUBLIC_SUPABASE_URL` di `.env.local`
   - Copy **anon / public key** → isi `NEXT_PUBLIC_SUPABASE_ANON_KEY` di `.env.local`

### 3. Isi `.env.local`

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### 4. Jalankan

```bash
npm run dev
```

Buka [http://localhost:3000/admin/import-google-form](http://localhost:3000/admin/import-google-form)

---

## Cara Menggunakan Fitur Import

### A. Siapkan Google Form

Buat Google Form dengan urutan pertanyaan:

| No | Judul Pertanyaan | Tipe Field |
|----|-----------------|------------|
| 1 | Nomor Urut Soal | Jawaban singkat |
| 2 | Pertanyaan | Paragraf |
| 3 | Tipe Soal | Pilihan ganda: `Pilihan Ganda` / `Esai` |
| 4 | Pilihan A | Jawaban singkat |
| 5 | Pilihan B | Jawaban singkat |
| 6 | Pilihan C | Jawaban singkat |
| 7 | Pilihan D | Jawaban singkat |
| 8 | Kunci Jawaban | Pilihan ganda: `A` / `B` / `C` / `D` / `Tidak ada` |
| 9 | Bobot Nilai | Jawaban singkat |

### B. Export ke Google Sheets

1. Di Google Form → tab **Responses** → klik ikon **Sheets** hijau
2. Di Sheets: **File → Share → Akses umum → Siapa saja yang memiliki link (Viewer)**
3. Copy URL sheet

### C. Import

1. Buka halaman import → pilih ujian tujuan
2. Paste link Google Sheets → klik **Ambil Data**
3. Cocokkan kolom (auto-mapping akan mencoba mendeteksi otomatis)
4. Cek preview → klik **Import**

---

## Struktur File

```
portal-ujian/
├── src/
│   ├── app/
│   │   ├── admin/import-google-form/
│   │   │   └── page.tsx          ← Halaman utama import
│   │   ├── api/sheet-csv/
│   │   │   └── route.ts          ← API proxy Google Sheets (hindari CORS)
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── lib/
│       └── supabase.ts           ← Supabase client
├── .env.local                    ← Konfigurasi (wajib diisi)
├── supabase-schema.sql           ← SQL untuk buat tabel di Supabase
└── package.json
```
