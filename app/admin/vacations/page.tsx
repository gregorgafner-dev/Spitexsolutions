import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import VacationList from '@/components/admin/vacation-list'
import CarryoverList from '@/components/admin/carryover-list'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
export default async function VacationsPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  const currentYear = new Date().getFullYear()
  const previousYear = currentYear - 1

  const employeesData = await prisma.employee.findMany({
    include: {
      user: true,
      vacationBalances: {
        where: {
          year: {
            in: [currentYear, previousYear],
          },
        },
        orderBy: {
          year: 'desc',
        },
      },
    },
  })

  // Prüfe ob wir am Jahresende sind (November oder Dezember)
  const today = new Date()
  const isYearEnd = today.getMonth() >= 10 // November (10) oder Dezember (11)
  const nextYear = currentYear + 1

  // Finde Mitarbeiter mit Resturlaub aus Vorjahr
  const employeesWithCarryoverFromPrevious = employeesData
    .map(employee => {
      const currentBalance = employee.vacationBalances.find(b => b.year === currentYear)
      const previousBalance = employee.vacationBalances.find(b => b.year === previousYear)
      
      if (previousBalance) {
        const remainingDays = previousBalance.totalDays - previousBalance.usedDays
        if (remainingDays > 0 && !currentBalance) {
          return {
            employee: {
              id: employee.id,
              user: {
                firstName: employee.user.firstName,
                lastName: employee.user.lastName,
                email: employee.user.email,
              },
              vacationBalances: employee.vacationBalances.map(balance => ({
                id: balance.id,
                year: balance.year,
                totalDays: balance.totalDays,
                usedDays: balance.usedDays,
                startDate: balance.startDate ? balance.startDate.toISOString() : null,
              }))
            },
            previousBalance: {
              year: previousBalance.year,
              totalDays: previousBalance.totalDays,
              usedDays: previousBalance.usedDays,
            },
            remainingDays: Math.round(remainingDays * 10) / 10,
          }
        }
      }
      return null
    })
    .filter(Boolean) as Array<{
      employee: {
        id: string
        user: {
          firstName: string
          lastName: string
          email: string
        }
        vacationBalances: Array<{
          id: string
          year: number
          totalDays: number
          usedDays: number
          startDate: string | null
        }>
      }
      previousBalance: { year: number; totalDays: number; usedDays: number }
      remainingDays: number
    }>

  // Finde Mitarbeiter mit Restferien am Jahresende (aktuelles Jahr -> nächstes Jahr)
  const employeesWithYearEndCarryover = isYearEnd
    ? employeesData
        .map(employee => {
          const currentBalance = employee.vacationBalances.find(b => b.year === currentYear)
          const nextYearBalance = employee.vacationBalances.find(b => b.year === nextYear)
          
          if (currentBalance) {
            const remainingDays = currentBalance.totalDays - currentBalance.usedDays
            // Nur anzeigen wenn Restferien vorhanden und noch nicht ins nächste Jahr übertragen
            if (remainingDays > 0 && !nextYearBalance) {
              return {
                employee: {
                  id: employee.id,
                  user: {
                    firstName: employee.user.firstName,
                    lastName: employee.user.lastName,
                    email: employee.user.email,
                  },
                  vacationBalances: employee.vacationBalances.map(balance => ({
                    id: balance.id,
                    year: balance.year,
                    totalDays: balance.totalDays,
                    usedDays: balance.usedDays,
                    startDate: balance.startDate ? balance.startDate.toISOString() : null,
                  }))
                },
                previousBalance: {
                  year: currentBalance.year,
                  totalDays: currentBalance.totalDays,
                  usedDays: currentBalance.usedDays,
                },
                remainingDays: Math.round(remainingDays * 10) / 10,
              }
            }
          }
          return null
        })
        .filter(Boolean) as Array<{
          employee: {
            id: string
            user: {
              firstName: string
              lastName: string
              email: string
            }
            vacationBalances: Array<{
              id: string
              year: number
              totalDays: number
              usedDays: number
              startDate: string | null
            }>
          }
          previousBalance: { year: number; totalDays: number; usedDays: number }
          remainingDays: number
        }>
    : []

  // Kombiniere beide Listen
  const employeesWithCarryover = [...employeesWithCarryoverFromPrevious, ...employeesWithYearEndCarryover]

  // Sortiere nach Nachname und transformiere Typen
  const employees = employeesData.sort((a, b) => {
    const lastNameA = a.user.lastName.toLowerCase()
    const lastNameB = b.user.lastName.toLowerCase()
    if (lastNameA < lastNameB) return -1
    if (lastNameA > lastNameB) return 1
    return 0
  }).map(emp => ({
    id: emp.id,
    user: {
      firstName: emp.user.firstName,
      lastName: emp.user.lastName,
      email: emp.user.email,
    },
    vacationBalances: emp.vacationBalances.map(balance => ({
      id: balance.id,
      year: balance.year,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      startDate: balance.startDate ? balance.startDate.toISOString() : null,
    }))
  }))

  const vacationsData = await prisma.vacation.findMany({
    include: {
      employee: {
        include: {
          user: true,
        },
      },
    },
    orderBy: {
      startDate: 'asc',
    },
  })

  // Transformiere Vacation-Daten für die Komponente
  const vacations = vacationsData.map(vacation => ({
    id: vacation.id,
    employeeId: vacation.employeeId,
    startDate: vacation.startDate.toISOString(),
    endDate: vacation.endDate.toISOString(),
    status: vacation.status as 'PENDING' | 'APPROVED' | 'REJECTED',
    notes: vacation.notes,
    employee: {
      user: {
        firstName: vacation.employee.user.firstName,
        lastName: vacation.employee.user.lastName,
        email: vacation.employee.user.email,
      }
    }
  }))

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
            Ferienverwaltung
          </h1>
          <p className="text-gray-600 mt-1">
            Verwalten Sie Feriensaldi und Ferienanträge der Mitarbeiter
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Mitarbeiter & Feriensaldi</CardTitle>
            <CardDescription>
              Übersicht aller Mitarbeiter mit ihren Feriensalden für {currentYear}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VacationList 
              employees={employees} 
              vacations={vacations}
              employeesWithCarryover={employeesWithCarryover}
            />
          </CardContent>
        </Card>

        <CarryoverList
          employeesWithCarryover={employeesWithCarryover}
          isYearEnd={isYearEnd}
          currentYear={currentYear}
          nextYear={nextYear}
          previousYear={previousYear}
        />

        {vacations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Ferienanträge</CardTitle>
              <CardDescription>
                Übersicht aller Ferienanträge
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {vacations.map((vacation) => (
                  <div
                    key={vacation.id}
                    className="flex items-center justify-between p-4 border rounded-lg bg-white"
                  >
                    <div>
                      <h3 className="font-semibold">
                        {vacation.employee.user.firstName} {vacation.employee.user.lastName}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {format(new Date(vacation.startDate), 'dd.MM.yyyy', { locale: de })} -{' '}
                        {format(new Date(vacation.endDate), 'dd.MM.yyyy', { locale: de })}
                      </p>
                      {vacation.notes && (
                        <p className="text-sm text-gray-500 mt-1">{vacation.notes}</p>
                      )}
                    </div>
                    <div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        vacation.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200' :
                        vacation.status === 'REJECTED' ? 'bg-red-100 text-red-800 border-red-200' :
                        'bg-yellow-100 text-yellow-800 border-yellow-200'
                      }`}>
                        {vacation.status === 'APPROVED' ? 'Genehmigt' :
                         vacation.status === 'REJECTED' ? 'Abgelehnt' : 'Ausstehend'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

