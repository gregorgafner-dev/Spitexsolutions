import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { parseSignedHHMMToMinutes, minutesToHoursFloat } from '@/lib/hour-balance-utils'
import { updateMonthlyBalance } from '@/lib/update-monthly-balance'

type InitItem = { employeeId: string; saldo: string }

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { items?: InitItem[] } | null
    const items = body?.items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing items' }, { status: 400 })
    }

    // Startsaldo: Endsaldo November 2025 (= Start per 01.12.2025)
    const year = 2025
    const month = 11
    const now = new Date()

    const results: Array<{
      employeeId: string
      ok: boolean
      error?: string
      minutes?: number
      hours?: number
    }> = []

    for (const it of items) {
      if (!it?.employeeId || typeof it.saldo !== 'string') {
        results.push({ employeeId: it?.employeeId ?? '(missing)', ok: false, error: 'Invalid item' })
        continue
      }

      // Only MONTHLY_SALARY employees should get balances
      const employee = await prisma.employee.findUnique({
        where: { id: it.employeeId },
        select: { id: true, employmentType: true },
      })

      if (!employee) {
        results.push({ employeeId: it.employeeId, ok: false, error: 'Employee not found' })
        continue
      }
      if (employee.employmentType !== 'MONTHLY_SALARY') {
        results.push({ employeeId: it.employeeId, ok: false, error: 'Not MONTHLY_SALARY' })
        continue
      }

      let minutes: number
      try {
        minutes = parseSignedHHMMToMinutes(it.saldo)
      } catch (e) {
        results.push({
          employeeId: it.employeeId,
          ok: false,
          error: e instanceof Error ? e.message : 'Invalid saldo format',
        })
        continue
      }

      const hours = minutesToHoursFloat(minutes)

      // Create/Update November 2025 monthly balance as anchor.
      await prisma.monthlyBalance.upsert({
        where: {
          employeeId_year_month: {
            employeeId: it.employeeId,
            year,
            month,
          },
        },
        update: {
          // Keep target/actual as-is if they exist, but set balance explicitly as anchor.
          balance: hours,
          previousBalance: 0,
        },
        create: {
          employeeId: it.employeeId,
          year,
          month,
          targetHours: 0,
          actualHours: 0,
          surchargeHours: 0,
          plannedHours: 0,
          previousBalance: 0,
          balance: hours,
        },
      })

      // Recalculate balances from Dec 2025 up to current month to propagate the anchor.
      const start = new Date(2025, 11, 1) // Dec 2025
      const cursor = new Date(start)
      const end = new Date(now.getFullYear(), now.getMonth(), 1)

      while (cursor <= end) {
        await updateMonthlyBalance(it.employeeId, cursor)
        cursor.setMonth(cursor.getMonth() + 1)
      }

      results.push({ employeeId: it.employeeId, ok: true, minutes, hours })
    }

    return NextResponse.json({
      ok: results.every((r) => r.ok),
      anchor: { year, month, key: monthKey(new Date(year, month - 1, 1)) },
      results,
    })
  } catch (error) {
    console.error('Error initializing hour balances:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 })
  }
}

