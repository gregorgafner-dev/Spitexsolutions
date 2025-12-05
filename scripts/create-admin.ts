import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Konfiguration - bitte anpassen
  const email = process.env.ADMIN_EMAIL || 'admin2@spitex-domus.ch'
  const password = process.env.ADMIN_PASSWORD || 'Admin123!!!'
  const firstName = process.env.ADMIN_FIRST_NAME || 'Admin'
  const lastName = process.env.ADMIN_LAST_NAME || '2'

  console.log(`🌱 Erstelle zweiten Admin-Benutzer: ${email}`)

  // Prüfe ob User bereits existiert
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { admin: true },
  })

  if (existingUser) {
    if (existingUser.role === 'ADMIN' && existingUser.admin) {
      console.log(`⚠️  Admin-Benutzer ${email} existiert bereits!`)
      console.log('   Setze Passwort zurück...')
      
      const hashedPassword = await bcrypt.hash(password, 10)
      await prisma.user.update({
        where: { email },
        data: { password: hashedPassword },
      })
      console.log(`✅ Passwort zurückgesetzt!`)
      console.log(`   Email: ${email}`)
      console.log(`   Neues Passwort: ${password}`)
      return
    } else {
      console.log(`❌ Benutzer ${email} existiert bereits, aber ist kein Admin!`)
      console.log('   Bitte verwenden Sie eine andere Email-Adresse.')
      process.exit(1)
    }
  }

  // Hash Passwort
  const hashedPassword = await bcrypt.hash(password, 10)

  // Erstelle User und Admin
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'ADMIN',
      admin: {
        create: {},
      },
    },
    include: {
      admin: true,
    },
  })

  console.log(`✅ Zweiter Admin-Benutzer erstellt!`)
  console.log(`   Email: ${email}`)
  console.log(`   Passwort: ${password}`)
  console.log(`   Name: ${firstName} ${lastName}`)
  console.log(`   Rolle: ADMIN`)
  console.log(`   ⚠️  Bitte ändern Sie das Passwort nach dem ersten Login!`)
}

main()
  .catch((e) => {
    console.error('❌ Fehler beim Erstellen des Admin-Benutzers:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

