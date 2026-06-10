# Portal Ujian Online — FAPERTA INSTIPER Yogyakarta

Sistem ujian online berbasis Next.js + Supabase untuk Fakultas Pertanian INSTIPER Yogyakarta.

## Fitur
- Login mahasiswa dengan NIM + kode ujian
- Soal pilihan ganda & esai dengan pengacakan
- Timer ujian dengan auto-submit saat waktu habis
- Anti-cheat: deteksi pindah tab / blur browser dengan peringatan bertingkat
- Offline-first: jawaban disimpan ke localStorage, auto-sync tiap 15 detik
- Wake lock: cegah layar mati saat ujian di HP
- Dashboard admin dengan monitoring live
- Penilaian PG otomatis via PostgreSQL trigger

## Stack
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + RLS)
- **Deploy:** Vercel

---

## Setup Lokal

### 1. Clone & Install
```bash
git clone https://github.com/username/portal-ujian-instiper.git
cd portal-ujian-instiper
npm install
```

### 2. Setup Environment Variables
```bash
cp .env.example .env.local
```
Isi `.env.local` dengan nilai dari Supabase Dashboard → Project Settings → API:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Setup Database Supabase
1. Buka Supabase Dashboard → SQL Editor
2. Jalankan seluruh isi file `supabase/schema.sql`
3. Buat akun admin pertama: Supabase Dashboard → Authentication → Users → Add user
4. Setelah user terbuat, insert ke tabel `admins`:
   ```sql
   INSERT INTO admins (id, email, nama, role)
   VALUES ('[UUID dari auth.users]', 'admin@instiper.ac.id', 'Nama Admin', 'superadmin');
   ```

### 4. Jalankan Development Server
```bash
npm run dev
```
Buka [http://localhost:3000](http://localhost:3000)

---

## Deploy ke Vercel

1. Push ke GitHub
2. Import repo di [vercel.com](https://vercel.com)
3. Di Vercel → Settings → Environment Variables, tambahkan:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy

---

## Struktur Proyek
```
src/
├── app/
│   ├── page.tsx              # Halaman login mahasiswa
│   ├── layout.tsx            # Root layout
│   ├── globals.css           # Global styles + Tailwind
│   ├── ujian/
│   │   └── page.tsx          # Halaman pengerjaan ujian
│   ├── selesai/
│   │   └── page.tsx          # Halaman konfirmasi selesai
│   └── admin/
│       ├── page.tsx          # Login admin
│       └── dashboard/
│           └── page.tsx      # Dashboard monitoring
└── lib/
    ├── supabase.ts           # Supabase client
    ├── types.ts              # TypeScript types
    └── utils.ts              # Utility functions
supabase/
└── schema.sql                # Database schema lengkap
```

---

## Penggunaan

### Alur Mahasiswa
1. Buka portal → masukkan NIM dan kode ujian dari dosen
2. Sistem verifikasi → redirect ke halaman ujian
3. Kerjakan soal → jawaban otomatis tersimpan
4. Kumpulkan → halaman konfirmasi + nilai PG langsung

### Alur Admin/Dosen
1. Login di `/admin` dengan email + password
2. Dashboard menampilkan monitoring ujian real-time
3. Aktifkan ujian dan bagikan kode ujian ke mahasiswa

---

## Catatan Keamanan
- Kunci jawaban tidak pernah dikirim ke client
- Penilaian PG dilakukan di server (PostgreSQL trigger)
- RLS Supabase memastikan mahasiswa hanya akses data miliknya
- Anti-cheat direkam di `log_aktivitas` untuk audit
