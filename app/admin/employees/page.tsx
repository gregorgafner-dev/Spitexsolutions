import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EmployeeList from '@/components/admin/employee-list'
export default async function EmployeesPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  const employeesData = await prisma.employee.findMany({
    select: {
      id: true,
      employmentType: true,
      pensum: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        }
      }
    },
  })

  // Sortiere nach Nachname und typisiere korrekt
  const employees = employeesData.sort((a, b) => {
    const lastNameA = a.user.lastName.toLowerCase()
    const lastNameB = b.user.lastName.toLowerCase()
    if (lastNameA < lastNameB) return -1
    if (lastNameA > lastNameB) return 1
    return 0
  }).map(emp => ({
    id: emp.id,
    employmentType: emp.employmentType as 'MONTHLY_SALARY' | 'HOURLY_WAGE',
    pensum: emp.pensum,
    user: {
      id: emp.user.id,
      firstName: emp.user.firstName,
      lastName: emp.user.lastName,
      email: emp.user.email,
    }
  }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <Link href="/admin/dashboard">
              <Button variant="outline" className="mb-4">
                ← Zurück zum Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              Mitarbeiterverwaltung
            </h1>
            <p className="text-gray-600 mt-1">
              Verwalten Sie alle Mitarbeiter und deren Anstellungsdaten
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Mitarbeiter</CardTitle>
            <CardDescription>
              Liste aller Mitarbeiter
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EmployeeList employees={employees} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

