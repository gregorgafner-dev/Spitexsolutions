import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import ServiceList from '@/components/admin/service-list'
export default async function ServicesPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

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
            Dienst-Definitionen
          </h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie die verschiedenen Diensttypen
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dienste</CardTitle>
            <CardDescription>
              Definieren Sie Dienste mit Bezeichnung, Dauer und Farbe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServiceList services={services} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

