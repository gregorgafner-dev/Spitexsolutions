import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, description, duration, color } = body

    console.log('PUT request received:', { id: params.id, body })

    if (!name || !color) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Bei Freiwunsch (FW) ist duration optional
    const isFreiwunsch = name === 'FW'
    if (!isFreiwunsch && !duration) {
      return NextResponse.json({ error: 'Duration is required for this service' }, { status: 400 })
    }

    const updateData: any = {
      name,
      duration: duration ? parseInt(duration) : 0,
      color,
    }

    // Handle description - set to null if empty or undefined
    if (description && description.trim() !== '') {
      updateData.description = description.trim()
    } else {
      updateData.description = null
    }

    console.log('Updating service with data:', updateData)

    const service = await prisma.service.update({
      where: { id: params.id },
      data: updateData,
    })

    console.log('Service updated successfully:', service)
    return NextResponse.json(service)
  } catch (error) {
    console.error('Error updating service:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', errorMessage)
    console.error('Error stack:', errorStack)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: errorMessage 
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getSession()
    
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await prisma.service.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting service:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


