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

    // Lösche automatisch gelesene Nachrichten, die vor mehr als 4 Tagen gelesen wurden
    const fourDaysAgo = subDays(new Date(), 4)
    await prisma.message.deleteMany({
      where: {
        read: true,
        readAt: {
          not: null,
          lt: fourDaysAgo,
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

    // Setze readAt, wenn die Nachricht als gelesen markiert wird
    const updateData: { read: boolean; readAt?: Date | null } = { read }
    if (read && !updateData.readAt) {
      updateData.readAt = new Date()
    } else if (!read) {
      updateData.readAt = null
    }

    const updatedMessage = await prisma.message.update({
      where: { id: messageId },
      data: updateData,
    })

    // Lösche automatisch gelesene Nachrichten, die vor mehr als 4 Tagen gelesen wurden
    const fourDaysAgo = subDays(new Date(), 4)
    await prisma.message.deleteMany({
      where: {
        read: true,
        readAt: {
          not: null,
          lt: fourDaysAgo,
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

