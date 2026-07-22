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

    // Austrittsdatum: nur ändern, wenn das Feld im Request enthalten ist.
    // - leerer String / null  -> Austritt zurücknehmen (Reaktivierung)
    // - Datum (yyyy-MM-dd)     -> Austritt setzen (Archivierung ab diesem Tag)
    const employeeData: { employmentType: string; pensum: number; exitDate?: Date | null } = {
      employmentType,
      pensum: parseFloat(pensum), // Pensum als Prozent (0-100)
    }
    if ('exitDate' in body) {
      const raw = body.exitDate
      employeeData.exitDate = raw ? new Date(`${String(raw).slice(0, 10)}T00:00:00`) : null
    }

    // Update Employee
    const updatedEmployee = await prisma.employee.update({
      where: { id: params.id },
      data: employeeData,
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

/**
 * "Löschen" ist bewusst NICHT destruktiv: Mitarbeiter werden archiviert, nicht gelöscht.
 * Diese Route setzt das Austrittsdatum auf heute, wodurch der MA sofort archiviert wird
 * (Login gesperrt, aus aktiven Listen entfernt). Sämtliche Daten bleiben erhalten und
 * jederzeit abrufbar. Ein Hard-Delete gibt es nicht mehr.
 */
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

    // Archivieren: Austrittsdatum = heute (Tagesbeginn). Keine Löschung.
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const archived = await prisma.employee.update({
      where: { id: params.id },
      data: { exitDate: today },
      include: { user: true },
    })

    return NextResponse.json({ success: true, archived: true, employee: archived })
  } catch (error) {
    console.error('Error archiving employee:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

