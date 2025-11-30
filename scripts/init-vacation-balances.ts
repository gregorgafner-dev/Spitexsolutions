import { PrismaClient } from '@prisma/client'
import { updateVacationBalanceFromSchedule } from '../lib/update-vacation-balance'

const prisma = new PrismaClient()

async function main() {
  console.log('Initialisiere Feriensalden aus Dienstplan...')

  const employees = await prisma.employee.findMany()
  const currentYear = new Date().getFullYear()
  const yearsToProcess = 5 // Nächste 5 Jahre

  for (const employee of employees) {
    for (let yearOffset = 0; yearOffset < yearsToProcess; yearOffset++) {
      const year = currentYear + yearOffset
      try {
        await updateVacationBalanceFromSchedule(employee.id, year)
        console.log(`✓ ${employee.id} - ${year}`)
      } catch (error) {
        console.error(`Fehler bei ${employee.id} - ${year}:`, error)
      }
    }
  }

  console.log('\n✓ Alle Feriensalden erfolgreich initialisiert!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })








