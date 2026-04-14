import { prisma } from '../lib/db'
import { updateVacationBalanceFromSchedule } from '../lib/update-vacation-balance'

type Target = {
  label: string
  firstName: string
  lastName?: string
  totalDays: number
}

const YEAR = 2026

const TARGETS: Target[] = [
  { label: 'Samantha Schiavo', firstName: 'Samantha', lastName: 'Schiavo', totalDays: 35 },
  { label: 'Almina', firstName: 'Almina', totalDays: 29 },
  { label: 'Adelina', firstName: 'Adelina', totalDays: 33 },
  { label: 'Barbara', firstName: 'Barbara', totalDays: 30 },
  { label: 'Anna Joelle Furrer', firstName: 'Anna Joelle', lastName: 'Furrer', totalDays: 27 },
]

function isApplyMode(argv: string[]) {
  return argv.includes('--apply')
}

function describeDatabaseUrl(url: string | undefined) {
  if (!url) return 'unbekannt (DATABASE_URL nicht gesetzt)'
  if (url.startsWith('file:')) return 'SQLite (file:)'
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) return 'Postgres'
  return 'unbekannt'
}

function formatName(firstName: string, lastName?: string) {
  return `${firstName}${lastName ? ` ${lastName}` : ''}`.trim()
}

async function main() {
  const apply = isApplyMode(process.argv.slice(2))
  console.log(
    `${apply ? 'APPLY' : 'DRY-RUN'}: Setze Start-Feriensaldi ${YEAR} (nur totalDays) und berechne usedDays aus FE neu.`
  )
  console.log(`DB: ${describeDatabaseUrl(process.env.DATABASE_URL)}`)

  const employees = await prisma.employee.findMany({
    include: {
      user: true,
      vacationBalances: {
        where: { year: YEAR },
      },
    },
  })

  const errors: string[] = []

  for (const target of TARGETS) {
    const expectedName = formatName(target.firstName, target.lastName)

    const matches = employees.filter((e) => {
      const fn = e.user.firstName?.trim()
      const ln = e.user.lastName?.trim()

      if (target.lastName) {
        return fn === target.firstName && ln === target.lastName
      }

      // Wenn nur ein Name gegeben ist, matchen wir auf Vorname (primär) oder Nachname (fallback).
      return fn === target.firstName || ln === target.firstName
    })

    if (matches.length === 0) {
      const needle = target.firstName.toLowerCase()
      const suggestions = employees
        .filter((e) => {
          const fn = (e.user.firstName ?? '').toLowerCase()
          const ln = (e.user.lastName ?? '').toLowerCase()
          return fn.includes(needle) || ln.includes(needle)
        })
        .slice(0, 10)
        .map((e) => `${formatName(e.user.firstName, e.user.lastName)} [${e.employmentType}] (id=${e.id})`)

      errors.push(
        `Kein Mitarbeiter gefunden für "${expectedName}".` +
          (suggestions.length > 0 ? ` Vorschläge: ${suggestions.join(', ')}` : '')
      )
      continue
    }

    if (matches.length > 1) {
      const details = matches
        .map((m) => `${m.id} (${formatName(m.user.firstName, m.user.lastName)}; ${m.employmentType})`)
        .join(', ')
      errors.push(`Mehrdeutig für "${expectedName}": ${details}`)
      continue
    }

    const employee = matches[0]
    const current = employee.vacationBalances[0] ?? null
    const currentTotal = current?.totalDays ?? null
    const currentUsed = current?.usedDays ?? null

    console.log(
      `\n- ${formatName(employee.user.firstName, employee.user.lastName)} [${employee.employmentType}] (employeeId=${employee.id})`
    )

    if (employee.employmentType !== 'MONTHLY_SALARY') {
      console.log('  SKIP: Nicht MONTHLY_SALARY (Stundenlöhner sollen nicht geführt werden).')
      continue
    }

    console.log(
      `  Aktuell ${YEAR}: totalDays=${currentTotal ?? '(none)'} usedDays=${currentUsed ?? '(none)'}`
    )
    console.log(`  Neu ${YEAR}: totalDays=${target.totalDays}`)

    if (!apply) continue

    await prisma.vacationBalance.upsert({
      where: {
        employeeId_year: {
          employeeId: employee.id,
          year: YEAR,
        },
      },
      update: {
        totalDays: target.totalDays,
      },
      create: {
        employeeId: employee.id,
        year: YEAR,
        totalDays: target.totalDays,
        usedDays: 0,
      },
    })

    // usedDays aus Dienstplan (FE) neu berechnen, totalDays bleibt erhalten.
    await updateVacationBalanceFromSchedule(employee.id, YEAR)

    const after = await prisma.vacationBalance.findUnique({
      where: {
        employeeId_year: {
          employeeId: employee.id,
          year: YEAR,
        },
      },
    })

    console.log(`  OK: gespeichert. Jetzt ${YEAR}: totalDays=${after?.totalDays} usedDays=${after?.usedDays}`)
  }

  if (errors.length > 0) {
    console.error('\nFEHLER:')
    for (const err of errors) console.error(`- ${err}`)
    process.exitCode = 1
  } else {
    console.log(`\n✓ Fertig. ${apply ? 'Änderungen wurden angewendet.' : 'Dry-Run ohne Änderungen.'}`)
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

