#!/usr/bin/env tsx
/**
 * Korrigiert Altdaten, bei denen das Buchungs-`date` eines normalen WORK-Eintrags
 * zeitzonenbedingt EINEN Tag zu früh gespeichert wurde (date = Starttag - 1).
 *
 * Symptom: Der Eintrag erscheint nicht in der Tagesansicht des korrekten Tages
 * (GET filtert nach `date`), blockiert aber als "identisches Duplikat" das
 * Neu-Erfassen (Duplikat-Prüfung vergleicht exakt start/end, unabhängig vom date).
 *
 * Sicherheitsregeln:
 *  - Nur entryType === 'WORK'.
 *  - Nur wenn der Zürcher Kalendertag von `startTime` GENAU einen Tag NACH dem
 *    Zürcher Kalendertag von `date` liegt.
 *  - Nachtdienst-Zweitblock (Start 06:01 Zürich) wird NICHT angefasst (dort ist
 *    date = Starttag bewusst einen Tag vor startTime).
 *  - SLEEP / SLEEP_INTERRUPTION werden nie angefasst.
 *
 * Aufruf:
 *   tsx scripts/fix-timeentry-date-offset.ts            # Dry-Run (zeigt nur an)
 *   tsx scripts/fix-timeentry-date-offset.ts --apply    # wendet Änderungen an
 */

import { PrismaClient } from '@prisma/client'
import { formatInTimeZone } from 'date-fns-tz'
import { writeFileSync } from 'fs'

const prisma = new PrismaClient()
const TZ = 'Europe/Zurich'
const APPLY = process.argv.includes('--apply')

function zurichDay(d: Date): string {
  return formatInTimeZone(d, TZ, 'yyyy-MM-dd')
}
function zurichHHMM(d: Date): string {
  return formatInTimeZone(d, TZ, 'HH:mm')
}
function dayDiff(aYmd: string, bYmd: string): number {
  const a = new Date(aYmd + 'T00:00:00.000Z').getTime()
  const b = new Date(bYmd + 'T00:00:00.000Z').getTime()
  return Math.round((a - b) / 86400000)
}

async function main() {
  const entries = await prisma.timeEntry.findMany({
    where: { entryType: 'WORK', endTime: { not: null } },
    include: { employee: { include: { user: true } } },
    orderBy: [{ date: 'asc' }],
  })

  const candidates: Array<{
    id: string
    name: string
    oldDate: string
    newDate: string
    start: string
    end: string
    startZ: string
  }> = []

  for (const e of entries) {
    if (!e.startTime) continue
    const zStartDay = zurichDay(e.startTime)
    const zDateDay = zurichDay(e.date)
    if (zStartDay === zDateDay) continue // korrekt

    const diff = dayDiff(zStartDay, zDateDay)
    if (diff !== 1) continue // nur "date = Starttag - 1" behandeln

    const hhmm = zurichHHMM(e.startTime)
    if (hhmm === '06:01') continue // Nachtdienst-Zweitblock: bewusst date = Starttag-1

    candidates.push({
      id: e.id,
      name: `${e.employee?.user?.firstName ?? ''} ${e.employee?.user?.lastName ?? ''}`.trim(),
      oldDate: e.date.toISOString(),
      newDate: new Date(zStartDay + 'T00:00:00.000Z').toISOString(),
      start: e.startTime.toISOString(),
      end: e.endTime ? e.endTime.toISOString() : '',
      startZ: `${zStartDay} ${hhmm}`,
    })
  }

  console.log(`Gefundene Kandidaten: ${candidates.length}`)
  for (const c of candidates) {
    console.log(
      `  ${c.name} | ${c.id} | date ${c.oldDate} -> ${c.newDate} | start(ZH) ${c.startZ}`
    )
  }

  if (candidates.length === 0) {
    console.log('Nichts zu tun.')
    return
  }

  // Backup der Originalwerte
  const backupPath = `backups/timeentry-date-offset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(backupPath, JSON.stringify(candidates, null, 2))
  console.log(`\nBackup der Kandidaten geschrieben: ${backupPath}`)

  if (!APPLY) {
    console.log('\nDRY-RUN: Keine Änderungen vorgenommen. Mit --apply ausführen, um zu korrigieren.')
    return
  }

  let updated = 0
  for (const c of candidates) {
    await prisma.timeEntry.update({
      where: { id: c.id },
      data: { date: new Date(c.newDate) },
    })
    updated++
  }
  console.log(`\n✅ ${updated} Einträge korrigiert.`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
