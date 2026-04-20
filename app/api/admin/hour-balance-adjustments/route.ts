import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { parseSignedHHMMToMinutes } from '@/lib/hour-balance-utils'

const MIN_EFFECTIVE_DATE = new Date('2026-12-01T00:00:00.000Z')

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employeeId = request.nextUrl.searchParams.get('employeeId')
    const year = request.nextUrl.searchParams.get('year')

    const where: any = {}
    if (employeeId) where.employeeId = employeeId
    if (year) {
      const y = parseInt(year, 10)
      if (Number.isFinite(y)) {
        where.effectiveDate = {
          gte: new Date(y, 0, 1),
          lt: new Date(y + 1, 0, 1),
        }
      }
    }

    const rows = await (prisma as any).hourBalanceAdjustment.findMany({
      where,
      orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        employee: { include: { user: true } },
        createdByUser: true,
      },
    })

    return NextResponse.json(rows)
  } catch (error) {
    console.error('Error fetching hour balance adjustments:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as
      | { employeeId?: string; effectiveDate?: string; amount?: string; reason?: string }
      | null
    const employeeId = body?.employeeId ?? ''
    const effectiveDateRaw = body?.effectiveDate ?? ''
    const amountRaw = body?.amount ?? ''
    const reason = (body?.reason ?? '').trim()

    // #region agent log
    fetch('http://127.0.0.1:7647/ingest/d02b158b-8692-42bb-9636-87edc733d28f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '42d3e1' },
      body: JSON.stringify({
        sessionId: '42d3e1',
        runId: 'pre-fix',
        hypothesisId: 'HB1_input_format_or_db',
        location: 'app/api/admin/hour-balance-adjustments/route.ts:POST',
        message: 'Adjustment POST received (non-PII)',
        data: {
          hasEmployeeId: !!employeeId,
          employeeIdSuffix: employeeId ? employeeId.slice(-6) : null,
          effectiveDateRaw,
          amountRaw,
          amountLen: amountRaw.length,
          amountMatchesHHMM: /^([+-])?\s*(\d+)\s*:\s*([0-5]\d)$/.test(amountRaw.trim()),
          reasonLen: reason.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion

    if (!employeeId || !effectiveDateRaw || !amountRaw || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const effectiveDate = new Date(effectiveDateRaw)
    if (!Number.isFinite(effectiveDate.getTime())) {
      return NextResponse.json({ error: 'Invalid effectiveDate' }, { status: 400 })
    }

    if (effectiveDate < MIN_EFFECTIVE_DATE) {
      return NextResponse.json(
        { error: 'Manuelle Anpassungen sind erst ab Dezember 2026 erlaubt.' },
        { status: 400 }
      )
    }

    const minutes = parseSignedHHMMToMinutes(amountRaw)
    if (minutes === 0) {
      return NextResponse.json({ error: '0:00 ist keine Anpassung' }, { status: 400 })
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { employmentType: true },
    })
    if (!employee) return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    if (employee.employmentType !== 'MONTHLY_SALARY') {
      return NextResponse.json({ error: 'Nur Monatslöhner können Stundensaldo-Anpassungen erhalten.' }, { status: 400 })
    }

    const created = await (prisma as any).hourBalanceAdjustment.create({
      data: {
        employeeId,
        effectiveDate,
        minutes,
        reason,
        createdByUserId: session.user.id,
      },
    })

    return NextResponse.json(created)
  } catch (error) {
    console.error('Error creating hour balance adjustment:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    // #region agent log
    fetch('http://127.0.0.1:7647/ingest/d02b158b-8692-42bb-9636-87edc733d28f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '42d3e1' },
      body: JSON.stringify({
        sessionId: '42d3e1',
        runId: 'pre-fix',
        hypothesisId: 'HB1_input_format_or_db',
        location: 'app/api/admin/hour-balance-adjustments/route.ts:POST:catch',
        message: 'Adjustment POST failed',
        data: {
          errorType: error && typeof error === 'object' ? (error as any).name : typeof error,
          errorMessage,
          prismaCode: error && typeof error === 'object' ? (error as any).code : undefined,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = request.nextUrl.searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    await (prisma as any).hourBalanceAdjustment.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting hour balance adjustment:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: 'Internal server error', details: errorMessage }, { status: 500 })
  }
}

