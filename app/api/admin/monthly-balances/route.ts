import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

function endOfMonthUtc(year: number, month1to12: number) {
  return new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999))
}

function prevMonth(year: number, month1to12: number) {
  if (month1to12 === 1) return { year: year - 1, month: 12 }
  return { year, month: month1to12 - 1 }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const year = parseInt(searchParams.get('year') || '2024')
    const month = parseInt(searchParams.get('month') || '1')

    const balances = await prisma.monthlyBalance.findMany({
      where: {
        year,
        month,
      },
    })

    const employeeIds = balances.map((b) => b.employeeId)
    const monthEnd = endOfMonthUtc(year, month)
    const pm = prevMonth(year, month)
    const prevMonthEnd = endOfMonthUtc(pm.year, pm.month)

    // Adjustments up to end of selected month (we'll split by prevMonthEnd in-memory)
    const adjustments = employeeIds.length
      ? await (prisma as any).hourBalanceAdjustment.findMany({
          where: {
            employeeId: { in: employeeIds },
            effectiveDate: { lte: monthEnd },
          },
          select: { employeeId: true, minutes: true, effectiveDate: true },
        })
      : []

    const adjUpToPrev: Record<string, number> = {}
    const adjUpToMonth: Record<string, number> = {}
    for (const a of adjustments) {
      const m = Number(a.minutes || 0)
      adjUpToMonth[a.employeeId] = (adjUpToMonth[a.employeeId] || 0) + m
      if (a.effectiveDate && a.effectiveDate <= prevMonthEnd) {
        adjUpToPrev[a.employeeId] = (adjUpToPrev[a.employeeId] || 0) + m
      }
    }

    const enriched = balances.map((b) => {
      const upToPrevMin = adjUpToPrev[b.employeeId] || 0
      const upToMonthMin = adjUpToMonth[b.employeeId] || 0
      const adjustedPreviousBalance = b.previousBalance + upToPrevMin / 60
      const adjustedBalance = b.balance + upToMonthMin / 60
      return {
        ...b,
        adjustmentMinutesUpToPrevMonthEnd: upToPrevMin,
        adjustmentMinutesUpToMonthEnd: upToMonthMin,
        adjustedPreviousBalance,
        adjustedBalance,
      }
    })

    // #region agent log
    fetch('http://127.0.0.1:7647/ingest/d02b158b-8692-42bb-9636-87edc733d28f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '42d3e1' },
      body: JSON.stringify({
        sessionId: '42d3e1',
        runId: 'schedule-adjustments',
        hypothesisId: 'S1_schedule_missing_adjustments',
        location: 'app/api/admin/monthly-balances/route.ts:GET',
        message: 'Enriched monthly balances with adjustments',
        data: {
          year,
          month,
          countBalances: balances.length,
          countAdjustments: adjustments.length,
          sample: enriched.slice(0, 5).map((r: any) => ({
            employeeIdSuffix: String(r.employeeId).slice(-6),
            prev: Number(r.previousBalance.toFixed(2)),
            bal: Number(r.balance.toFixed(2)),
            adjPrevMin: r.adjustmentMinutesUpToPrevMonthEnd,
            adjMonthMin: r.adjustmentMinutesUpToMonthEnd,
            adjPrev: Number(r.adjustedPreviousBalance.toFixed(2)),
            adjBal: Number(r.adjustedBalance.toFixed(2)),
          })),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    return NextResponse.json(enriched)
  } catch (error) {
    console.error('Error fetching monthly balances:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}









