import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format, subMonths, addDays } from 'date-fns'
import { de } from 'date-fns/locale'
import { FileText } from 'lucide-react'
import ReportGenerator from '@/components/admin/report-generator'

export default async function ReportsPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  // Hole alle Mitarbeiter
  const employeesData = await prisma.employee.findMany({
    include: {
      user: true,
    },
  })

  // Sortiere nach Nachname
  const employees = employeesData.sort((a, b) => {
    const lastNameA = a.user.lastName.toLowerCase()
    const lastNameB = b.user.lastName.toLowerCase()
    if (lastNameA < lastNameB) return -1
    if (lastNameA > lastNameB) return 1
    return 0
  })

  // Berechne verfügbare Monate (ab 3. Tag des Folgemonats)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  const availableMonths: Array<{ value: string; label: string; available: boolean }> = []
  
  // Prüfe die letzten 12 Monate
  for (let i = 0; i < 12; i++) {
    const monthDate = subMonths(today, i)
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth() + 1
    
    // 3. Tag des Folgemonats
    const nextMonth = new Date(year, month, 1)
    const thirdDayOfNextMonth = new Date(year, month, 3)
    
    const available = today >= thirdDayOfNextMonth
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    
    availableMonths.push({
      value: monthStr,
      label: format(monthDate, 'MMMM yyyy', { locale: de }),
      available,
    })
  }

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
            Abrechnungen
          </h1>
          <p className="text-gray-600 mt-1">
            Generieren Sie PDF-Abrechnungen für Mitarbeiter
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="mr-2 h-5 w-5" />
              PDF-Abrechnungen generieren
            </CardTitle>
            <CardDescription>
              Ab dem 3. Tag des Folgemonats können Sie Abrechnungen für den Vormonat generieren.
              Die Abrechnung enthält die gearbeitete Arbeitszeit, den aktuellen Stundensaldo und den Feriensaldo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReportGenerator employees={employees} availableMonths={availableMonths} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


