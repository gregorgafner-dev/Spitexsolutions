import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const email = (process.env.SZS_ADMIN_EMAIL || 'szs@admin.ch').toLowerCase()
  const password = process.env.SZS_ADMIN_PASSWORD || 'SZS2026'
  const firstName = 'SZS'
  const lastName = 'Admin'

  console.log(`SZS-Admin anlegen/aktualisieren: ${email}`)

  const hashedPassword = await bcrypt.hash(password, 10)

  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: { admin: true },
  })

  if (existingUser) {
    console.log('Benutzer existiert bereits, aktualisiere Rolle/Passwort/Profil...')
    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        firstName,
        lastName,
        role: 'ADMIN_SZS',
      },
    })

    if (!existingUser.admin) {
      try {
        await prisma.admin.create({ data: { userId: existingUser.id } })
      } catch (e) {
        // Admin-Eintrag ist optional. Wenn er nicht erstellt werden kann, ignorieren.
        console.warn('Admin-Profileintrag konnte nicht erstellt werden:', e)
      }
    }

    console.log('SZS-Admin aktualisiert!')
    console.log(`  Email: ${email}`)
    console.log(`  Rolle: ADMIN_SZS`)
    return
  }

  await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'ADMIN_SZS',
      admin: { create: {} },
    },
  })

  console.log('SZS-Admin erstellt!')
  console.log(`  Email: ${email}`)
  console.log(`  Passwort: ${password}`)
  console.log(`  Rolle: ADMIN_SZS`)
}

main()
  .catch((e) => {
    console.error('Fehler beim Anlegen des SZS-Admins:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
