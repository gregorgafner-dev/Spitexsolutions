import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const zeroEntries = await prisma.timeEntry.findMany({
    where: {
      entryType: 'SLEEP_INTERRUPTION',
      sleepInterruptionMinutes: 0,
    },
    include: { employee: { include: { user: true } } },
    orderBy: { date: 'desc' },
  })

  console.log(`\nAlle SLEEP_INTERRUPTION-Einträge mit 0 oder null Minuten:\n`)
  console.log(`  count = ${zeroEntries.length}\n`)
  for (const e of zeroEntries) {
    const dateStr = e.date.toISOString().substring(0, 10)
    const startStr = e.startTime.toISOString()
    const min = e.sleepInterruptionMinutes
    const name = `${e.employee.user.lastName}, ${e.employee.user.firstName}`
    console.log(`  ${name.padEnd(30)} | ${dateStr} | startTime ${startStr} | min=${min}`)
  }

  console.log('\n\nAlle SLEEP_INTERRUPTION-Werte (Verteilung über alle MA, ganze Datenbasis):\n')
  const all = await prisma.timeEntry.findMany({
    where: { entryType: 'SLEEP_INTERRUPTION' },
    select: { sleepInterruptionMinutes: true },
  })
  const dist = new Map<number, number>()
  for (const e of all) {
    const m = e.sleepInterruptionMinutes ?? -1
    dist.set(m, (dist.get(m) ?? 0) + 1)
  }
  for (const [min, count] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${String(min).padStart(4)} Min: ${count}x`)
  }
  console.log(`\nTotal SLEEP_INTERRUPTION-Einträge: ${all.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => { await prisma.$disconnect() })
