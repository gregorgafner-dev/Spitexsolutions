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

  // Definiere die gewünschte Reihenfolge der Mitarbeiter (nach Vorname)
  // Die Sortierung funktioniert auch mit Teilnamen (z.B. "Anna" passt zu "Anna Joelle")
  const employeeOrder = [
    'Samantha',
    'Adelina',
    'Almina',
    'Katja',
    'Barbara',
    'Anna', // Passt zu "Anna Joelle"
    'Yvonne',
    'Sebastian',
    'Gyler',
    'Mareen',
    'Brigitte',
  ]

  const employeesData = await prisma.employee.findMany({
    include: {
      user: true,
    },
  })

  // Sortiere Mitarbeiter nach der definierten Reihenfolge
  const employees = employeesData.sort((a, b) => {
    const firstNameA = a.user.firstName
    const firstNameB = b.user.firstName
    
    // Finde Index basierend auf exaktem Match oder Teilstring
    const findIndex = (name: string) => {
      // Exakter Match
      const exactIndex = employeeOrder.indexOf(name)
      if (exactIndex !== -1) return exactIndex
      
      // Teilstring-Match (z.B. "Anna" passt zu "Anna Joelle")
      for (let i = 0; i < employeeOrder.length; i++) {
        if (name.startsWith(employeeOrder[i]) || employeeOrder[i].startsWith(name)) {
          return i
        }
      }
      return -1
    }
    
    const indexA = findIndex(firstNameA)
    const indexB = findIndex(firstNameB)
    
    // Wenn beide in der Liste sind, sortiere nach Index
    if (indexA !== -1 && indexB !== -1) {
      return indexA - indexB
    }
    
    // Wenn nur A in der Liste ist, kommt A zuerst
    if (indexA !== -1) return -1
    
    // Wenn nur B in der Liste ist, kommt B zuerst
    if (indexB !== -1) return 1
    
    // Wenn keiner in der Liste ist, sortiere alphabetisch nach Nachname
    return a.user.lastName.localeCompare(b.user.lastName)
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

