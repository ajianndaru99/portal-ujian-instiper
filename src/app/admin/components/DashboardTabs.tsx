'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function DashboardTabs() {
  const pathname = usePathname()

  const tabs = [
    { name: 'Ringkasan', href: '/admin/dashboard' },
    { name: 'Live Monitor', href: '/admin/monitor' },
    { name: 'Manajemen Ujian', href: '/admin/ujian' },
    { name: 'Manajemen Admin', href: '/admin/admins' },
  ]

  return (
    <div className="flex gap-2 mb-6 border-b border-gray-200 pb-px">
      {tabs.map(tab => {
        const isActive = pathname === tab.href
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
              isActive
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.name}
          </Link>
        )
      })}
    </div>
  )
}
