import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SignOutButton } from '@/components/signout-button'
import { Logo } from '@/components/logo'
import { User } from 'lucide-react'
export default async function EmployeeDashboard() {
  const session = await getSession()

  if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
    redirect('/login')
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const employee = await prisma.employee.findUnique({
    where: { id: session.user.employeeId },
    include: {
      user: true,
      vacationBalances: {
        where: {
          year: currentYear,
        },
      },
    },
  })

  if (!employee) {
    redirect('/login')
  }

  // Aktueller Stundensaldo
  const monthlyBalance = await prisma.monthlyBalance.findUnique({
    where: {
      employeeId_year_month: {
        employeeId: employee.id,
        year: currentYear,
        month: currentMonth,
      },
    },
  })

  // Heutige Zeiteinträge
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayEntries = await prisma.timeEntry.findMany({
    where: {
      employeeId: employee.id,
      date: {
        gte: today,
        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      },
    },
    orderBy: {
      startTime: 'asc',
    },
  })


  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div className="flex-1">
            <Logo className="mb-4" showTagline={false} />
            <h1 className="text-2xl font-semibold text-gray-900 mt-2">
              Willkommen, {employee.user.firstName} {employee.user.lastName}
            </h1>
            <p className="text-gray-600 mt-1">
              {format(now, "EEEE, d. MMMM yyyy", { locale: de })}
            </p>
          </div>
          <SignOutButton />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Stundensaldo</CardTitle>
              <CardDescription>gem. Vormonaten</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {monthlyBalance ? (
                  <span className={monthlyBalance.balance >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {monthlyBalance.balance > 0 ? '+' : ''}
                    {monthlyBalance.balance.toFixed(2)}h
                  </span>
                ) : (
                  <span className="text-gray-400">0.00h</span>
                )}
              </div>
              {monthlyBalance && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600">
                    Soll: {monthlyBalance.targetHours.toFixed(2)}h | 
                    Ist: {monthlyBalance.actualHours.toFixed(2)}h
                  </p>
                  {monthlyBalance.surchargeHours > 0 && (
                    <p className="text-sm text-blue-600 font-medium">
                      Zeitzuschlag (Sonn-/Feiertage): +{monthlyBalance.surchargeHours.toFixed(2)}h
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pensum</CardTitle>
              <CardDescription>Anstellungsgrad</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {employee.pensum.toFixed(0)}%
              </div>
              <p className="text-sm text-gray-600 mt-2">
                {employee.employmentType === 'MONTHLY_SALARY' ? 'Monatslohn' : 'Stundenlohn'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Heute</CardTitle>
              <CardDescription>Gearbeitete Stunden</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {todayEntries.reduce((total, entry) => {
                  if (entry.endTime) {
                    const hours = (entry.endTime.getTime() - entry.startTime.getTime()) / (1000 * 60 * 60)
                    return total + hours - (entry.breakMinutes / 60)
                  }
                  return total
                }, 0).toFixed(2)}h
              </div>
              {todayEntries.some(e => e.surchargeHours > 0) && (
                <p className="text-sm text-blue-600 mt-1 font-medium">
                  +{todayEntries.reduce((sum, e) => sum + (e.surchargeHours || 0), 0).toFixed(2)}h Zeitzuschlag
                </p>
              )}
              <p className="text-sm text-gray-600 mt-2">
                {todayEntries.length} Eintrag{todayEntries.length !== 1 ? 'e' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verbleibender Feriensaldo</CardTitle>
              <CardDescription>{currentYear}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {employee.vacationBalances.length > 0 ? (
                  (() => {
                    const balance = employee.vacationBalances[0]
                    const remainingDays = balance.totalDays - balance.usedDays
                    return (
                      <span className={remainingDays >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {Math.round(remainingDays * 10) / 10} Tage
                      </span>
                    )
                  })()
                ) : (
                  <span className="text-gray-400">-</span>
                )}
              </div>
              {employee.vacationBalances.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="text-sm text-gray-600">
                    Gesamt: <span className="font-medium">{employee.vacationBalances[0].totalDays} Tage</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Bezogen: <span className="font-medium">{employee.vacationBalances[0].usedDays} Tage</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Arbeitszeiterfassung</CardTitle>
              <CardDescription>Erfassen Sie Ihre Arbeitszeiten</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/employee/time-tracking">
                <Button className="w-full" size="lg">
                  Arbeitszeit erfassen
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="mr-2 h-5 w-5" />
                Profil
              </CardTitle>
              <CardDescription>E-Mail und Passwort ändern</CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/employee/profile">
                <Button className="w-full" variant="outline" size="lg">
                  Profil bearbeiten
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}

