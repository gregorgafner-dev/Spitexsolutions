import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starte Seeding...')

  // Erstelle Admin-Account
  const adminPassword = await bcrypt.hash('admin123', 10)
  
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'istrator',
      role: 'ADMIN',
      admin: {
        create: {},
      },
    },
    include: {
      admin: true,
    },
  })

  console.log('✅ Admin-Account erstellt:', adminUser.email)
  console.log('   Passwort: admin123')
  console.log('   ⚠️  Bitte ändern Sie das Passwort nach dem ersten Login!')

  // Erstelle WorkTimeConfig für die nächsten 5 Jahre
  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4]
  
  for (const year of years) {
    await prisma.workTimeConfig.upsert({
      where: { year },
      update: {},
      create: {
        year,
        weeklyHours: 42.5, // Standard für Kanton Zug, Schweiz
      },
    })
    console.log(`✅ WorkTimeConfig für ${year} erstellt (42.5h/Woche)`)
  }

  console.log('✨ Seeding abgeschlossen!')
}

main()
  .catch((e) => {
    console.error('❌ Fehler beim Seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

