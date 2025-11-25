'use client'

import { useState, useEffect } from 'react'
import { format, differenceInDays, startOfYear, endOfYear } from 'date-fns'
import { de } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Calendar } from 'lucide-react'

interface Vacation {
  id: string
  employeeId: string
  startDate: string
  endDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  notes: string | null
  employee: {
    user: {
      firstName: string
      lastName: string
      email: string
    }
  }
}

interface VacationBalance {
  id: string
  year: number
  totalDays: number
  usedDays: number
  startDate: string | null
}

interface Employee {
  id: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
  vacationBalances: VacationBalance[]
}

interface CarryoverEmployee {
  employee: Employee
  previousBalance: { year: number; totalDays: number; usedDays: number }
  remainingDays: number
}

interface VacationListProps {
  employees: Employee[]
  vacations: Vacation[]
  employeesWithCarryover?: CarryoverEmployee[]
}

const STANDARD_VACATION_DAYS = 25

export default function VacationList({ employees, vacations, employeesWithCarryover = [] }: VacationListProps) {
  const [isBalanceDialogOpen, setIsBalanceDialogOpen] = useState(false)
  const [isCarryoverDialogOpen, setIsCarryoverDialogOpen] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [selectedCarryover, setSelectedCarryover] = useState<{ employeeId: string; remainingDays: number; sourceYear?: number; targetYear?: number } | null>(null)
  const [balanceMode, setBalanceMode] = useState<'full' | 'partial' | null>(null)
  const [startDate, setStartDate] = useState('')
  const [calculatedDays, setCalculatedDays] = useState<number | null>(null)
  const [carryoverDays, setCarryoverDays] = useState<number>(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const currentYear = new Date().getFullYear()

  // Event Listener für Carryover-Dialog
  useEffect(() => {
    const handleCarryoverDialog = (event: CustomEvent) => {
      const { employeeId, remainingDays, sourceYear, targetYear } = event.detail
      const employee = employees.find(e => e.id === employeeId)
      if (employee) {
        setSelectedCarryover({ employeeId, remainingDays, sourceYear, targetYear })
        setCarryoverDays(remainingDays)
        setIsCarryoverDialogOpen(true)
      }
    }

    window.addEventListener('openCarryoverDialog' as any, handleCarryoverDialog)
    return () => {
      window.removeEventListener('openCarryoverDialog' as any, handleCarryoverDialog)
    }
  }, [employees])

  const openBalanceDialog = (employee: Employee, mode: 'full' | 'partial') => {
    setSelectedEmployee(employee)
    setBalanceMode(mode)
    const balance = getEmployeeBalance(employee)
    
    if (balance && balance.startDate) {
      // Bearbeitung: Startdatum vorausfüllen
      setStartDate(format(new Date(balance.startDate), 'yyyy-MM-dd'))
      setCalculatedDays(balance.totalDays)
    } else if (balance) {
      // Bearbeitung: Ganzjährig
      setStartDate('')
      setCalculatedDays(balance.totalDays)
    } else {
      // Neu: Leer
      setStartDate('')
      setCalculatedDays(null)
    }
    setError('')
    setIsBalanceDialogOpen(true)
  }

  const calculatePartialVacationDays = (startDateStr: string): number => {
    const start = new Date(startDateStr)
    const yearStart = startOfYear(start)
    const yearEnd = endOfYear(start)
    
    // Wenn Startdatum vor Jahresbeginn, dann ganzjährig
    if (start < yearStart) {
      return STANDARD_VACATION_DAYS
    }
    
    // Berechne verbleibende Tage im Jahr ab Startdatum
    const remainingDays = differenceInDays(yearEnd, start) + 1 // +1 um Starttag einzubeziehen
    const totalDaysInYear = differenceInDays(yearEnd, yearStart) + 1
    
    // Einfacher Dreisatz: 25 Tage / 365 Tage * verbleibende Tage
    const calculated = (STANDARD_VACATION_DAYS / totalDaysInYear) * remainingDays
    
    return Math.round(calculated * 10) / 10 // Auf 1 Dezimalstelle runden
  }

  const handleStartDateChange = (dateStr: string) => {
    setStartDate(dateStr)
    if (dateStr) {
      const days = calculatePartialVacationDays(dateStr)
      setCalculatedDays(days)
    } else {
      setCalculatedDays(null)
    }
  }

  const handleConfirmBalance = async () => {
    if (!selectedEmployee) return

    setError('')
    setLoading(true)

    try {
      let totalDays = STANDARD_VACATION_DAYS
      let startDateValue: string | null = null

      if (balanceMode === 'partial') {
        if (!startDate) {
          setError('Bitte geben Sie ein Startdatum ein')
          setLoading(false)
          return
        }
        if (!calculatedDays) {
          setError('Berechnung fehlgeschlagen')
          setLoading(false)
          return
        }
        totalDays = calculatedDays
        startDateValue = new Date(startDate).toISOString()
      }

      const response = await fetch('/api/admin/vacation-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          year: currentYear,
          totalDays,
          startDate: startDateValue,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Ein Fehler ist aufgetreten')
        setLoading(false)
        return
      }

      setIsBalanceDialogOpen(false)
      setSelectedEmployee(null)
      setBalanceMode(null)
      setStartDate('')
      setCalculatedDays(null)
      window.location.reload()
    } catch (error) {
      setError('Ein Fehler ist aufgetreten')
      setLoading(false)
    }
  }

  const handleConfirmCarryover = async () => {
    if (!selectedCarryover) return

    setError('')
    setLoading(true)

    try {
      const employee = employees.find(e => e.id === selectedCarryover.employeeId)
      if (!employee) {
        setError('Mitarbeiter nicht gefunden')
        setLoading(false)
        return
      }

      // Bestimme Zieljahr (falls nicht angegeben, verwende aktuelles Jahr)
      const targetYear = selectedCarryover.targetYear || currentYear

      // Hole Saldo für Zieljahr oder erstelle neuen
      const targetBalance = employee.vacationBalances.find(b => b.year === targetYear)
      let newTotalDays = STANDARD_VACATION_DAYS + carryoverDays
      let startDateValue: string | null = null

      // Wenn bereits ein Saldo für das Zieljahr existiert, addiere den Resturlaub
      if (targetBalance) {
        newTotalDays = targetBalance.totalDays + carryoverDays
        startDateValue = targetBalance.startDate
      }

      const response = await fetch('/api/admin/vacation-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedCarryover.employeeId,
          year: targetYear,
          totalDays: newTotalDays,
          startDate: startDateValue,
          carryoverDays: carryoverDays,
          sourceYear: selectedCarryover.sourceYear,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Ein Fehler ist aufgetreten')
        setLoading(false)
        return
      }

      setIsCarryoverDialogOpen(false)
      setSelectedCarryover(null)
      setCarryoverDays(0)
      window.location.reload()
    } catch (error) {
      setError('Ein Fehler ist aufgetreten')
      setLoading(false)
    }
  }

  const getEmployeeBalance = (employee: Employee): VacationBalance | null => {
    // Hole nur den Saldo für das aktuelle Jahr
    return employee.vacationBalances.find(b => b.year === currentYear) || null
  }

  const getRemainingDays = (balance: VacationBalance | null): number => {
    if (!balance) return 0
    return Math.round((balance.totalDays - balance.usedDays) * 10) / 10
  }

  return (
    <div>
      <div className="space-y-2">
        {employees.map((employee) => {
          const balance = getEmployeeBalance(employee)
          const remainingDays = getRemainingDays(balance)

          return (
            <div
              key={employee.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-white"
            >
              <div className="flex-1">
                <h3 className="font-semibold">
                  {employee.user.firstName} {employee.user.lastName}
                </h3>
                {balance ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      Feriensaldo {currentYear}: <span className="font-medium">{balance.totalDays} Tage</span>
                      {balance.startDate && (
                        <span className="text-gray-500 ml-2">
                          (Eintritt: {format(new Date(balance.startDate), 'dd.MM.yyyy', { locale: de })})
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-600">
                      Verbraucht: <span className="font-medium">{balance.usedDays} Tage</span> | 
                      Verbleibend: <span className={`font-medium ${remainingDays < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {remainingDays} Tage
                      </span>
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    Noch kein Feriensaldo für {currentYear} erfasst
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                {!balance && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBalanceDialog(employee, 'full')}
                    >
                      <Calendar className="h-4 w-4 mr-1" />
                      Jahressaldo anzeigen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openBalanceDialog(employee, 'partial')}
                    >
                      Eintritt unterjährig
                    </Button>
                  </>
                )}
                {balance && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const mode = balance.startDate ? 'partial' : 'full'
                      openBalanceDialog(employee, mode)
                    }}
                  >
                    Bearbeiten
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Dialog open={isBalanceDialogOpen} onOpenChange={setIsBalanceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Feriensaldo erfassen
            </DialogTitle>
            <DialogDescription>
              {selectedEmployee && (
                <>Für {selectedEmployee.user.firstName} {selectedEmployee.user.lastName}</>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {balanceMode === 'full' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-900">
                  Jahressaldo: {STANDARD_VACATION_DAYS} Tage
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Standard-Feriensaldo für das gesamte Jahr {currentYear}
                </p>
              </div>
            </div>
          )}

          {balanceMode === 'partial' && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="startDate">Eintrittsdatum</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Geben Sie das exakte Eintrittsdatum ein
                </p>
              </div>

              {calculatedDays !== null && (
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm font-medium text-green-900">
                    Berechneter Feriensaldo: <span className="text-lg">{calculatedDays} Tage</span>
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    Berechnet basierend auf verbleibenden Tagen im Jahr
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBalanceDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleConfirmBalance}
              disabled={loading || (balanceMode === 'partial' && !calculatedDays)}
            >
              {loading ? 'Speichern...' : 'Bestätigen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCarryoverDialogOpen} onOpenChange={setIsCarryoverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Resturlaub übernehmen
            </DialogTitle>
            <DialogDescription>
              {selectedCarryover && (() => {
                const employee = employees.find(e => e.id === selectedCarryover.employeeId)
                return employee ? <>Für {employee.user.firstName} {employee.user.lastName}</> : null
              })()}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <p className="text-sm font-medium text-orange-900">
                {selectedCarryover?.sourceYear && selectedCarryover?.targetYear && selectedCarryover.sourceYear !== selectedCarryover.targetYear
                  ? `Restferien aus ${selectedCarryover.sourceYear}: ${selectedCarryover?.remainingDays} Tage`
                  : `Resturlaub aus Vorjahr: ${selectedCarryover?.remainingDays} Tage`
                }
              </p>
              <p className="text-xs text-orange-700 mt-1">
                {selectedCarryover?.sourceYear && selectedCarryover?.targetYear && selectedCarryover.sourceYear !== selectedCarryover.targetYear
                  ? `Dieser Betrag wird zum Jahressaldo ${selectedCarryover.targetYear} hinzugefügt`
                  : `Dieser Betrag wird zum neuen Jahressaldo hinzugefügt`
                }
              </p>
            </div>

            <div>
              <Label htmlFor="carryoverDays">Tage übernehmen</Label>
              <Input
                id="carryoverDays"
                type="number"
                step="0.5"
                min="0"
                max={selectedCarryover?.remainingDays || 0}
                value={carryoverDays}
                onChange={(e) => setCarryoverDays(parseFloat(e.target.value) || 0)}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Sie können die Anzahl der zu übernehmenden Tage anpassen (max. {selectedCarryover?.remainingDays} Tage)
              </p>
            </div>

            {(() => {
              const employee = selectedCarryover ? employees.find(e => e.id === selectedCarryover.employeeId) : null
              const targetYear = selectedCarryover?.targetYear || currentYear
              const targetBalance = employee ? employee.vacationBalances.find(b => b.year === targetYear) : null
              const newTotal = targetBalance 
                ? targetBalance.totalDays + carryoverDays 
                : STANDARD_VACATION_DAYS + carryoverDays
              
              return (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm font-medium text-green-900">
                    Neuer Gesamtsaldo für {targetYear}: <span className="text-lg">{Math.round(newTotal * 10) / 10} Tage</span>
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    {targetBalance 
                      ? `Aktueller Saldo ${targetYear} (${targetBalance.totalDays} Tage) + Restferien (${carryoverDays} Tage)`
                      : `Standard-Saldo (${STANDARD_VACATION_DAYS} Tage) + Restferien (${carryoverDays} Tage)`
                    }
                    {selectedCarryover?.sourceYear && selectedCarryover.sourceYear !== targetYear && (
                      <span className="block mt-1">
                        Restferien aus {selectedCarryover.sourceYear} werden nach {targetYear} übertragen
                      </span>
                    )}
                  </p>
                </div>
              )
            })()}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCarryoverDialogOpen(false)}
            >
              Abbrechen
            </Button>
            <Button
              onClick={handleConfirmCarryover}
              disabled={loading || !carryoverDays || carryoverDays <= 0}
            >
              {loading ? 'Übernehmen...' : 'Übernehmen'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
