'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, AlertTriangle, Clock, Calendar, X } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { de } from 'date-fns/locale'
import { Badge } from '@/components/ui/badge'

interface PlausibilityIssue {
  id: string
  employeeId: string
  employeeName: string
  date: string
  type: 'TOO_MANY_BLOCKS' | 'TOO_MANY_HOURS' | 'TOO_MUCH_SLEEP_INTERRUPTION' | 'OVERLAPPING_BLOCKS' | 'MISSING_END_TIME' | 'NEGATIVE_WORK_TIME'
  message: string
  details: any
}

export default function PlausibilityChecksPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<PlausibilityIssue[]>([])
  const [loading, setLoading] = useState(true)
  const [resolvedIssues, setResolvedIssues] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadIssues()
  }, [])

  const loadIssues = async () => {
    try {
      const response = await fetch('/api/admin/plausibility-checks')
      if (response.ok) {
        const data = await response.json()
        setIssues(data)
      }
    } catch (error) {
      console.error('Fehler beim Laden der Plausibilisierungen:', error)
    } finally {
      setLoading(false)
    }
  }

  const markAsResolved = (issueId: string) => {
    setResolvedIssues(prev => new Set(prev).add(issueId))
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TOO_MANY_BLOCKS':
        return <Calendar className="h-4 w-4" />
      case 'TOO_MANY_HOURS':
        return <Clock className="h-4 w-4" />
      case 'TOO_MUCH_SLEEP_INTERRUPTION':
        return <AlertTriangle className="h-4 w-4" />
      case 'OVERLAPPING_BLOCKS':
        return <AlertTriangle className="h-4 w-4" />
      case 'MISSING_END_TIME':
        return <AlertTriangle className="h-4 w-4" />
      case 'NEGATIVE_WORK_TIME':
        return <AlertTriangle className="h-4 w-4" />
      default:
        return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'TOO_MANY_BLOCKS':
        return 'Zu viele Blöcke'
      case 'TOO_MANY_HOURS':
        return 'Zu viele Stunden'
      case 'TOO_MUCH_SLEEP_INTERRUPTION':
        return 'Zu viel Schlafunterbrechung'
      case 'OVERLAPPING_BLOCKS':
        return 'Überlappende Blöcke'
      case 'MISSING_END_TIME':
        return 'Fehlende Endzeit'
      case 'NEGATIVE_WORK_TIME':
        return 'Negative Arbeitszeit'
      default:
        return 'Unregelmäßigkeit'
    }
  }

  const activeIssues = issues.filter(issue => !resolvedIssues.has(issue.id))

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Lade Plausibilisierungen...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Plausibilisierungen</h1>
            <p className="text-gray-600 mt-1">Unregelmäßigkeiten in der Zeiterfassung</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/admin/dashboard')}>
            ← Zurück zum Dashboard
          </Button>
        </div>

        {activeIssues.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Check className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">Keine Unregelmäßigkeiten gefunden</p>
              <p className="text-gray-600 mt-2">Alle Zeiteinträge sind plausibel.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {activeIssues.map((issue) => (
              <Card key={issue.id} className={resolvedIssues.has(issue.id) ? 'opacity-50' : ''}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {getTypeIcon(issue.type)}
                        <Badge variant="destructive">{getTypeLabel(issue.type)}</Badge>
                        <span className="text-sm text-gray-500">
                          {format(parseISO(issue.date), 'EEEE, d. MMMM yyyy', { locale: de })}
                        </span>
                      </div>
                      <p className="font-medium text-gray-900 mb-1">{issue.employeeName}</p>
                      <p className="text-sm text-gray-600">{issue.message}</p>
                    </div>
                    {!resolvedIssues.has(issue.id) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => markAsResolved(issue.id)}
                        className="ml-4"
                      >
                        <Check className="h-4 w-4 mr-2" />
                        Als erledigt markieren
                      </Button>
                    )}
                    {resolvedIssues.has(issue.id) && (
                      <div className="ml-4 flex items-center text-green-600">
                        <Check className="h-4 w-4 mr-2" />
                        <span className="text-sm">Erledigt</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

