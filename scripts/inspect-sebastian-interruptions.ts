import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const employee = await prisma.employee.findFirst({
    where: { user: { lastName: 'H_Silvestro' } },
    include: { user: true },
  })
  if (!employee) {
    console.error('Sebastian nicht gefunden')
    return
  }

  const start = new Date(2026, 3, 21, 0, 0, 0, 0) // 21.04.26
  const end = new Date(2026, 4, 20, 23, 59, 59, 999) // 20.05.26

  const entries = await prisma.timeEntry.findMany({
    where: {
      employeeId: employee.id,
      entryType: 'SLEEP_INTERRUPTION',
      date: { gte: start, lte: end },
    },
    orderBy: { date: 'asc' },
  })

  console.log(`\nSebastian Schlafunterbrechungen 21.04.26 – 20.05.26:\n`)
  console.log(`  ID                              | date         | startTime                | minutes`)
  let totalMin = 0
  for (const e of entries) {
    const dateStr = e.date.toISOString().substring(0, 10)
    const startStr = e.startTime.toISOString()
    const min = e.sleepInterruptionMinutes ?? 0
    totalMin += min
    console.log(`  ${e.id} | ${dateStr} | ${startStr} | ${min}`)
  }
  console.log(`\nTotal: ${entries.length} Einträge, ${totalMin} Minuten = ${(totalMin/60).toFixed(2)}h`)
  console.log(`\nVerteilung der Minuten-Werte:`)
  const distribution = new Map<number, number>()
  for (const e of entries) {
    const min = e.sleepInterruptionMinutes ?? 0
    distribution.set(min, (distribution.get(min) ?? 0) + 1)
  }
  for (const [min, count] of [...distribution.entries()].sort((a,b) => a[0]-b[0])) {
    console.log(`  ${min} Min:  ${count}x`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => { await prisma.$disconnect() })
