'use client'

import { usePathname } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/admin-sidebar'
import { useEffect, useState } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Während des ersten Renders oder auf Login-Seite: kein Layout
  if (!mounted || pathname === '/admin/login') {
    return <>{children}</>
  }

  // Für alle anderen Admin-Seiten: Layout mit Sidebar
  return (
    <div className="flex h-screen bg-gray-50">
      <AdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
