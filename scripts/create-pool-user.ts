/**
 * CLI: Pool-User anlegen oder Passwort zurücksetzen.
 *
 * Beispiele:
 *   npx tsx scripts/create-pool-user.ts \
 *     --email planer@spitex-zh.ch --first Anna --last Planer \
 *     --role PLANNER --password 'StartPasswort1!'
 *
 *   npx tsx scripts/create-pool-user.ts \
 *     --email member@spitex-zh.ch --first Beat --last Mitarbeiter \
 *     --role MEMBER --password 'StartPasswort2!'
 *
 * Update Passwort (per --update):
 *   npx tsx scripts/create-pool-user.ts \
 *     --email planer@spitex-zh.ch --password 'NeuesPW' --update
 *
 * Setze für lokale Dev DB: DATABASE_URL bleibt unverändert (file:./dev.db).
 * Für Produktion: zuerst .env.local sourcen.
 */

import { PrismaClient } from '@prisma/client'
import { hashPoolPassword } from '../lib/pool/auth'
import { isValidQualification } from '../lib/pool/qualifications'

const prisma = new PrismaClient()

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`)
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined
  return process.argv[idx + 1]
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const email = arg('email')?.toLowerCase().trim()
  const password = arg('password')
  const firstName = arg('first')
  const lastName = arg('last')
  const role = arg('role') as 'PLANNER' | 'MEMBER' | undefined
  const phone = arg('phone') ?? null
  const notes = arg('notes') ?? null
  const qualificationArg = arg('qualification')
  const update = flag('update')

  let qualification: string | null | undefined = undefined
  if (qualificationArg !== undefined) {
    if (qualificationArg === '' || qualificationArg.toUpperCase() === 'NONE') {
      qualification = null
    } else if (!isValidQualification(qualificationArg)) {
      console.error(
        `FEHLER: --qualification muss einer von DIPL|FAGE|BKM|SRK|HW sein (oder NONE).`
      )
      process.exit(1)
    } else {
      qualification = qualificationArg
    }
  }

  if (!email) {
    console.error('FEHLER: --email ist erforderlich.')
    process.exit(1)
  }
  if (!password) {
    console.error('FEHLER: --password ist erforderlich.')
    process.exit(1)
  }

  const existing = await prisma.poolUser.findUnique({ where: { email } })

  if (existing && !update) {
    console.error(
      `FEHLER: User mit ${email} existiert bereits. --update verwenden, um Passwort zu setzen.`
    )
    process.exit(1)
  }

  const passwordHash = await hashPoolPassword(password)

  if (existing && update) {
    const updated = await prisma.poolUser.update({
      where: { email },
      data: {
        password: passwordHash,
        ...(role ? { role } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(qualification !== undefined ? { qualification } : {}),
      },
    })
    console.log(
      `Aktualisiert: ${updated.email} (${updated.role}) – id=${updated.id}`
    )
    return
  }

  if (!firstName || !lastName) {
    console.error('FEHLER: --first und --last sind beim Neuanlegen erforderlich.')
    process.exit(1)
  }
  if (!role || (role !== 'PLANNER' && role !== 'MEMBER')) {
    console.error('FEHLER: --role muss PLANNER oder MEMBER sein.')
    process.exit(1)
  }

  const created = await prisma.poolUser.create({
    data: {
      email,
      password: passwordHash,
      firstName,
      lastName,
      role,
      phone: phone ?? undefined,
      notes: notes ?? undefined,
      qualification: qualification ?? undefined,
      active: true,
    },
  })

  console.log(
    `Angelegt: ${created.email} (${created.role}) – id=${created.id}`
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
