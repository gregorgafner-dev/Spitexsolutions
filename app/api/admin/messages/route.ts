import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import { subDays } from 'date-fns'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Lösche automatisch gelesene Nachrichten, die älter als 2 Tage sind
    const twoDaysAgo = subDays(new Date(), 2)
    await prisma.message.deleteMany({
      where: {
        read: true,
        updatedAt: {
          lt: twoDaysAgo,
        },
      },
    })

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    const where = unreadOnly ? { read: false } : {}

    const messages = await prisma.message.findMany({
      where,
      include: {
        employee: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { messageId, read } = body

    if (!messageId || typeof read !== 'boolean') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: { read },
    })

    // Lösche automatisch gelesene Nachrichten, die älter als 2 Tage sind
    // (wird auch beim Markieren als gelesen ausgeführt)
    const twoDaysAgo = subDays(new Date(), 2)
    await prisma.message.deleteMany({
      where: {
        read: true,
        updatedAt: {
          lt: twoDaysAgo,
        },
      },
    })

    return NextResponse.json(updatedMessage)
  } catch (error) {
    console.error('Error updating message:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

