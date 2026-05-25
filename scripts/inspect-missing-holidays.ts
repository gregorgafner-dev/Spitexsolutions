/**
 * Einmalig: prüft, ob für die bisher in `getHolidaysForYear` fehlenden
 * Feiertage (Berchtoldstag 2.1., Pfingstmontag, Stephanstag 26.12.) bereits
 * TimeEntries in der Produktions-DB existieren, bei denen surchargeHours = 0
 * gesetzt ist (also vor dem Fix erfasst wurden).
 *
 * Reine Diagnose, schreibt NICHTS in die DB.
 */
import { PrismaClient } from '@prisma/client'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const prisma = new PrismaClient()

function getEasterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function missingHolidaysForYear(year: number) {
  const easter = getEasterDate(year)
  const pentecost = new Date(easter)
  pentecost.setDate(easter.getDate() + 50)
  return [
    { date: new Date(year, 0, 2), name: 'Berchtoldstag' },
    { date: pentecost, name: 'Pfingstmontag' },
    { date: new Date(year, 11, 26), name: 'Stephanstag' },
  ]
}

async function main() {
  const years = [2025, 2026, 2027]
  let totalAffected = 0

  for (const year of years) {
    for (const h of missingHolidaysForYear(year)) {
      const start = new Date(h.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(h.date)
      end.setHours(23, 59, 59, 999)

      const entries = await prisma.timeEntry.findMany({
        where: {
          date: { gte: start, lte: end },
          entryType: { not: 'SLEEP' },
        },
        select: {
          id: true,
          entryType: true,
          startTime: true,
          endTime: true,
          breakMinutes: true,
          sleepInterruptionMinutes: true,
          surchargeHours: true,
          employee: {
            select: {
              employmentType: true,
              user: { select: { firstName: true, lastName: true } },
            },
          },
        },
      })
      if (entries.length === 0) continue

      console.log(`\n== ${h.name} ${format(h.date, 'EEEE, dd.MM.yyyy', { locale: de })} ==`)
      for (const e of entries) {
        const startStr = e.startTime ? format(e.startTime, 'HH:mm') : '-'
        const endStr = e.endTime ? format(e.endTime, 'HH:mm') : '-'
        console.log(
          `  ${e.employee.user.firstName} ${e.employee.user.lastName}`,
          `| ${e.entryType}`,
          `| ${startStr}-${endStr}`,
          `| Pause ${e.breakMinutes}min`,
          `| surcharge=${e.surchargeHours}h`,
          `| ${e.employee.employmentType}`,
          `| id=${e.id}`
        )
        totalAffected++
      }
    }
  }

  console.log(`\nTotal betroffene Einträge: ${totalAffected}`)
  if (totalAffected === 0) {
    console.log('→ Keine Nacharbeit nötig. Der Fix wirkt ab sofort für neue Einträge.')
  } else {
    console.log('→ Diese Einträge wurden vor dem Fix erfasst und haben surcharge=0.')
    console.log('  Optionen: (a) händisch in der UI neu speichern (löst Recalc aus)')
    console.log('           (b) ein Backfill-Skript schreiben, das surchargeHours nachträgt')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
