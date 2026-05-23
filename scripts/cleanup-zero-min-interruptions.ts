import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const APPLY = process.argv.includes('--apply')

async function main() {
  const zeroEntries = await prisma.timeEntry.findMany({
    where: {
      entryType: 'SLEEP_INTERRUPTION',
      sleepInterruptionMinutes: 0,
    },
    include: { employee: { include: { user: true } } },
    orderBy: { date: 'asc' },
  })

  console.log(`\nGefundene SLEEP_INTERRUPTION-Einträge mit 0 Minuten: ${zeroEntries.length}\n`)
  for (const e of zeroEntries) {
    const name = `${e.employee.user.lastName}, ${e.employee.user.firstName}`
    const dateStr = e.date.toISOString().substring(0, 10)
    const startStr = e.startTime.toISOString()
    console.log(`  ID=${e.id} | ${name} | date=${dateStr} | startTime=${startStr}`)
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] Nichts gelöscht. Mit --apply ausführen, um zu löschen.\n`)
    return
  }

  if (zeroEntries.length === 0) {
    console.log(`\nKeine Einträge zu löschen.\n`)
    return
  }

  const ids = zeroEntries.map((e) => e.id)
  const result = await prisma.timeEntry.deleteMany({
    where: { id: { in: ids } },
  })
  console.log(`\nGelöscht: ${result.count} Eintrag/Einträge.\n`)

  // Verifizierung
  const after = await prisma.timeEntry.count({
    where: { entryType: 'SLEEP_INTERRUPTION', sleepInterruptionMinutes: 0 },
  })
  console.log(`Verifizierung: ${after} verbleibende 0-Min-Einträge.\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => { await prisma.$disconnect() })
