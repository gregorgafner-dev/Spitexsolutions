import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const services = await prisma.service.findMany({
      orderBy: {
        name: 'asc',
      },
    })

    return NextResponse.json(services)
  } catch (error) {
    console.error('Error fetching services:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, duration, color } = body

    if (!name || !color) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Bei Freiwunsch (FW) ist duration optional
    const isFreiwunsch = name === 'FW'
    if (!isFreiwunsch && !duration) {
      return NextResponse.json({ error: 'Duration is required for this service' }, { status: 400 })
    }

    const service = await prisma.service.create({
      data: {
        name,
        description: description && description.trim() !== '' ? description.trim() : null,
        duration: duration ? parseInt(duration) : 0,
        color,
      },
    })

    return NextResponse.json(service)
  } catch (error) {
    console.error('Error creating service:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


