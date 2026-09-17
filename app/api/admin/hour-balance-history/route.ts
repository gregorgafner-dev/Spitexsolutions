import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import {
  MAX_HISTORY_MONTHS,
  buildHourBalanceHistory,
  parseYearMonth,
  renderHourBalanceHistoryPdf,
  type YearMonth,
} from '@/lib/hour-balance-history'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const employeeId = searchParams.get('employeeId')
    const fromRaw = searchParams.get('from')
    const toRaw = searchParams.get('to')
    const wantsPdf = (searchParams.get('format') || '').toLowerCase() === 'pdf'

    if (!employeeId) {
      return NextResponse.json({ error: 'employeeId erforderlich.' }, { status: 400 })
    }

    let from: YearMonth
    let to: YearMonth
    try {
      from = parseYearMonth(fromRaw, 'Von-Monat')
      to = parseYearMonth(toRaw, 'Bis-Monat')
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Ungültiger Zeitraum.' }, { status: 400 })
    }

    const fromIndex = from.year * 12 + (from.month - 1)
    const toIndex = to.year * 12 + (to.month - 1)
    if (fromIndex > toIndex) {
      return NextResponse.json({ error: 'Der Von-Monat darf nicht nach dem Bis-Monat liegen.' }, { status: 400 })
    }
    if (toIndex - fromIndex + 1 > MAX_HISTORY_MONTHS) {
      return NextResponse.json(
        { error: `Der Zeitraum darf höchstens ${MAX_HISTORY_MONTHS} Monate umfassen.` },
        { status: 400 }
      )
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    })
    if (!employee) {
      return NextResponse.json({ error: 'Mitarbeiter nicht gefunden.' }, { status: 404 })
    }

    const rows = await buildHourBalanceHistory(employeeId, from, to)

    if (wantsPdf) {
      const doc = await renderHourBalanceHistoryPdf({
        employee: {
          firstName: employee.user.firstName,
          lastName: employee.user.lastName,
          email: employee.user.email,
          pensum: employee.pensum,
        },
        from,
        to,
        rows,
      })
      const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
      const response = new NextResponse(pdfBuffer)
      response.headers.set('Content-Type', 'application/pdf')
      response.headers.set(
        'Content-Disposition',
        `attachment; filename="Stundensaldoverlauf_${employee.user.lastName}_${fromRaw}_bis_${toRaw}.pdf"`
      )
      return response
    }

    return NextResponse.json({
      employee: {
        id: employee.id,
        firstName: employee.user.firstName,
        lastName: employee.user.lastName,
        email: employee.user.email,
        pensum: employee.pensum,
        employmentType: employee.employmentType,
      },
      from,
      to,
      rows,
    })
  } catch (error) {
    console.error('[hour-balance-history] error', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
