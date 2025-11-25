import { PrismaClient } from '@prisma/client'
import { updateTargetHoursForAllEmployees } from '../lib/update-target-hours'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Initialisiere WorkTimeConfig für Kanton Zug...')

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2, currentYear + 3, currentYear + 4]

  // Stelle sicher, dass WorkTimeConfig für alle Jahre existiert
  for (const year of years) {
    const workTimeConfig = await prisma.workTimeConfig.upsert({
      where: { year },
      update: {
        weeklyHours: 42.5, // Standard für Kanton Zug, Schweiz
      },
      create: {
        year,
        weeklyHours: 42.5, // Standard für Kanton Zug, Schweiz
      },
    })
    console.log(`✅ WorkTimeConfig für ${year}: ${workTimeConfig.weeklyHours}h/Woche`)
  }

  console.log('')
  console.log('🔄 Aktualisiere Soll-Stunden für alle Mitarbeiter...')
  await updateTargetHoursForAllEmployees()

  console.log('')
  console.log('✨ WorkTimeConfig-Initialisierung abgeschlossen!')
  console.log('')
  console.log('📊 Zusammenfassung:')
  console.log(`   - WorkTimeConfig für ${years.length} Jahre eingerichtet (${years[0]}-${years[years.length - 1]})`)
  console.log('   - Soll-Stunden werden automatisch basierend auf Pensum berechnet')
  console.log('   - Berücksichtigt Feiertage des Kantons Zug')
}

main()
  .catch((e) => {
    console.error('❌ Fehler:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })




