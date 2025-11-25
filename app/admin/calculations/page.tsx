'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Calculator, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'

interface Employee {
  id: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

interface CalculationResult {
  employeeId: string
  employeeName: string
  employmentType: string // MONTHLY_SALARY oder HOURLY_WAGE
  hours: number
  surchargeHours: number
  sleepHours: number
  sleepInterruptionHours: number
  totalHours: number
}

export default function CalculationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [results, setResults] = useState<CalculationResult[]>([])
  const [error, setError] = useState<string | null>(null)

  // Lade Mitarbeiter beim Mount
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch('/api/admin/employees')
        if (!response.ok) throw new Error('Fehler beim Laden der Mitarbeiter')
        const data = await response.json()
        setEmployees(data)
        // Alle Mitarbeiter standardmäßig auswählen
        setSelectedEmployees(new Set(data.map((emp: Employee) => emp.id)))
      } catch (error) {
        console.error('Fehler beim Laden der Mitarbeiter:', error)
        setError('Fehler beim Laden der Mitarbeiter')
      } finally {
        setLoadingEmployees(false)
      }
    }
    fetchEmployees()
  }, [])

  // Setze Standard-Datum (aktueller Monat)
  useEffect(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    setStartDate(format(firstDay, 'yyyy-MM-dd'))
    setEndDate(format(lastDay, 'yyyy-MM-dd'))
  }, [])

  const toggleEmployee = (employeeId: string) => {
    const newSelected = new Set(selectedEmployees)
    if (newSelected.has(employeeId)) {
      newSelected.delete(employeeId)
    } else {
      newSelected.add(employeeId)
    }
    setSelectedEmployees(newSelected)
  }

  const selectAll = () => {
    setSelectedEmployees(new Set(employees.map(emp => emp.id)))
  }

  const deselectAll = () => {
    setSelectedEmployees(new Set())
  }

  const handleCalculate = async () => {
    if (selectedEmployees.size === 0) {
      setError('Bitte wählen Sie mindestens einen Mitarbeiter aus')
      return
    }

    if (!startDate || !endDate) {
      setError('Bitte wählen Sie einen Datumsbereich aus')
      return
    }

    if (new Date(startDate) > new Date(endDate)) {
      setError('Das Startdatum muss vor dem Enddatum liegen')
      return
    }

    setLoading(true)
    setError(null)
    setResults([])

    try {
      const response = await fetch('/api/admin/calculations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          employeeIds: Array.from(selectedEmployees),
          startDate,
          endDate,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Fehler bei der Berechnung')
      }

      setResults(data.results || [])
    } catch (error) {
      console.error('Fehler bei der Berechnung:', error)
      setError(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten')
    } finally {
      setLoading(false)
    }
  }

  const totalHours = results.reduce((sum, r) => sum + r.totalHours, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/admin/dashboard">
            <Button variant="outline" className="mb-4">
              ← Zurück zum Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Berechnung ziehen
          </h1>
          <p className="text-gray-600">
            Arbeitsstunden für einen beliebigen Zeitraum berechnen
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Eingabebereich */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calculator className="mr-2 h-5 w-5" />
                  Zeitraum
                </CardTitle>
                <CardDescription>
                  Wählen Sie den Datumsbereich für die Berechnung
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="startDate">Von</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="endDate">Bis</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Mitarbeiter</CardTitle>
                    <CardDescription>
                      Wählen Sie die Mitarbeiter aus ({selectedEmployees.size} von {employees.length} ausgewählt)
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={selectAll}
                    >
                      Alle
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={deselectAll}
                    >
                      Keine
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingEmployees ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {employees.map((employee) => (
                      <div
                        key={employee.id}
                        className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                        onClick={() => toggleEmployee(employee.id)}
                      >
                        <Checkbox
                          checked={selectedEmployees.has(employee.id)}
                          onCheckedChange={() => toggleEmployee(employee.id)}
                        />
                        <Label className="cursor-pointer flex-1">
                          {employee.user.lastName}, {employee.user.firstName}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={handleCalculate}
              disabled={loading || selectedEmployees.size === 0 || !startDate || !endDate}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Berechne...
                </>
              ) : (
                <>
                  <Calculator className="mr-2 h-4 w-4" />
                  Berechnung ziehen
                </>
              )}
            </Button>
          </div>

          {/* Ergebnisbereich */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Ergebnis</CardTitle>
                <CardDescription>
                  {results.length > 0 && `Gesamt: ${totalHours.toFixed(2)} Stunden`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {results.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    Wählen Sie einen Zeitraum und Mitarbeiter aus, dann klicken Sie auf "Berechnung ziehen"
                  </p>
                ) : (
                  <div className="space-y-3">
                    {results.map((result) => (
                      <div
                        key={result.employeeId}
                        className="p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="font-medium text-sm">
                          {result.employeeName}
                          {result.employmentType === 'HOURLY_WAGE' && (
                            <span className="ml-2 text-xs text-blue-600">(Stundenlohn)</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1 space-y-0.5">
                          <div>Arbeitsstunden: {result.hours.toFixed(2)}h</div>
                          {result.surchargeHours > 0 && (
                            <div className="font-medium text-orange-600">
                              Zeitzuschlag (Sonn-/Feiertage): {result.surchargeHours.toFixed(2)}h
                            </div>
                          )}
                          {result.sleepHours > 0 && (
                            <div className="text-blue-600">Schlafstunden: {result.sleepHours.toFixed(2)}h</div>
                          )}
                          {result.sleepInterruptionHours > 0 && (
                            <div className="text-orange-600">Schlafunterbrechungen: {result.sleepInterruptionHours.toFixed(2)}h</div>
                          )}
                          <div className="font-semibold text-gray-900 mt-1 pt-1 border-t border-gray-200">
                            Total Arbeitszeit: {result.totalHours.toFixed(2)}h
                          </div>
                          {result.employmentType === 'HOURLY_WAGE' && result.surchargeHours > 0 && (
                            <div className="mt-2 pt-2 border-t border-orange-200 bg-orange-50 p-2 rounded">
                              <div className="text-xs font-semibold text-orange-800">
                                Für Stundenlohnangestellte:
                              </div>
                              <div className="text-xs text-orange-700 mt-1">
                                Normale Stunden: {result.hours.toFixed(2)}h
                              </div>
                              <div className="text-xs text-orange-700">
                                Zuschlag Stunden: {result.surchargeHours.toFixed(2)}h
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {results.length > 1 && (
                      <div className="pt-3 border-t mt-3">
                        <div className="font-semibold text-lg">
                          Gesamt: {totalHours.toFixed(2)}h
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

