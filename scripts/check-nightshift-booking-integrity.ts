import { PrismaClient } from '@prisma/client'

type Args = {
  strictFrom?: string
  lookbackDays: number
  maxSamples: number
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    lookbackDays: 30,
    maxSamples: 20,
  }

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--strict-from' && argv[i + 1]) {
      args.strictFrom = argv[++i]
      continue
    }
    if (a === '--lookback-days' && argv[i + 1]) {
      args.lookbackDays = parseInt(argv[++i], 10)
      continue
    }
    if (a === '--max-samples' && argv[i + 1]) {
      args.maxSamples = parseInt(argv[++i], 10)
      continue
    }
  }

  return args
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameYMD(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function minusDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() - n)
  return x
}

function isTime(d: Date, hh: number, mm: number): boolean {
  return d.getHours() === hh && d.getMinutes() === mm
}

function isNightShiftStartBlock(e: { entryType: string; startTime: Date; endTime: Date | null }): boolean {
  if (e.entryType !== 'WORK' || !e.endTime) return false
  const st = new Date(e.startTime)
  const et = new Date(e.endTime)
  // Endzeit 23:00 ist das Signal, Startzeit kann abweichen (z.B. 18:xx)
  return et.getHours() === 23 && et.getMinutes() === 0 && st.getHours() >= 17 && st.getHours() <= 22
}

async function main() {
  const { strictFrom, lookbackDays, maxSamples } = parseArgs(process.argv)

  const prisma = new PrismaClient()

  try {
    const now = new Date()
    const createdAtFrom = strictFrom ? startOfDay(new Date(strictFrom)) : startOfDay(minusDays(now, lookbackDays))
    if (Number.isNaN(createdAtFrom.getTime())) {
      throw new Error(`Ungültiges Datum für --strict-from: ${strictFrom}`)
    }

    console.log('🔎 Nightshift booking integrity check (READ ONLY)')
    console.log(`   createdAt >= ${ymd(createdAtFrom)} (${strictFrom ? 'strict-from' : `lookback-days=${lookbackDays}`})`)

    // Lade relevante Einträge ab createdAtFrom
    const entries = await prisma.timeEntry.findMany({
      where: {
        createdAt: { gte: createdAtFrom },
        entryType: { in: ['WORK', 'SLEEP', 'SLEEP_INTERRUPTION'] },
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        startTime: true,
        endTime: true,
        entryType: true,
        createdAt: true,
        sleepInterruptionMinutes: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    })

    // Map: employeeId|bookingDate => hasNightShiftStart
    const startBlockKeys = new Set<string>()
    for (const e of entries) {
      if (isNightShiftStartBlock(e)) {
        const booking = startOfDay(new Date(e.date))
        startBlockKeys.add(`${e.employeeId}|${ymd(booking)}`)
      }
    }

    const issues: Array<{
      id: string
      employeeId: string
      entryType: string
      bookingDate: string
      startDay: string
      expectedBookingDate: string
      reason: string
    }> = []

    for (const e of entries) {
      const booking = startOfDay(new Date(e.date))
      const st = new Date(e.startTime)
      const startDay = startOfDay(st)

      // Wir prüfen nur die "Folgetag"-Teile des Nachtdienstes:
      // - WORK 06:01
      // - SLEEP 00:00-06:00
      // - SLEEP_INTERRUPTION typ. 00:00
      let isCarryOver = false
      if (e.entryType === 'WORK') {
        isCarryOver = isTime(st, 6, 1)
      } else if (e.entryType === 'SLEEP') {
        const et = e.endTime ? new Date(e.endTime) : null
        isCarryOver = !!et && isTime(st, 0, 0) && isTime(et, 6, 0)
      } else if (e.entryType === 'SLEEP_INTERRUPTION') {
        isCarryOver = isTime(st, 0, 0)
      }

      if (!isCarryOver) continue

      // Im neuen Modell muss bookingDate = startDay - 1 sein, weil startTime am Folgetag liegt.
      const expectedBooking = startOfDay(minusDays(startDay, 1))
      const isOk = isSameYMD(booking, expectedBooking)

      if (!isOk) {
        issues.push({
          id: e.id,
          employeeId: e.employeeId,
          entryType: e.entryType,
          bookingDate: ymd(booking),
          startDay: ymd(startDay),
          expectedBookingDate: ymd(expectedBooking),
          reason: 'Carry-over entry hat falsches Buchungsdatum (Regression/alte Split-Erfassung).',
        })
        continue
      }

      // Optional: zum Startdatum sollte ein Startblock (Ende 23:00) existieren.
      const startKey = `${e.employeeId}|${ymd(expectedBooking)}`
      if (!startBlockKeys.has(startKey)) {
        issues.push({
          id: e.id,
          employeeId: e.employeeId,
          entryType: e.entryType,
          bookingDate: ymd(booking),
          startDay: ymd(startDay),
          expectedBookingDate: ymd(expectedBooking),
          reason: 'Carry-over entry korrekt gebucht, aber kein 23:00-Startblock am Startdatum gefunden (evtl. unvollständiger Nachtdienst).',
        })
      }
    }

    if (issues.length === 0) {
      console.log(`✅ OK: Keine Auffälligkeiten in ${entries.length} geprüften Einträgen.`)
      return
    }

    console.log(`❌ Auffälligkeiten: ${issues.length} (geprüfte Einträge: ${entries.length})`)
    console.log(`   Beispiele (max ${maxSamples}):`)
    for (const i of issues.slice(0, Math.max(0, maxSamples))) {
      console.log(
        `   - ${i.entryType} ${i.id} employee=${i.employeeId} booking=${i.bookingDate} startDay=${i.startDay} expected=${i.expectedBookingDate} :: ${i.reason}`
      )
    }

    process.exitCode = 2
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('❌ Fehler im Nightshift-Integrity-Check:', e)
  process.exit(1)
})

