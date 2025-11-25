'use client'

import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDaysInMonth, addMonths, subMonths, getDay, subDays, startOfWeek } from 'date-fns'
import { de } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react'
import { isHolidayOrSunday } from '@/lib/calculations'
import { isScheduleDateEditable } from '@/lib/schedule-date-validation'

interface Employee {
  id: string
  pensum: number
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

interface Service {
  id: string
  name: string
  description: string | null
  duration: number
  color: string
}

interface ScheduleEntry {
  id: string
  employeeId: string
  serviceId: string
  date: string
  startTime: string
  endTime: string
  service: Service
}

interface MonthlyBalance {
  employeeId: string
  year: number
  month: number
  targetHours: number
  actualHours: number
  plannedHours: number
  balance: number
  previousBalance: number
}

interface SchedulePlannerProps {
  employees: Employee[]
  services: Service[]
}

export default function SchedulePlanner({ employees, services }: SchedulePlannerProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedService, setSelectedService] = useState<string>('')
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([])
  const [monthlyBalances, setMonthlyBalances] = useState<Record<string, MonthlyBalance>>({})
  const [loading, setLoading] = useState(true)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const daysInMonth = getDaysInMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
  
  // Keine leeren Zellen - Tage beginnen direkt
  const emptyCells: Date[] = []

  useEffect(() => {
    loadScheduleData()
  }, [year, month])

  const loadScheduleData = async () => {
    setLoading(true)
    try {
      const [entriesRes, balancesRes] = await Promise.all([
        fetch(`/api/admin/schedule?year=${year}&month=${month}`),
        fetch(`/api/admin/monthly-balances?year=${year}&month=${month}`),
      ])

      if (entriesRes.ok) {
        const entries = await entriesRes.json()
        setScheduleEntries(entries)
      }

      if (balancesRes.ok) {
        const balances = await balancesRes.json()
        const balancesMap: Record<string, MonthlyBalance> = {}
        balances.forEach((b: MonthlyBalance) => {
          balancesMap[b.employeeId] = b
        })
        setMonthlyBalances(balancesMap)
      }
    } catch (error) {
      console.error('Fehler beim Laden:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCellClick = async (employeeId: string, day: Date) => {
    if (!selectedService) {
      alert('Bitte wählen Sie zuerst einen Dienst aus')
      return
    }

    // Prüfe ob das Datum noch bearbeitbar ist
    if (!isScheduleDateEditable(day)) {
      alert('Dieses Datum kann nicht mehr bearbeitet werden. Rückwirkende Bearbeitung ist nur bis zum 5. Tag des Folgemonats möglich.')
      return
    }

    const service = services.find(s => s.id === selectedService)
    if (!service) return

    // Finde Mitarbeiter für Pensum-Berechnung
    const employee = employees.find(e => e.id === employeeId)
    if (!employee) return

    // Berechne Dauer: Bei Ferien (FE) und Krankheit (K) wird die Dauer auf das Pensum angepasst
    let duration = service.duration
    if (service.name === 'FE' || service.name === 'K') {
      // Ferien/Krankheit-Dauer wird auf Pensum angepasst (100% = 504 Min., 50% = 252 Min., etc.)
      duration = Math.round(service.duration * (employee.pensum / 100))
    }

    const startTime = new Date(day)
    startTime.setHours(8, 0, 0, 0) // Standard Startzeit 8:00
    const endTime = new Date(startTime)
    endTime.setMinutes(endTime.getMinutes() + duration)

    try {
      const response = await fetch('/api/admin/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          serviceId: selectedService,
          date: format(day, 'yyyy-MM-dd'),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(errorData.error || 'Fehler beim Erstellen des Eintrags')
        return
      }

      await loadScheduleData()
    } catch (error) {
      console.error('Fehler beim Erstellen:', error)
      alert('Ein Fehler ist aufgetreten')
    }
  }

  const handleDeleteEntry = async (entryId: string) => {
    if (!confirm('Möchten Sie diesen Eintrag wirklich löschen?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/schedule/${entryId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const errorData = await response.json()
        alert(errorData.error || 'Fehler beim Löschen des Eintrags')
        return
      }

      await loadScheduleData()
    } catch (error) {
      console.error('Fehler beim Löschen:', error)
      alert('Ein Fehler ist aufgetreten')
    }
  }

  const getEntriesForCell = (employeeId: string, day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd')
    return scheduleEntries.filter(
      e => e.employeeId === employeeId && format(new Date(e.date), 'yyyy-MM-dd') === dayStr
    )
  }

  const handleGeneratePDF = () => {
    const url = `/api/admin/schedule/pdf?year=${year}&month=${month}`
    window.open(url, '_blank')
  }

  const calculatePlannedHours = (employeeId: string) => {
    return scheduleEntries
      .filter(e => e.employeeId === employeeId)
      .reduce((sum, e) => {
        const start = new Date(e.startTime)
        const end = new Date(e.endTime)
        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60)
        return sum + hours
      }, 0)
  }

  const getBalanceForEmployee = (employeeId: string) => {
    const balance = monthlyBalances[employeeId]
    if (!balance) return null

    const plannedHours = calculatePlannedHours(employeeId)
    const projectedBalance = balance.actualHours + plannedHours - balance.targetHours + balance.previousBalance

    return {
      ...balance,
      plannedHours,
      projectedBalance,
    }
  }

  const isHolidayOrSundayDay = (day: Date) => {
    return isHolidayOrSunday(day, year)
  }

  const previousMonth = () => {
    setCurrentDate(subMonths(currentDate, 1))
  }

  const nextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1))
  }

  if (loading) {
    return <div className="text-center py-8">Lade...</div>
  }

  return (
    <div>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {format(currentDate, 'MMMM yyyy', { locale: de })}
              </CardTitle>
              <CardDescription>
                Klicken Sie auf eine Zelle, um einen Dienst hinzuzufügen
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={previousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleGeneratePDF}
                className="ml-4"
              >
                <FileText className="h-4 w-4 mr-2" />
                PDF drucken
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label className="text-sm font-medium mb-2 block">
              Dienst auswählen:
            </label>
            <Select value={selectedService} onValueChange={setSelectedService}>
              <SelectTrigger className="w-full max-w-xs">
                <SelectValue placeholder="Wählen Sie einen Dienst" />
              </SelectTrigger>
              <SelectContent>
                {services.map((service) => (
                  <SelectItem key={service.id} value={service.id}>
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: service.color }}
                      />
                      <span>
                        {service.name}
                        {service.description && (
                          <span className="text-gray-500 ml-1">{service.description}</span>
                        )}
                        {service.name === 'FW' ? (
                          <span className="text-gray-500 ml-1">(keine Dauer)</span>
                        ) : (
                          <>{' '}({Math.floor(service.duration / 60)}:{String(service.duration % 60).padStart(2, '0')})</>
                        )}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse bg-white rounded-lg shadow text-[10px] table-fixed">
          <colgroup>
            <col style={{ width: '110px' }} />
            {days.map(() => (
              <col key={Math.random()} style={{ width: 'auto' }} />
            ))}
            <col style={{ width: '45px' }} />
            <col style={{ width: '45px' }} />
            <col style={{ width: '45px' }} />
            <col style={{ width: '50px' }} />
            <col style={{ width: '50px' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="border p-1 text-left sticky left-0 bg-white z-10 text-[10px]">
                <div className="font-medium truncate">Mitarbeiter</div>
              </th>
              {days.map((day) => {
                const isHoliday = isHolidayOrSundayDay(day)
                return (
                  <th
                    key={day.toISOString()}
                    className={`border p-0.5 text-center text-[9px] ${
                      isHoliday ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="font-medium text-[8px] leading-tight">
                      {format(day, 'EEE', { locale: de })}
                    </div>
                    <div className="text-[9px] leading-tight">{format(day, 'd', { locale: de })}</div>
                  </th>
                )
              })}
              <th className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                Geplant
              </th>
              <th className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                Soll
              </th>
              <th className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                Saldo geplant
              </th>
              <th className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                Saldo Vormonat
              </th>
              <th className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                Saldo total
              </th>
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => {
              const balance = getBalanceForEmployee(employee.id)
              const plannedHours = calculatePlannedHours(employee.id)

              return (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="border p-1 sticky left-0 bg-white z-10">
                    <div className="font-medium text-[10px] truncate">{employee.user.firstName} {employee.user.lastName}</div>
                    <div className="text-[8px] text-gray-500">
                      {employee.pensum.toFixed(0)}%
                    </div>
                  </td>
                  {days.map((day) => {
                    const entries = getEntriesForCell(employee.id, day)
                    const isHoliday = isHolidayOrSundayDay(day)
                    const isEditable = isScheduleDateEditable(day)
                    return (
                      <td
                        key={day.toISOString()}
                        className={`border p-0.5 ${
                          isEditable ? 'cursor-pointer hover:bg-gray-100' : 'cursor-not-allowed opacity-50'
                        } ${
                          isHoliday ? 'bg-gray-50' : ''
                        }`}
                        onClick={() => isEditable && handleCellClick(employee.id, day)}
                        title={!isEditable ? 'Dieses Datum kann nicht mehr bearbeitet werden' : ''}
                      >
                        <div className="space-y-0.5">
                          {entries.map((entry) => (
                            <div
                              key={entry.id}
                              className="text-[8px] px-0.5 py-0.5 rounded text-white relative group truncate leading-tight"
                              style={{ backgroundColor: entry.service.color }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteEntry(entry.id)
                              }}
                              title={
                                entry.service.description
                                  ? `${entry.service.name} ${entry.service.description}`
                                  : entry.service.name
                              }
                            >
                              {entry.service.name}
                              {entry.service.description && (
                                <span className="ml-0.5 opacity-90">{entry.service.description}</span>
                              )}
                              <span className="opacity-0 group-hover:opacity-100 absolute -top-6 left-0 bg-black text-white text-[8px] px-1 py-0.5 rounded whitespace-nowrap z-20">
                                Löschen
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                  <td className="border p-1 text-center bg-gray-50 font-semibold text-[9px]">
                    {plannedHours.toFixed(1)}h
                  </td>
                  <td className="border p-1 text-center bg-gray-50 text-[9px]">
                    {balance ? balance.targetHours.toFixed(1) : '-'}h
                  </td>
                  <td className={`border p-1 text-center bg-gray-50 font-semibold text-[9px] ${
                    balance && balance.projectedBalance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {balance ? (
                      <>
                        {balance.projectedBalance > 0 ? '+' : ''}
                        {balance.projectedBalance.toFixed(1)}h
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={`border p-1 text-center bg-gray-50 text-[9px] ${
                    balance && balance.previousBalance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {balance ? (
                      <>
                        {balance.previousBalance > 0 ? '+' : ''}
                        {balance.previousBalance.toFixed(1)}h
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className={`border p-1 text-center bg-gray-50 font-semibold text-[9px] ${
                    balance && balance.balance >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {balance ? (
                      <>
                        {balance.balance > 0 ? '+' : ''}
                        {balance.balance.toFixed(1)}h
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

