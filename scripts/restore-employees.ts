import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { updateTargetHoursForEmployee } from '../lib/update-target-hours'

const prisma = new PrismaClient()

// Bitte füllen Sie die Mitarbeiter-Informationen hier ein:
// Format: { email, firstName, lastName, password, employmentType: 'MONTHLY_SALARY' | 'HOURLY_WAGE', pensum: 0-100 }
const employees = [
  // Beispiel - bitte ersetzen Sie mit den echten Daten:
  { email: 'ss@spitex-domus.ch', firstName: 'Samantha', lastName: 'Schiavo', password: 'password123', employmentType: 'MONTHLY_SALARY' as const, pensum: 100 },
  // Fügen Sie hier die anderen 10 Mitarbeiter ein:
  // { email: '...', firstName: '...', lastName: '...', password: '...', employmentType: 'MONTHLY_SALARY' as const, pensum: 100 },
]

async function main() {
  console.log('🔄 Stelle Mitarbeiter wieder her...')

  if (employees.length === 0) {
    console.log('⚠️  Bitte füllen Sie die employees-Array in dieser Datei mit den Mitarbeiter-Informationen aus.')
    console.log('   Format: { email, firstName, lastName, password, employmentType, pensum }')
    return
  }

  for (const emp of employees) {
    try {
      // Prüfe ob User bereits existiert
      const existingUser = await prisma.user.findUnique({
        where: { email: emp.email },
        include: { employee: true },
      })

      if (existingUser) {
        if (existingUser.employee) {
          console.log(`⏭️  Überspringe ${emp.email} (bereits vorhanden)`)
          continue
        } else {
          // User existiert, aber kein Employee - das sollte nicht passieren
          console.log(`⚠️  User ${emp.email} existiert, aber hat keinen Employee-Eintrag`)
          continue
        }
      }

      // Hash Passwort
      const hashedPassword = await bcrypt.hash(emp.password, 10)

      // Erstelle User und Employee
      const user = await prisma.user.create({
        data: {
          email: emp.email,
          password: hashedPassword,
          firstName: emp.firstName,
          lastName: emp.lastName,
          role: 'EMPLOYEE',
          employee: {
            create: {
              employmentType: emp.employmentType,
              pensum: emp.pensum,
            },
          },
        },
        include: {
          employee: true,
        },
      })

      // Berechne Soll-Stunden für die nächsten 5 Jahre
      if (user.employee) {
        try {
          await updateTargetHoursForEmployee(user.employee.id)
        } catch (error) {
          console.error(`⚠️  Fehler beim Berechnen der Soll-Stunden für ${emp.email}:`, error)
        }
      }

      console.log(`✅ Mitarbeiter erstellt: ${emp.firstName} ${emp.lastName} (${emp.email})`)
      console.log(`   Passwort: ${emp.password}`)
      console.log(`   Pensum: ${emp.pensum}%`)
      console.log(`   Anstellung: ${emp.employmentType === 'MONTHLY_SALARY' ? 'Monatslohn' : 'Stundenlohn'}`)
    } catch (error) {
      console.error(`❌ Fehler beim Erstellen von ${emp.email}:`, error)
    }
  }

  console.log('✨ Wiederherstellung abgeschlossen!')
}

main()
  .catch((e) => {
    console.error('❌ Fehler:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
