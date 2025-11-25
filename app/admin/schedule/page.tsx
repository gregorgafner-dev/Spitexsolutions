import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import SchedulePlanner from '@/components/admin/schedule-planner'
export default async function SchedulePage() {
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

  const services = await prisma.service.findMany({
    orderBy: {
      name: 'asc',
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
            Dienstplanung
          </h1>
          <p className="text-gray-600 mt-1">
            Planen Sie die Dienste für alle Mitarbeiter
          </p>
        </div>

        <SchedulePlanner employees={employees} services={services} />
      </div>
    </div>
  )
}

