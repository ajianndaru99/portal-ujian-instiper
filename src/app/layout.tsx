import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Portal Ujian Online — FAPERTA INSTIPER Yogyakarta',
  description: 'Sistem Ujian Online Fakultas Pertanian INSTIPER Yogyakarta',
  robots: 'noindex, nofollow', // portal internal — jangan diindex
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,       // Cegah zoom saat ujian
  userScalable: false,
  themeColor: '#16a34a', // primary-600
}

import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
