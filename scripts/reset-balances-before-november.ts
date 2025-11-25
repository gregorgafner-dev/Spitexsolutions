import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Setze alle Stundensaldi vor November 2025 auf 0...')
  console.log('(Dies ist nur für die Testphase - künftig laufen die Salden normal mit)')
  
  // Setze alle Salden vor November 2025 auf 0
  const result = await prisma.monthlyBalance.updateMany({
    where: {
      OR: [
        { year: { lt: 2025 } },
        {
          year: 2025,
          month: { lt: 11 }, // Alle Monate vor November (1-10)
        },
      ],
    },
    data: {
      balance: 0,
      previousBalance: 0,
    },
  })

  console.log(`✓ ${result.count} Monatssalden vor November 2025 wurden auf 0 gesetzt`)

  // Stelle sicher, dass November 2025 mit previousBalance = 0 startet
  const novemberBalances = await prisma.monthlyBalance.findMany({
    where: {
      year: 2025,
      month: 11,
    },
  })

  for (const balance of novemberBalances) {
    await prisma.monthlyBalance.update({
      where: {
        id: balance.id,
      },
      data: {
        previousBalance: 0,
        // Berechne balance neu ohne previousBalance (Start bei 0)
        balance: balance.actualHours + balance.surchargeHours - balance.targetHours,
      },
    })
  }

  console.log(`✓ ${novemberBalances.length} November-2025-Salden wurden aktualisiert (previousBalance = 0)`)
  
  // Stelle sicher, dass Dezember 2025 den November-Saldo als previousBalance hat
  const decemberBalances = await prisma.monthlyBalance.findMany({
    where: {
      year: 2025,
      month: 12,
    },
  })

  for (const decBalance of decemberBalances) {
    const novemberBalance = await prisma.monthlyBalance.findUnique({
      where: {
        employeeId_year_month: {
          employeeId: decBalance.employeeId,
          year: 2025,
          month: 11,
        },
      },
    })

    if (novemberBalance) {
      await prisma.monthlyBalance.update({
        where: {
          id: decBalance.id,
        },
        data: {
          previousBalance: novemberBalance.balance,
          // Berechne balance neu mit November-Saldo
          balance: decBalance.actualHours + decBalance.surchargeHours - decBalance.targetHours + novemberBalance.balance,
        },
      })
    }
  }

  console.log(`✓ ${decemberBalances.length} Dezember-2025-Salden wurden aktualisiert (mit November-Saldo)`)
  console.log('\n✓ Alle Stundensaldi vor November 2025 wurden auf 0 gesetzt!')
  console.log('✓ Ab November 2025 laufen die Salden normal mit.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

