import { PrismaClient } from '@prisma/client'
import { backupDatabase, cleanupOldBackups } from './backup-database'
import { updateMonthlyBalance } from '../lib/update-monthly-balance'

type Args = {
  dryRun: boolean
  employeeId?: string
  skipBackup: boolean
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: true, skipBackup: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') args.dryRun = false
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--no-backup') args.skipBackup = true
    else if (a === '--employee' && argv[i + 1]) args.employeeId = argv[++i]
  }
  return args
}

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function hhmmLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Bestimmt das erwartete Buchungsdatum (`date`-Feld) für einen Eintrag
 * basierend auf der `startTime` (neues Modell).
 *
 * Regeln:
 *   - "Carry-Over"-Block eines Nachtdienstes (Startzeit lokal HH:01 mit HH < 09,
 *     z.B. 06:01, 05:01, 04:01): expected = startTime.localDay - 1
 *   - Alle anderen Blöcke (Tag-/Abendschicht, inkl. 19:00-Startblock): expected = startTime.localDay
 */
function expectedBookingDate(startTime: Date): Date {
  const h = startTime.getHours()
  const m = startTime.getMinutes()
  const day = startOfDay(startTime)
  if (m === 1 && h < 9) {
    return addDays(day, -1)
  }
  return day
}

async function main() {
  const { dryRun, employeeId, skipBackup } = parseArgs(process.argv)
  const prisma = new PrismaClient()

  console.log(`🧹 TimeEntry-Duplikat-Bereinigung`)
  console.log(`   Modus: ${dryRun ? 'DRY RUN (keine Änderungen)' : 'APPLY (Änderungen werden geschrieben)'}`)
  if (employeeId) console.log(`   Nur Mitarbeiter-ID: ${employeeId}`)

  if (!dryRun && !skipBackup) {
    backupDatabase()
    cleanupOldBackups()
  }

  try {
    const where = employeeId ? { employeeId } : {}

    const entries = await prisma.timeEntry.findMany({
      where: {
        ...where,
        endTime: { not: null },
      },
      orderBy: [{ employeeId: 'asc' }, { startTime: 'asc' }, { createdAt: 'asc' }],
    })

    // Gruppiere nach (employeeId, entryType, startTime, endTime)
    type Entry = (typeof entries)[number]
    const groups = new Map<string, Entry[]>()
    for (const e of entries) {
      const key = `${e.employeeId}|${e.entryType}|${e.startTime.toISOString()}|${e.endTime!.toISOString()}`
      const arr = groups.get(key) ?? []
      arr.push(e)
      groups.set(key, arr)
    }

    const duplicateGroups = [...groups.entries()].filter(([_, arr]) => arr.length > 1)

    if (duplicateGroups.length === 0) {
      console.log(`\n✅ Keine Duplikate gefunden.`)
      return
    }

    console.log(`\n📋 Gefundene Duplikat-Gruppen: ${duplicateGroups.length}\n`)

    // Lade Mitarbeiter-Namen für lesbare Ausgabe
    const empIds = new Set(duplicateGroups.flatMap(([_, arr]) => arr.map((e) => e.employeeId)))
    const employees = await prisma.employee.findMany({
      where: { id: { in: [...empIds] } },
      include: { user: true },
    })
    const employeesById = new Map<string, { lastName: string; firstName: string }>()
    for (const e of employees) {
      employeesById.set(e.id, { lastName: e.user.lastName, firstName: e.user.firstName })
    }

    type Plan = {
      group: Entry[]
      keep: Entry
      remove: Entry[]
      conflict: boolean
      expectedDate: Date
    }

    const plans: Plan[] = []
    const monthsToRecalc = new Set<string>()

    for (const [_, arr] of duplicateGroups) {
      const first = arr[0]
      const expected = expectedBookingDate(first.startTime)
      const expectedKey = ymdLocal(expected)

      const correct = arr.filter((e) => ymdLocal(startOfDay(e.date)) === expectedKey)

      let keep: Entry
      let remove: Entry[]
      let conflict = false

      if (correct.length === 0) {
        // KEINER der Einträge hat das erwartete Buchungsdatum → markiere als Konflikt.
        // Default: behalte den ältesten (createdAt) — Admin muss manuell prüfen.
        keep = arr.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
        remove = arr.filter((e) => e.id !== keep.id)
        conflict = true
      } else if (correct.length === 1) {
        keep = correct[0]
        remove = arr.filter((e) => e.id !== keep.id)
      } else {
        // Mehrere mit korrektem `date`: behalte den ältesten, lösche die jüngeren
        keep = correct.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
        remove = arr.filter((e) => e.id !== keep.id)
      }

      plans.push({ group: arr, keep, remove, conflict, expectedDate: expected })

      // Sammle betroffene Monate (vor und nach der Bereinigung)
      for (const e of arr) {
        monthsToRecalc.add(`${e.employeeId}|${monthKey(startOfDay(e.date))}`)
      }
    }

    // Ausgabe Plan
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i]
      const first = p.group[0]
      const emp = employeesById.get(first.employeeId)
      const empName = emp ? `${emp.lastName}, ${emp.firstName}` : first.employeeId

      console.log(`─── ${i + 1}/${plans.length} ─ ${empName} ───`)
      console.log(
        `   [${first.entryType}] ${ymdLocal(first.startTime)} ${hhmmLocal(first.startTime)} – ${ymdLocal(first.endTime!)} ${hhmmLocal(first.endTime!)}`
      )
      console.log(`   Erwartetes Buchungsdatum (date): ${ymdLocal(p.expectedDate)}`)
      if (p.conflict) {
        console.log(`   ⚠️  KEIN Eintrag hat das erwartete Buchungsdatum → behalte ältesten (BITTE MANUELL PRÜFEN!)`)
      }
      for (const e of p.group) {
        const tag = e.id === p.keep.id ? '✓ KEEP  ' : '✗ DELETE'
        console.log(
          `     ${tag}  id=${e.id}  date=${ymdLocal(startOfDay(e.date))}  createdAt=${e.createdAt.toISOString()}`
        )
      }
      console.log()
    }

    const totalDeletes = plans.reduce((s, p) => s + p.remove.length, 0)
    const conflicts = plans.filter((p) => p.conflict).length
    console.log(`Zusammenfassung:`)
    console.log(`   Duplikat-Gruppen:        ${plans.length}`)
    console.log(`   Zu löschende Einträge:   ${totalDeletes}`)
    console.log(`   Konfliktfälle (manuell): ${conflicts}`)
    console.log(`   Betroffene Monatssalden: ${monthsToRecalc.size}`)

    if (dryRun) {
      console.log(`\n✅ DRY RUN beendet. Keine Änderungen geschrieben.`)
      console.log(`   Zum Anwenden:    npx tsx scripts/dedupe-time-entries.ts --apply`)
      console.log(`   Einzelner MA:    npx tsx scripts/dedupe-time-entries.ts --employee <id> --dry-run`)
      return
    }

    if (conflicts > 0) {
      console.log(`\n⚠️  ${conflicts} Konfliktfälle vorhanden. Skript bricht ab.`)
      console.log(`   Bitte die Konfliktfälle manuell prüfen, oder einzelne Mitarbeiter mit --employee bereinigen.`)
      process.exitCode = 2
      return
    }

    // APPLY
    console.log(`\n🗑️  Lösche ${totalDeletes} Duplikat-Einträge ...`)
    const idsToDelete = plans.flatMap((p) => p.remove.map((e) => e.id))

    const deleteResult = await prisma.timeEntry.deleteMany({
      where: { id: { in: idsToDelete } },
    })
    console.log(`✅ ${deleteResult.count} Einträge gelöscht.`)

    // Recalc MonthlyBalance für betroffene Monate
    console.log(`\n🔄 Aktualisiere MonthlyBalance für ${monthsToRecalc.size} Monate ...`)
    for (const key of monthsToRecalc) {
      const [empId, ym] = key.split('|')
      const [yStr, mStr] = ym.split('-')
      const year = parseInt(yStr, 10)
      const month = parseInt(mStr, 10)
      const anyDay = new Date(year, month - 1, 15)
      await updateMonthlyBalance(empId, anyDay)
    }

    console.log(`\n✅ Fertig.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error('❌ Fehler im Dedup-Skript:', e)
  process.exit(1)
})
