import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Portal Ujian',
  description: 'Sistem manajemen ujian online',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4 text-sm">
          <span className="font-bold text-indigo-600 text-base">Portal Ujian</span>
          <a href="/admin/import-google-form" className="text-gray-600 hover:text-indigo-600 transition">
            Import Google Form
          </a>
        </nav>
        <main className="px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  )
}
