import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { updateTargetHoursForEmployee } from '@/lib/update-target-hours'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, email, password, employmentType, pensum } = body

    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Prüfe ob Email bereits von anderem User verwendet wird
    if (email !== employee.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      })

      if (existingUser) {
        return NextResponse.json({ error: 'Email bereits vergeben' }, { status: 400 })
      }
    }

    // Update User
    const updateData: any = {
      firstName,
      lastName,
      email,
    }

    if (password) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    await prisma.user.update({
      where: { id: employee.userId },
      data: updateData,
    })

    // Prüfe ob Pensum geändert wurde
    const pensumChanged = employee.pensum !== parseFloat(pensum)

    // Update Employee
    const updatedEmployee = await prisma.employee.update({
      where: { id: params.id },
      data: {
        employmentType,
        pensum: parseFloat(pensum), // Pensum als Prozent (0-100)
      },
      include: {
        user: true,
      },
    })

    // Wenn Pensum geändert wurde, aktualisiere Soll-Stunden für die nächsten 5 Jahre
    if (pensumChanged) {
      try {
        await updateTargetHoursForEmployee(params.id)
      } catch (error) {
        console.error('Fehler beim Aktualisieren der Soll-Stunden:', error)
        // Fehler nicht weitergeben, da Employee-Update erfolgreich war
      }
    }

    return NextResponse.json(updatedEmployee)
  } catch (error) {
    console.error('Error updating employee:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    // Lösche Employee (User wird durch Cascade gelöscht)
    await prisma.employee.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting employee:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

