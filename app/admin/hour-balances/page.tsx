import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import HourBalanceManager from '@/components/admin/hour-balance-manager'

export default async function HourBalancesPage() {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  const employees = await prisma.employee.findMany({
    include: { user: true },
    orderBy: { user: { lastName: 'asc' } },
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
          <h1 className="text-3xl font-bold text-gray-900">Stundensaldi</h1>
          <p className="text-gray-600 mt-1">Startsaldi initialisieren und spätere Anpassungen (z.B. Auszahlungen) erfassen</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verwaltung</CardTitle>
            <CardDescription>Monatslöhner: Startsaldo per Ende November 2025 + manuelle Adjustments ab Dezember 2026</CardDescription>
          </CardHeader>
          <CardContent>
            <HourBalanceManager employees={employees} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

