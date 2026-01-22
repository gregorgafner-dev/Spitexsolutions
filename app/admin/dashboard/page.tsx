import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Calendar, Settings, Plane, FileText, Clock, Calculator, MessageSquare, AlertTriangle } from 'lucide-react'
import { calculateWorkHours } from '@/lib/calculations'
import { format, parseISO, isSameDay } from 'date-fns'

export default async function AdminDashboard() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    console.log('[AdminDashboard] redirect -> /admin/login', {
      sessionPresent: !!session,
      role: session?.user?.role ?? null,
    })
    redirect('/admin/login')
  }

  console.log('[AdminDashboard] session ok', { role: session.user.role })

  const employeeCount = await prisma.employee.count()
  const serviceCount = await prisma.service.count()
  const pendingVacationCount = await prisma.vacation.count({
    where: {
      status: 'PENDING',
    },
  })
  const unreadMessageCount = await prisma.message.count({
    where: {
      read: false,
    },
  })

  // Hole Plausibilisierungen
  // Prüfe für alle Mitarbeiter die Zeiteinträge
  const employees = await prisma.employee.findMany({
    include: {
      user: true,
    },
  })

  let plausibilityIssueCount = 0

  // Prüfe für jeden Mitarbeiter die Zeiteinträge
  for (const employee of employees) {
    // Hole alle Zeiteinträge für das laufende Jahr
    const currentYear = new Date().getFullYear()
    const startOfYear = new Date(currentYear, 0, 1)
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59)

    const timeEntries = await prisma.timeEntry.findMany({
      where: {
        employeeId: employee.id,
        date: {
          gte: startOfYear,
          lte: endOfYear,
        },
        endTime: { not: null },
      },
      orderBy: {
        date: 'asc',
      },
    })

    // Gruppiere Einträge nach Datum
    const entriesByDate = new Map<string, typeof timeEntries>()
    
    for (const entry of timeEntries) {
      const dateKey = format(entry.date, 'yyyy-MM-dd')
      if (!entriesByDate.has(dateKey)) {
        entriesByDate.set(dateKey, [])
      }
      entriesByDate.get(dateKey)!.push(entry)
    }

    // Prüfe jedes Datum
    for (const [dateKey, dayEntries] of Array.from(entriesByDate.entries())) {
      const date = parseISO(dateKey)
      
      // Filtere nur WORK-Einträge
      const workEntries = dayEntries.filter(e => e.entryType === 'WORK')
      const entriesWithEndTime = workEntries.filter(e => e.endTime !== null)
      
      // Prüfung: Fehlende Endzeiten
      for (const entry of workEntries) {
        if (!entry.endTime) {
          plausibilityIssueCount++
          break // Nur einmal zählen pro Tag
        }
      }
      
      // Prüfung: Negative Arbeitszeiten
      for (const entry of workEntries) {
        if (entry.endTime && entry.endTime <= entry.startTime) {
          plausibilityIssueCount++
          break // Nur einmal zählen pro Tag
        }
      }
      
      // Prüfung: Überlappende Blöcke
      let hasOverlap = false
      for (let i = 0; i < entriesWithEndTime.length && !hasOverlap; i++) {
        for (let j = i + 1; j < entriesWithEndTime.length; j++) {
          const entry1 = entriesWithEndTime[i]
          const entry2 = entriesWithEndTime[j]
          if (entry1.endTime && entry2.endTime) {
            if (entry1.startTime < entry2.endTime && entry2.startTime < entry1.endTime) {
              hasOverlap = true
              break
            }
          }
        }
      }
      if (hasOverlap) {
        plausibilityIssueCount++
      }

      // Prüfung 1: Mehr als 4 Blöcke pro Tag
      if (entriesWithEndTime.length > 4) {
        plausibilityIssueCount++
      }

      // Prüfung 2: Mehr als 10 Stunden Arbeitszeit pro Tag
      // Berechne Gesamtarbeitszeit für den Tag
      let totalWorkHours = 0
      
      // Normale Arbeitszeit
      for (const entry of entriesWithEndTime) {
        if (entry.endTime) {
          totalWorkHours += calculateWorkHours(entry.startTime, entry.endTime, entry.breakMinutes)
        }
      }

      // Prüfung 3: Bei Nachtdienst: Mehr als 3h Schlafunterbrechung
      // Neues System: Nachtdienst wird komplett auf dem Startdatum gebucht.
      const sleepInterruptionEntry = dayEntries.find(e => e.entryType === 'SLEEP_INTERRUPTION')
      if (sleepInterruptionEntry && sleepInterruptionEntry.sleepInterruptionMinutes) {
        const interruptionHours = sleepInterruptionEntry.sleepInterruptionMinutes / 60
        if (interruptionHours > 3) {
          plausibilityIssueCount++
        }
      }

      // Prüfung 2: Mehr als 10 Stunden Arbeitszeit
      if (totalWorkHours > 10) {
        plausibilityIssueCount++
      }
    }
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Dashboard
          </h1>
          <p className="text-gray-600 mt-2">
            Willkommen zurück, {session.user.name}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="mr-2 h-5 w-5" />
                Mitarbeiter
              </CardTitle>
              <CardDescription>Verwaltung der Mitarbeiter</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">{employeeCount}</div>
              <Link href="/admin/employees" className="mt-auto">
                <Button className="w-full">Mitarbeiter verwalten</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="mr-2 h-5 w-5" />
                Dienstplanung
              </CardTitle>
              <CardDescription>Monatsplanung und Dienste</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">{serviceCount}</div>
              <Link href="/admin/schedule" className="mt-auto">
                <Button className="w-full">Dienstplanung</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="mr-2 h-5 w-5" />
                Dienst-Definitionen
              </CardTitle>
              <CardDescription>Diensttypen verwalten</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">{serviceCount}</div>
              <Link href="/admin/services" className="mt-auto">
                <Button className="w-full">Dienst-Definitionen</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plane className="mr-2 h-5 w-5" />
                Ferien
              </CardTitle>
              <CardDescription>Ferienanträge verwalten</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">
                {pendingVacationCount > 0 && (
                  <span className="text-orange-600">{pendingVacationCount}</span>
                )}
                {pendingVacationCount === 0 && '0'}
              </div>
              <Link href="/admin/vacations" className="mt-auto">
                <Button className="w-full">Ferien verwalten</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="mr-2 h-5 w-5" />
                Abrechnungen
              </CardTitle>
              <CardDescription>PDF-Abrechnungen generieren</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">-</div>
              <Link href="/admin/reports" className="mt-auto">
                <Button className="w-full">Abrechnungen</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="mr-2 h-5 w-5" />
                Zeiterfassung und Änderungen
              </CardTitle>
              <CardDescription>Rückwirkende Zeiterfassung für Mitarbeiter</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">-</div>
              <Link href="/admin/time-tracking" className="mt-auto">
                <Button className="w-full">Zeiterfassung und Änderungen</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calculator className="mr-2 h-5 w-5" />
                Berechnung ziehen
              </CardTitle>
              <CardDescription>Monatssalden neu berechnen</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">-</div>
              <Link href="/admin/calculations" className="mt-auto">
                <Button className="w-full">Berechnung ziehen</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="mr-2 h-5 w-5" />
                Nachrichten
              </CardTitle>
              <CardDescription>Mitteilungen von Mitarbeitern</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">
                {unreadMessageCount > 0 && (
                  <span className="text-orange-600">{unreadMessageCount}</span>
                )}
                {unreadMessageCount === 0 && '0'}
              </div>
              <Link href="/admin/messages" className="mt-auto">
                <Button className="w-full">Nachrichten anzeigen</Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Plausibilisierungen
                {plausibilityIssueCount > 0 && (
                  <span className="ml-2 h-3 w-3 bg-red-600 rounded-full"></span>
                )}
              </CardTitle>
              <CardDescription>Unregelmäßigkeiten in der Zeiterfassung</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col flex-grow">
              <div className="text-3xl font-bold mb-4">
                {plausibilityIssueCount > 0 && (
                  <span className="text-red-600">{plausibilityIssueCount}</span>
                )}
                {plausibilityIssueCount === 0 && '0'}
              </div>
              <Link href="/admin/plausibility-checks" className="mt-auto">
                <Button className="w-full">Plausibilisierungen anzeigen</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

