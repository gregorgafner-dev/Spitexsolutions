import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const messages = await prisma.message.findMany({
      where: {
        employeeId: session.user.employeeId,
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

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'EMPLOYEE' || !session.user.employeeId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { topic, message } = body

    if (!topic || !message) {
      return NextResponse.json({ error: 'Thema und Nachricht sind erforderlich' }, { status: 400 })
    }

    if (!['FERIENANTRAG', 'FREIWUNSCH', 'ZEITERFASSUNG'].includes(topic)) {
      return NextResponse.json({ error: 'Ungültiges Thema' }, { status: 400 })
    }

    // Erstelle Betreff basierend auf Thema
    const topicLabels: Record<string, string> = {
      FERIENANTRAG: 'Ferienantrag',
      FREIWUNSCH: 'Freiwunsch',
      ZEITERFASSUNG: 'Nachträgliche Zeiterfassung',
    }
    const subject = topicLabels[topic] || topic

    const newMessage = await prisma.message.create({
      data: {
        employeeId: session.user.employeeId,
        topic,
        subject,
        message: message.trim(),
      },
      include: {
        employee: {
          include: {
            user: true,
          },
        },
      },
    })

    return NextResponse.json(newMessage)
  } catch (error) {
    console.error('Error creating message:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
