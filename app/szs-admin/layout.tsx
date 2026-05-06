'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SzsSidebar } from '@/components/admin-szs/szs-sidebar'

export default function SzsAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Während des ersten Renders, auf Login-Seite oder im Cockpit-Bereich (eigene Navigation): kein Standard-Layout
  if (
    !mounted ||
    pathname === '/szs-admin/login' ||
    pathname?.startsWith('/szs-admin/cockpit')
  ) {
    return <>{children}</>
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <SzsSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
