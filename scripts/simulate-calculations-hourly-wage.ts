import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function simulateCalc(employeeId: string, start: Date, end: Date) {
  const entries = await prisma.timeEntry.findMany({
    where: {
      employeeId,
      date: { gte: start, lte: end },
      endTime: { not: null },
    },
  })

  let hours = 0
  let surchargeHours = 0
  let sleepHours = 0
  let sleepInterruptionHours = 0

  for (const entry of entries) {
    if (entry.endTime && entry.entryType === 'SLEEP') {
      const sleepMin = (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000
      sleepHours += sleepMin / 60
    } else if (entry.endTime && entry.entryType !== 'SLEEP' && entry.entryType !== 'SLEEP_INTERRUPTION') {
      const diffMin = (new Date(entry.endTime).getTime() - new Date(entry.startTime).getTime()) / 60000
      hours += Math.round(((diffMin - (entry.breakMinutes || 0)) / 60) * 100) / 100
    }
    if (entry.entryType === 'SLEEP_INTERRUPTION') {
      sleepInterruptionHours += (entry.sleepInterruptionMinutes || 0) / 60
      hours += (entry.sleepInterruptionMinutes || 0) / 60
    }
    surchargeHours += entry.surchargeHours || 0
  }

  return {
    hours: Math.round(hours * 100) / 100,
    surchargeHours: Math.round(surchargeHours * 100) / 100,
    sleepHours: Math.round(sleepHours * 100) / 100,
    sleepInterruptionHours: Math.round(sleepInterruptionHours * 100) / 100,
    totalHours: Math.round((hours + surchargeHours) * 100) / 100,
    count: entries.length,
  }
}

async function main() {
  const employees = await prisma.employee.findMany({
    where: { employmentType: 'HOURLY_WAGE' },
    include: { user: true },
  })

  const periods = [
    { label: '21.12.25-20.01.26', start: new Date(2025, 11, 21, 0, 0, 0, 0), end: new Date(2026, 0, 20, 23, 59, 59, 999) },
    { label: '21.01.26-20.02.26', start: new Date(2026, 0, 21, 0, 0, 0, 0), end: new Date(2026, 1, 20, 23, 59, 59, 999) },
    { label: '21.02.26-20.03.26', start: new Date(2026, 1, 21, 0, 0, 0, 0), end: new Date(2026, 2, 20, 23, 59, 59, 999) },
    { label: '21.03.26-20.04.26', start: new Date(2026, 2, 21, 0, 0, 0, 0), end: new Date(2026, 3, 20, 23, 59, 59, 999) },
    { label: '21.04.26-20.05.26', start: new Date(2026, 3, 21, 0, 0, 0, 0), end: new Date(2026, 4, 20, 23, 59, 59, 999) },
  ]

  console.log(`Lohnperioden (Stundenlohn): jeweils 21. Vormonat bis 20. Folgemonat\n`)

  for (const e of employees.sort((a, b) => a.user.lastName.localeCompare(b.user.lastName))) {
    console.log(`\n=== ${e.user.lastName}, ${e.user.firstName} (Pensum ${e.pensum}%) ===`)
    console.log(`  Periode             | Einträge | Arbeit  | Zuschl. | Schlaf  | Unterbr.| Total`)
    for (const p of periods) {
      const r = await simulateCalc(e.id, p.start, p.end)
      console.log(
        `  ${p.label}    | ${String(r.count).padStart(7)} | ${r.hours.toFixed(2).padStart(6)} | ${r.surchargeHours.toFixed(2).padStart(6)} | ${r.sleepHours.toFixed(2).padStart(6)} | ${r.sleepInterruptionHours.toFixed(2).padStart(6)} | ${r.totalHours.toFixed(2)}`
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => { await prisma.$disconnect() })
