'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { CheckCircle2, Circle } from 'lucide-react'

interface Message {
  id: string
  employeeId: string
  topic: string
  subject: string
  message: string
  read: boolean
  createdAt: string
  employee: {
    user: {
      firstName: string
      lastName: string
      email: string
    }
  }
}

interface MessageListProps {
  initialMessages: Message[]
}

const topicLabels: Record<string, string> = {
  FERIENANTRAG: 'Ferienantrag',
  FREIWUNSCH: 'Freiwunsch',
  ZEITERFASSUNG: 'Nachträgliche Zeiterfassung',
}

export default function MessageList({ initialMessages }: MessageListProps) {
  const [messages, setMessages] = useState(initialMessages)

  const toggleRead = async (messageId: string, currentRead: boolean) => {
    try {
      const response = await fetch('/api/admin/messages', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId,
          read: !currentRead,
        }),
      })

      if (response.ok) {
        // Nach dem Markieren als gelesen: Lade Nachrichten neu, um gelöschte zu entfernen
        const messagesResponse = await fetch('/api/admin/messages')
        if (messagesResponse.ok) {
          const updatedMessages = await messagesResponse.json()
          setMessages(updatedMessages)
        } else {
          // Fallback: Nur die aktuelle Nachricht aktualisieren
          setMessages(messages.map(msg => 
            msg.id === messageId ? { ...msg, read: !currentRead } : msg
          ))
        }
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren der Nachricht:', error)
    }
  }

  const unreadMessages = messages.filter(m => !m.read)
  const readMessages = messages.filter(m => m.read)

  return (
    <div className="space-y-6">
      {unreadMessages.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Ungelesen ({unreadMessages.length})</h2>
          <div className="space-y-4">
            {unreadMessages.map((message) => (
              <Card key={message.id} className="border-l-4 border-l-orange-500">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium px-2 py-1 bg-orange-100 text-orange-800 rounded">
                          {topicLabels[message.topic] || message.topic}
                        </span>
                        <span className="text-sm text-gray-500">
                          {message.employee.user.firstName} {message.employee.user.lastName}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{message.subject}</CardTitle>
                      <CardDescription>
                        {format(new Date(message.createdAt), 'EEEE, d. MMMM yyyy, HH:mm', { locale: de })}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRead(message.id, message.read)}
                      title="Als gelesen markieren"
                    >
                      <Circle className="h-5 w-5 text-orange-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {readMessages.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Gelesen ({readMessages.length})</h2>
          <div className="space-y-4">
            {readMessages.map((message) => (
              <Card key={message.id} className="opacity-75">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-800 rounded">
                          {topicLabels[message.topic] || message.topic}
                        </span>
                        <span className="text-sm text-gray-500">
                          {message.employee.user.firstName} {message.employee.user.lastName}
                        </span>
                      </div>
                      <CardTitle className="text-lg">{message.subject}</CardTitle>
                      <CardDescription>
                        {format(new Date(message.createdAt), 'EEEE, d. MMMM yyyy, HH:mm', { locale: de })}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRead(message.id, message.read)}
                      title="Als ungelesen markieren"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.message}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {messages.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500">Keine Nachrichten vorhanden</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
