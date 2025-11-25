import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import AdminTimeTrackingClient from '@/components/admin/admin-time-tracking-client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function AdminTimeTrackingPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  const employees = await prisma.employee.findMany({
    include: {
      user: true,
    },
    orderBy: {
      user: {
        lastName: 'asc',
      },
    },
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/admin/dashboard">
            <Button variant="outline" className="mb-4">
              ← Zurück zum Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">
            Zeiterfassung für Mitarbeiter
          </h1>
          <p className="text-gray-600 mt-1">
            Rückwirkende Zeiterfassung und Bearbeitung von Arbeitszeiten
          </p>
        </div>

        <AdminTimeTrackingClient employees={employees} />
      </div>
    </div>
  )
}

