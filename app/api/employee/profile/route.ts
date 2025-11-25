import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    return NextResponse.json({
      email: employee.user.email,
      firstName: employee.user.firstName,
      lastName: employee.user.lastName,
    })
  } catch (error) {
    console.error('Error fetching employee profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { email, newPassword, confirmPassword } = body

    // Hole aktuellen User
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      include: { user: true },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const updateData: any = {}

    // E-Mail-Änderung
    if (email && email !== employee.user.email) {
      // Prüfe ob E-Mail bereits von anderem User verwendet wird
      const existingUser = await prisma.user.findUnique({
        where: { email },
      })

      if (existingUser) {
        return NextResponse.json({ error: 'Diese E-Mail-Adresse ist bereits vergeben' }, { status: 400 })
      }

      // E-Mail-Format prüfen
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json({ error: 'Ungültiges E-Mail-Format' }, { status: 400 })
      }

      updateData.email = email
    }

    // Passwort-Änderung
    if (newPassword) {
      // Prüfe Passwort-Bestätigung
      if (newPassword !== confirmPassword) {
        return NextResponse.json({ error: 'Die neuen Passwörter stimmen nicht überein' }, { status: 400 })
      }

      // Prüfe Passwort-Länge
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Das neue Passwort muss mindestens 6 Zeichen lang sein' }, { status: 400 })
      }

      // Hash neues Passwort
      updateData.password = await bcrypt.hash(newPassword, 10)
    }

    // Wenn keine Änderungen, Fehler zurückgeben
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Keine Änderungen vorgenommen' }, { status: 400 })
    }

    // Update User
    const updatedUser = await prisma.user.update({
      where: { id: employee.userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    })

    return NextResponse.json({
      message: 'Profil erfolgreich aktualisiert',
      email: updatedUser.email,
    })
  } catch (error) {
    console.error('Error updating employee profile:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

