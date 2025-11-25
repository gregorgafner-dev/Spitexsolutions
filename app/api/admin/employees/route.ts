import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { updateTargetHoursForEmployee } from '@/lib/update-target-hours'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employees = await prisma.employee.findMany({
      include: {
        user: true,
      },
    })

    // Sortiere clientseitig nach Nachname
    employees.sort((a, b) => {
      const lastNameA = a.user.lastName.toLowerCase()
      const lastNameB = b.user.lastName.toLowerCase()
      if (lastNameA < lastNameB) return -1
      if (lastNameA > lastNameB) return 1
      return 0
    })

    return NextResponse.json(employees)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, email, password, employmentType, pensum } = body

    if (!firstName || !lastName || !email || !password || !employmentType || pensum === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Prüfe ob Email bereits existiert
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: 'Email bereits vergeben' }, { status: 400 })
    }

    // Hash Passwort
    const hashedPassword = await bcrypt.hash(password, 10)

    // Erstelle User und Employee
    const user = await prisma.user.create({
      data: {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role: 'EMPLOYEE',
        employee: {
          create: {
            employmentType,
            pensum: parseFloat(pensum), // Pensum als Prozent (0-100)
          },
        },
      },
      include: {
        employee: {
          include: {
            user: true,
          },
        },
      },
    })

    // Berechne Soll-Stunden für die nächsten 5 Jahre für den neuen Mitarbeiter
    if (user.employee) {
      try {
        await updateTargetHoursForEmployee(user.employee.id)
      } catch (error) {
        console.error('Fehler beim Berechnen der Soll-Stunden:', error)
        // Fehler nicht weitergeben, da Employee-Erstellung erfolgreich war
      }
    }

    return NextResponse.json(user.employee)
  } catch (error) {
    console.error('Error creating employee:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}

