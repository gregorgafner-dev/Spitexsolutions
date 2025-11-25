import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

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

    return NextResponse.json(balances)
  } catch (error) {
    console.error('Error fetching monthly balances:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}






