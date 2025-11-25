import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { prisma } from '@/lib/db'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare } from 'lucide-react'
import MessageList from '@/components/admin/message-list'
import { subDays } from 'date-fns'

export default async function MessagesPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
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

  const messages = await prisma.message.findMany({
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

  const unreadCount = messages.filter(m => !m.read).length

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <Link href="/admin/dashboard">
              <Button variant="outline" className="mb-4">
                ← Zurück zum Dashboard
              </Button>
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">
              Nachrichten
            </h1>
            <p className="text-gray-600 mt-1">
              Mitteilungen von Mitarbeitern ({unreadCount} ungelesen)
            </p>
          </div>
        </div>

        <MessageList initialMessages={messages} />
      </div>
    </div>
  )
}

