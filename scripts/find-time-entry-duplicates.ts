import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmm(d: Date) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function main() {
  // Suche alle Duplikate über ALLE Mitarbeiter
  const users = await prisma.user.findMany({
    include: { employee: true },
    orderBy: { lastName: 'asc' },
  })

  let totalDuplicates = 0
  const allDuplicates: Array<{
    employeeName: string
    employeeId: string
    entryType: string
    startTime: string
    endTime: string | null
    entries: any[]
  }> = []

  for (const u of users) {
    if (!u.employee) continue

    const entries = await prisma.timeEntry.findMany({
      where: { employeeId: u.employee.id },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    })

    const seen = new Map<string, any[]>()
    for (const e of entries) {
      // Schlüssel: entryType + startTime + endTime + sleepInterruptionMinutes
      const key = `${e.entryType}|${new Date(e.startTime).toISOString()}|${e.endTime ? new Date(e.endTime).toISOString() : '-'}|${e.sleepInterruptionMinutes || 0}`
      const arr = seen.get(key) ?? []
      arr.push(e)
      seen.set(key, arr)
    }

    for (const [key, arr] of seen.entries()) {
      if (arr.length > 1) {
        const [entryType, startTime, endTime] = key.split('|')
        allDuplicates.push({
          employeeName: `${u.lastName}, ${u.firstName}`,
          employeeId: u.employee.id,
          entryType,
          startTime,
          endTime: endTime === '-' ? null : endTime,
          entries: arr,
        })
        totalDuplicates += arr.length - 1 // jede Dublette zählt 1 Extra
      }
    }
  }

  console.log(`\nGesamt-Duplikate-Übersicht (über alle Mitarbeiter):`)
  console.log(`  Doppelte Datensätze (Anzahl Extras): ${totalDuplicates}`)
  console.log(`  Betroffene Gruppen: ${allDuplicates.length}\n`)

  // Gruppiere nach Mitarbeiter
  const byEmployee = new Map<string, typeof allDuplicates>()
  for (const d of allDuplicates) {
    const arr = byEmployee.get(d.employeeName) ?? []
    arr.push(d)
    byEmployee.set(d.employeeName, arr)
  }

  for (const [name, dups] of [...byEmployee.entries()].sort()) {
    console.log(`\n  ${name}: ${dups.length} Duplikat-Gruppen`)
    for (const d of dups) {
      console.log(`    [${d.entryType.padEnd(20)}] start=${d.startTime} end=${d.endTime ?? '-'}`)
      for (const e of d.entries) {
        const breakInfo = e.breakMinutes ? ` break=${e.breakMinutes}` : ''
        const interruptInfo = e.sleepInterruptionMinutes ? ` interrupt=${e.sleepInterruptionMinutes}` : ''
        console.log(`        id=${e.id} date=${ymd(new Date(e.date))} createdAt=${new Date(e.createdAt).toISOString()}${breakInfo}${interruptInfo}`)
      }
    }
  }

  // Suche auch Duplikate die "fast gleich" sind - z.B. gleiche Zeit aber unterschiedliche Pause
  console.log(`\n\n--- Erweiterte Suche: Überschneidende Einträge ---\n`)

  for (const u of users) {
    if (!u.employee) continue

    const entries = await prisma.timeEntry.findMany({
      where: {
        employeeId: u.employee.id,
        entryType: { in: ['WORK', 'SLEEP'] },
        endTime: { not: null },
      },
      orderBy: [{ startTime: 'asc' }],
    })

    // Suche überschneidende Zeitfenster
    const overlaps: Array<[any, any]> = []
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]
        const b = entries[j]
        const aStart = new Date(a.startTime).getTime()
        const aEnd = new Date(a.endTime!).getTime()
        const bStart = new Date(b.startTime).getTime()
        const bEnd = new Date(b.endTime!).getTime()
        if (bStart >= aEnd) break // sortiert => break inner
        if (aStart < bEnd && bStart < aEnd) {
          // Überschneidung (oder ineinander)
          overlaps.push([a, b])
        }
      }
    }

    if (overlaps.length > 0) {
      console.log(`\n  ${u.lastName}, ${u.firstName}: ${overlaps.length} überschneidende Paare`)
      for (const [a, b] of overlaps.slice(0, 10)) {
        console.log(`    A: [${a.entryType}] date=${ymd(new Date(a.date))} ${new Date(a.startTime).toISOString()} - ${new Date(a.endTime).toISOString()}`)
        console.log(`    B: [${b.entryType}] date=${ymd(new Date(b.date))} ${new Date(b.startTime).toISOString()} - ${new Date(b.endTime).toISOString()}`)
        console.log()
      }
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
}).finally(async () => { await prisma.$disconnect() })
