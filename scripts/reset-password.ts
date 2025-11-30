import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = 'ss@spitex-domus.ch'
  const newPassword = 'Tester11!!!'

  console.log(`🔐 Setze Passwort für Benutzer zurück: ${email}`)

  // Suche Benutzer
  const user = await prisma.user.findUnique({
    where: { email },
  })

  if (!user) {
    console.log(`❌ Benutzer ${email} nicht gefunden!`)
    console.log('   Erstelle neuen Benutzer...')
    
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'User',
        role: 'EMPLOYEE',
        employee: {
          create: {
            employmentType: 'MONTHLY_SALARY',
            pensum: 100,
          },
        },
      },
    })
    
    console.log(`✅ Benutzer erstellt und Passwort gesetzt!`)
    console.log(`   Email: ${email}`)
    console.log(`   Passwort: ${newPassword}`)
    return
  }

  // Hash neues Passwort
  const hashedPassword = await bcrypt.hash(newPassword, 10)

  // Aktualisiere Passwort
  await prisma.user.update({
    where: { email },
    data: {
      password: hashedPassword,
    },
  })

  console.log(`✅ Passwort erfolgreich zurückgesetzt!`)
  console.log(`   Email: ${email}`)
  console.log(`   Neues Passwort: ${newPassword}`)
  
  // Prüfe ob Employee existiert
  const userWithEmployee = await prisma.user.findUnique({
    where: { email },
    include: { employee: true },
  })
  
  if (!userWithEmployee?.employee) {
    console.log('⚠️  Benutzer hat noch kein Employee-Profil. Erstelle es...')
    await prisma.employee.create({
      data: {
        userId: user.id,
        employmentType: 'MONTHLY_SALARY',
        pensum: 100,
      },
    })
    console.log('✅ Employee-Profil erstellt!')
  }
}

main()
  .catch((e) => {
    console.error('❌ Fehler beim Zurücksetzen des Passworts:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

