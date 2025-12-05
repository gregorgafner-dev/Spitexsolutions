import { PrismaClient } from '@prisma/client'
import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, readdirSync, statSync } from 'fs'
import bcrypt from 'bcryptjs'
import { updateTargetHoursForEmployee } from '../lib/update-target-hours'

// Prüfe ob DATABASE_URL gesetzt ist
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('❌ DATABASE_URL ist nicht gesetzt!')
  console.error('   Bitte setze die DATABASE_URL als Umgebungsvariable:')
  console.error('   export DATABASE_URL="postgresql://..."')
  console.error('   oder:')
  console.error('   DATABASE_URL="postgresql://..." npm run db:restore-from-backup')
  process.exit(1)
}

if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
  console.error('❌ DATABASE_URL muss auf eine PostgreSQL-Datenbank zeigen!')
  console.error(`   Aktuelle URL: ${databaseUrl.substring(0, 20)}...`)
  console.error('   Bitte setze die Production-DATABASE_URL (Neon PostgreSQL)')
  process.exit(1)
}

console.log('📡 Verbinde mit Production-Datenbank...')
console.log(`   URL: ${databaseUrl.substring(0, 30)}...`)

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
})
const BACKUP_DIR = join(process.cwd(), 'backups')
const BACKUP_PREFIX = 'dev.db.backup'

interface BackupEmployee {
  id: string
  userId: string
  employmentType: string
  pensum: number
  user: {
    id: string
    email: string
    firstName: string
    lastName: string
    password: string
    role: string
  }
}

interface BackupService {
  id: string
  name: string
  description: string | null
  duration: number
  color: string
}

function getLatestBackup(): string | null {
  if (!existsSync(BACKUP_DIR)) {
    console.log('❌ Backup-Verzeichnis existiert nicht')
    return null
  }

  const files = readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith(BACKUP_PREFIX))
    .map(f => ({
      name: f,
      path: join(BACKUP_DIR, f),
      time: statSync(join(BACKUP_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time)

  if (files.length === 0) {
    console.log('❌ Keine Backups gefunden')
    return null
  }

  return files[0].path
}

async function restoreEmployees(backupPath: string) {
  console.log('📦 Stelle Mitarbeiter wieder her...')
  
  const db = new Database(backupPath, { readonly: true })
  
  try {
    // Hole alle Employees mit User-Daten
    const employees = db.prepare(`
      SELECT 
        e.id,
        e."userId" as userId,
        e."employmentType" as employmentType,
        e.pensum,
        u.id as user_id,
        u.email,
        u."firstName" as firstName,
        u."lastName" as lastName,
        u.password,
        u.role
      FROM employees e
      JOIN users u ON e."userId" = u.id
      WHERE u.role = 'EMPLOYEE'
    `).all() as any[]

    console.log(`   Gefunden: ${employees.length} Mitarbeiter im Backup`)

    let created = 0
    let skipped = 0
    let errors = 0

    for (const emp of employees) {
      try {
        const employeeData = {
          id: emp.id,
          userId: emp.userId,
          employmentType: emp.employmentType,
          pensum: emp.pensum,
          user: {
            id: emp.user_id,
            email: emp.email,
            firstName: emp.firstName,
            lastName: emp.lastName,
            password: emp.password,
            role: emp.role,
          }
        }

        // Prüfe ob User bereits existiert
        const existingUser = await prisma.user.findUnique({
          where: { email: employeeData.user.email },
          include: { employee: true },
        })

        if (existingUser) {
          if (existingUser.employee) {
            console.log(`⏭️  Überspringe ${employeeData.user.email} (bereits vorhanden)`)
            skipped++
            continue
          } else {
            // User existiert, aber kein Employee - erstelle Employee
            console.log(`⚠️  User ${employeeData.user.email} existiert ohne Employee, erstelle Employee...`)
            
            const employee = await prisma.employee.create({
              data: {
                userId: existingUser.id,
                employmentType: employeeData.employmentType,
                pensum: employeeData.pensum,
              },
            })

            // Berechne Soll-Stunden
            try {
              await updateTargetHoursForEmployee(employee.id)
            } catch (error) {
              console.error(`⚠️  Fehler beim Berechnen der Soll-Stunden:`, error)
            }

            console.log(`✅ Employee für ${employeeData.user.email} erstellt`)
            created++
            continue
          }
        }

        // Erstelle neuen User und Employee
        const user = await prisma.user.create({
          data: {
            email: employeeData.user.email,
            password: employeeData.user.password, // Passwort ist bereits gehasht
            firstName: employeeData.user.firstName,
            lastName: employeeData.user.lastName,
            role: 'EMPLOYEE',
            employee: {
              create: {
                employmentType: employeeData.employmentType,
                pensum: employeeData.pensum,
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
            console.error(`⚠️  Fehler beim Berechnen der Soll-Stunden:`, error)
          }
        }

        console.log(`✅ Mitarbeiter wiederhergestellt: ${employeeData.user.firstName} ${employeeData.user.lastName} (${employeeData.user.email})`)
        created++
      } catch (error) {
        const email = emp?.email || 'unbekannt'
        console.error(`❌ Fehler beim Wiederherstellen von ${email}:`, error)
        errors++
      }
    }

    console.log(`\n📊 Zusammenfassung Mitarbeiter:`)
    console.log(`   ✅ Erstellt: ${created}`)
    console.log(`   ⏭️  Übersprungen: ${skipped}`)
    console.log(`   ❌ Fehler: ${errors}`)
  } finally {
    db.close()
  }
}

async function restoreServices(backupPath: string) {
  console.log('\n📦 Stelle Dienste wieder her...')
  
  const db = new Database(backupPath, { readonly: true })
  
  try {
    // Hole alle Services
    const services = db.prepare(`
      SELECT id, name, description, duration, color
      FROM services
      ORDER BY name
    `).all() as BackupService[]

    console.log(`   Gefunden: ${services.length} Dienste im Backup`)

    let created = 0
    let skipped = 0
    let errors = 0

    for (const service of services) {
      try {
        // Prüfe ob Service bereits existiert
        const existingService = await prisma.service.findFirst({
          where: { name: service.name },
        })

        if (existingService) {
          console.log(`⏭️  Überspringe ${service.name} (bereits vorhanden)`)
          skipped++
          continue
        }

        // Erstelle neuen Service
        await prisma.service.create({
          data: {
            name: service.name,
            description: service.description,
            duration: service.duration,
            color: service.color,
          },
        })

        console.log(`✅ Dienst wiederhergestellt: ${service.name}`)
        created++
      } catch (error) {
        console.error(`❌ Fehler beim Wiederherstellen von ${service.name}:`, error)
        errors++
      }
    }

    console.log(`\n📊 Zusammenfassung Dienste:`)
    console.log(`   ✅ Erstellt: ${created}`)
    console.log(`   ⏭️  Übersprungen: ${skipped}`)
    console.log(`   ❌ Fehler: ${errors}`)
  } finally {
    db.close()
  }
}

async function main() {
  console.log('🔄 Starte Wiederherstellung aus Backup...\n')

  const backupPath = getLatestBackup()
  if (!backupPath) {
    console.log('❌ Kein Backup gefunden')
    process.exit(1)
  }

  console.log(`📁 Verwende Backup: ${backupPath}\n`)

  try {
    // Stelle Mitarbeiter wieder her
    await restoreEmployees(backupPath)

    // Stelle Dienste wieder her
    await restoreServices(backupPath)

    console.log('\n✨ Wiederherstellung abgeschlossen!')
  } catch (error) {
    console.error('❌ Fehler bei der Wiederherstellung:', error)
    process.exit(1)
  }
}

main()
  .catch((e) => {
    console.error('❌ Fehler:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

