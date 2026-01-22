import { PrismaClient } from '@prisma/client'
import { backupDatabase, cleanupOldBackups } from './backup-database'
import { updateMonthlyBalance } from '../lib/update-monthly-balance'

type Args = {
  from: string
  to: string
  dryRun: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    from: '2026-01-01',
    to: '2026-02-01',
    dryRun: true,
  }

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--from' && argv[i + 1]) {
      args.from = argv[++i]
      continue
    }
    if (a === '--to' && argv[i + 1]) {
      args.to = argv[++i]
      continue
    }
    if (a === '--apply') {
      args.dryRun = false
      continue
    }
    if (a === '--dry-run') {
      args.dryRun = true
      continue
    }
  }

  return args
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function sameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function timeIs(d: Date, hh: number, mm: number): boolean {
  return d.getHours() === hh && d.getMinutes() === mm
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function main() {
  const { from, to, dryRun } = parseArgs(process.argv)

  const fromDate = startOfDay(new Date(from))
  const toDate = startOfDay(new Date(to))

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    throw new Error(`Ungültiges Datum. from=${from} to=${to}`)
  }

  if (toDate <= fromDate) {
    throw new Error(`Ungültiger Bereich: to muss nach from liegen. from=${from} to=${to}`)
  }

  console.log(`🔎 Nachtdienst-Fix (Buchungsdatum)`)
  console.log(`   Zeitraum: ${ymdKey(fromDate)} .. ${ymdKey(toDate)} (to exklusiv)`)
  console.log(`   Modus: ${dryRun ? 'DRY RUN (keine Änderungen)' : 'APPLY (Änderungen werden geschrieben)'}`)

  if (!dryRun) {
    // Best-effort Backup (funktioniert lokal für SQLite-Dev-DB)
    backupDatabase()
    cleanupOldBackups()
  }

  const prisma = new PrismaClient()

  try {
    // Kandidaten = Einträge, die nach altem System auf dem Folgetag "gebucht" wurden
    // Heuristik: entry.date == startTime-Kalendertag UND Zeitmuster (06:01 / 00:00-06:00 / SLEEP_INTERRUPTION)
    const entriesInRange = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: fromDate,
          lt: toDate,
        },
        entryType: { in: ['WORK', 'SLEEP', 'SLEEP_INTERRUPTION'] },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { startTime: 'asc' }],
    })

    const candidates = entriesInRange.filter((e) => {
      const d = new Date(e.date)
      d.setHours(0, 0, 0, 0)
      const st = new Date(e.startTime)
      const et = e.endTime ? new Date(e.endTime) : null

      // Nur alte Split-Logik: date == startTime day
      if (!sameYMD(d, st)) return false

      if (e.entryType === 'WORK') {
        return timeIs(st, 6, 1)
      }

      if (e.entryType === 'SLEEP') {
        return !!et && timeIs(st, 0, 0) && timeIs(et, 6, 0)
      }

      if (e.entryType === 'SLEEP_INTERRUPTION') {
        // Wird in der UI typischerweise mit 00:00 gespeichert
        return timeIs(st, 0, 0)
      }

      return false
    })

    // Start-Block-Mapping (Vortag): WORK bis 23:00 (Start kann abweichen)
    const startBlockRangeFrom = new Date(fromDate)
    startBlockRangeFrom.setDate(startBlockRangeFrom.getDate() - 1)
    const startBlocks = await prisma.timeEntry.findMany({
      where: {
        date: {
          gte: startBlockRangeFrom,
          lt: toDate,
        },
        entryType: 'WORK',
        endTime: { not: null },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { startTime: 'asc' }],
    })

    const hasNightShiftStartByEmployeeDay = new Set<string>()
    for (const e of startBlocks) {
      const bookingDay = startOfDay(new Date(e.date))
      const st = new Date(e.startTime)
      const et = e.endTime ? new Date(e.endTime) : null
      if (!et) continue

      // Endzeit 23:00 ist das starke Signal
      if (et.getHours() === 23 && et.getMinutes() === 0 && st.getHours() >= 17 && st.getHours() <= 22) {
        hasNightShiftStartByEmployeeDay.add(`${e.employeeId}|${ymdKey(bookingDay)}`)
      }
    }

    const toShift = candidates.filter((e) => {
      const d = startOfDay(new Date(e.date))
      const prev = new Date(d)
      prev.setDate(prev.getDate() - 1)
      const key = `${e.employeeId}|${ymdKey(prev)}`
      return hasNightShiftStartByEmployeeDay.has(key)
    })

    console.log(`   Einträge im Bereich: ${entriesInRange.length}`)
    console.log(`   Kandidaten (alt-split): ${candidates.length}`)
    console.log(`   Umzubuchen (mit Startblock-Vortag): ${toShift.length}`)

    const changes = toShift.map((e) => {
      const oldDate = startOfDay(new Date(e.date))
      const newDate = new Date(oldDate)
      newDate.setDate(newDate.getDate() - 1)
      newDate.setHours(0, 0, 0, 0)
      return { id: e.id, employeeId: e.employeeId, oldDate, newDate, entryType: e.entryType }
    })

    // Übersicht pro Tag/Employee (hilft beim Plausibilisieren)
    const byKey = new Map<string, number>()
    for (const c of changes) {
      const k = `${c.employeeId}|${ymdKey(c.oldDate)}->${ymdKey(c.newDate)}`
      byKey.set(k, (byKey.get(k) ?? 0) + 1)
    }
    console.log(`   Gruppen (employeeId|alt->neu): ${byKey.size}`)

    if (dryRun) {
      console.log(`✅ DRY RUN beendet. (Nichts geändert)`)
      return
    }

    // Write: verschiebe Buchungsdatum (date) um -1 Tag
    await prisma.$transaction(
      changes.map((c) =>
        prisma.timeEntry.update({
          where: { id: c.id },
          data: { date: c.newDate },
        })
      )
    )

    console.log(`✅ ${changes.length} Einträge umgebucht.`)

    // Monatssalden neu berechnen (alte + neue Monate)
    const monthsToRecalc = new Map<string, { employeeId: string; year: number; month: number }>()
    for (const c of changes) {
      for (const d of [c.oldDate, c.newDate]) {
        const key = `${c.employeeId}|${monthKey(d)}`
        if (!monthsToRecalc.has(key)) {
          monthsToRecalc.set(key, { employeeId: c.employeeId, year: d.getFullYear(), month: d.getMonth() + 1 })
        }
      }
    }

    console.log(`🔄 Recalc MonthlyBalance: ${monthsToRecalc.size} Monate`)
    for (const m of monthsToRecalc.values()) {
      const anyDayInMonth = new Date(m.year, m.month - 1, 15)
      await updateMonthlyBalance(m.employeeId, anyDayInMonth)
    }

    console.log(`✅ Fertig.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('❌ Fehler im Nachtdienst-Fix:', e)
  process.exit(1)
})

