import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const employees = await prisma.employee.findMany({
    include: {
      user: true,
    },
    orderBy: {
      user: {
        firstName: 'asc',
      },
    },
  })

  console.log('Mitarbeiter in der Datenbank:')
  employees.forEach((emp, index) => {
    console.log(`${index + 1}. ${emp.user.firstName} ${emp.user.lastName} (${emp.user.email})`)
  })
}

main()
  .catch((e) => {
    console.error('❌ Fehler:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

