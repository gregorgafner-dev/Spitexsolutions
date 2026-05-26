'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sun, Moon, Loader2, CheckCircle2, AlertCircle, Mail, MailOpen, RefreshCw } from 'lucide-react'

import { POOL_TEAMS, type PoolTeamId } from '@/lib/pool/teams'

type Message = {
  id: string
  type: 'SHIFT_REQUEST' | 'INFO' | 'BOOKING_CONFIRMED' | 'BOOKING_CANCELLED'
  subject: string
  content: string
  isRead: boolean
  createdAt: string
  relatedRequest: {
    id: string
    date: string
    shift: 'EARLY' | 'LATE'
    team: PoolTeamId
    teamLabel: string
    status: 'OPEN' | 'FILLED' | 'CANCELLED'
    allowedQualifications: string[]
    allowedQualificationLabels: string[]
    takenByMe: boolean
    bookedByPlanner: boolean
  } | null
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDe(iso: string): string {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function InboxView() {
  const [items, setItems] = useState<Message[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pool/me/messages', { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json()
        setItems(d.items ?? [])
        setUnread(d.unread ?? 0)
      } else {
        setError('Postfach konnte nicht geladen werden.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  async function markRead(id: string) {
    setBusyId(id)
    try {
      await fetch(`/api/pool/me/messages/${id}/read`, { method: 'POST' })
      fetchItems()
    } finally {
      setBusyId(null)
    }
  }

  async function accept(message: Message) {
    if (!message.relatedRequest) return
    setBusyId(message.id)
    setError(null)
    try {
      const res = await fetch(`/api/pool/shift-requests/${message.relatedRequest.id}/accept`, {
        method: 'POST',
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error || 'Übernahme fehlgeschlagen.')
        return
      }
      fetchItems()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-gray-600">
          {unread > 0 ? (
            <span className="font-semibold text-emerald-700">{unread} ungelesen</span>
          ) : (
            'Alle Nachrichten gelesen.'
          )}
          {loading && <Loader2 className="ml-2 inline h-4 w-4 animate-spin text-gray-400" />}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={fetchItems}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Aktualisieren
        </Button>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="space-y-2">
        {items.length === 0 && !loading && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
            Keine Nachrichten im Postfach.
          </div>
        )}
        {items.map((m) => (
          <MessageCard
            key={m.id}
            message={m}
            busy={busyId === m.id}
            onMarkRead={() => markRead(m.id)}
            onAccept={() => accept(m)}
          />
        ))}
      </div>
    </div>
  )
}

function MessageCard({
  message,
  busy,
  onMarkRead,
  onAccept,
}: {
  message: Message
  busy: boolean
  onMarkRead: () => void
  onAccept: () => void
}) {
  const isOpenShiftRequest =
    message.type === 'SHIFT_REQUEST' &&
    message.relatedRequest?.status === 'OPEN' &&
    !message.relatedRequest?.takenByMe

  const wasTakenByMe = message.relatedRequest?.takenByMe === true
  const bookedByPlanner = message.relatedRequest?.bookedByPlanner === true
  const closedByOthers =
    message.type === 'SHIFT_REQUEST' &&
    message.relatedRequest?.status !== 'OPEN' &&
    !wasTakenByMe

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        message.isRead ? 'border-gray-200' : 'border-emerald-300 ring-1 ring-emerald-200'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {message.isRead ? (
            <MailOpen className="h-5 w-5 text-gray-400" />
          ) : (
            <Mail className="h-5 w-5 text-emerald-600" />
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className={`font-semibold ${message.isRead ? 'text-gray-700' : 'text-gray-900'}`}>
              {message.subject}
            </div>
            <div className="text-xs text-gray-500">{formatDateTime(message.createdAt)}</div>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{message.content}</p>

          {message.relatedRequest && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                {formatDe(message.relatedRequest.date)}
              </span>
              {message.relatedRequest.shift === 'EARLY' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <Sun className="h-3.5 w-3.5" /> Frühdienst
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
                  <Moon className="h-3.5 w-3.5" /> Spätdienst
                </span>
              )}
              {(() => {
                const teamDef = POOL_TEAMS[message.relatedRequest.team]
                return (
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${teamDef?.color ?? 'bg-gray-100 text-gray-700'}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${teamDef?.dotColor ?? 'bg-gray-500'}`} />
                    {teamDef?.label ?? message.relatedRequest.teamLabel}
                  </span>
                )
              })()}
              {message.relatedRequest.allowedQualifications.length > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800"
                  title={message.relatedRequest.allowedQualificationLabels.join(', ')}
                >
                  für: {message.relatedRequest.allowedQualifications.join(' / ')}
                </span>
              )}
              {wasTakenByMe && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {bookedByPlanner ? 'durch Planung gebucht' : 'von dir übernommen'}
                </span>
              )}
              {closedByOthers && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  nicht mehr verfügbar
                </span>
              )}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {isOpenShiftRequest && (
              <Button
                size="sm"
                onClick={onAccept}
                disabled={busy}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="mr-1 h-4 w-4" />
                {busy ? 'Übernehme…' : 'Dienst übernehmen'}
              </Button>
            )}
            {!message.isRead && !isOpenShiftRequest && (
              <Button size="sm" variant="outline" onClick={onMarkRead} disabled={busy}>
                <MailOpen className="mr-1 h-3.5 w-3.5" />
                Als gelesen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
