import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'ss@spitex-domus.ch'
  const password = 'Tester11!!!'
  const firstName = 'Test'
  const lastName = 'User'
  const employmentType = 'MONTHLY_SALARY'
  const pensum = 100 // 100%

  console.log(`🌱 Erstelle Test-Benutzer: ${email}`)

  // Prüfe ob User bereits existiert
  const existingUser = await prisma.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    console.log(`⚠️  Benutzer ${email} existiert bereits!`)
    console.log('   Überspringe Erstellung...')
    return
  }

  // Hash Passwort
  const hashedPassword = await bcrypt.hash(password, 10)

  // Erstelle User und Employee
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'EMPLOYEE',
      employee: {
        create: {
          employmentType,
          pensum,
        },
      },
    },
    include: {
      employee: true,
    },
  })

  console.log(`✅ Test-Benutzer erstellt!`)
  console.log(`   Email: ${email}`)
  console.log(`   Passwort: ${password}`)
  console.log(`   Name: ${firstName} ${lastName}`)
  console.log(`   Rolle: EMPLOYEE`)
  console.log(`   Pensum: ${pensum}%`)
}

main()
  .catch((e) => {
    console.error('❌ Fehler beim Erstellen des Test-Benutzers:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })








