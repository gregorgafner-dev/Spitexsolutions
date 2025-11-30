import { PrismaClient } from '@prisma/client'
import { updateTargetHoursForAllEmployees } from '../lib/update-target-hours'

const prisma = new PrismaClient()

async function main() {
  console.log('Initialisiere Soll-Stunden für alle Mitarbeiter (nächste 5 Jahre)...')
  
  try {
    await updateTargetHoursForAllEmployees()
    console.log('\n✓ Alle Soll-Stunden erfolgreich initialisiert!')
  } catch (error) {
    console.error('Fehler beim Initialisieren:', error)
    process.exit(1)
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








