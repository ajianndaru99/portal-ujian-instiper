export default function Home() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold text-gray-800">Portal Ujian</h1>
      <p className="text-gray-500 text-sm">Selamat datang. Gunakan menu navigasi di atas.</p>
      <a
        href="/admin/import-google-form"
        className="btn-primary inline-block"
      >
        Import Soal dari Google Form →
      </a>
    </div>
  )
}
