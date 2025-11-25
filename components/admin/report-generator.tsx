'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { AlertCircle, Download, Loader2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface Employee {
  id: string
  user: {
    firstName: string
    lastName: string
    email: string
  }
}

interface AvailableMonth {
  value: string
  label: string
  available: boolean
}

interface ReportGeneratorProps {
  employees: Employee[]
  availableMonths: AvailableMonth[]
}

export default function ReportGenerator({ employees, availableMonths }: ReportGeneratorProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string>('')

  const handleGeneratePDF = async () => {
    if (!selectedEmployee || !selectedMonth) {
      setError('Bitte wählen Sie einen Mitarbeiter und einen Monat aus.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(
        `/api/admin/reports/pdf?employeeId=${selectedEmployee}&month=${selectedMonth}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        setError(errorData.error || 'Fehler beim Generieren des PDFs')
        return
      }

      // Lade PDF herunter
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      
      const employee = employees.find(e => e.id === selectedEmployee)
      const monthLabel = availableMonths.find(m => m.value === selectedMonth)?.label || selectedMonth
      a.download = `Abrechnung_${employee?.user.lastName}_${monthLabel.replace(' ', '_')}.pdf`
      
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error generating PDF:', err)
      setError('Ein Fehler ist aufgetreten beim Generieren des PDFs.')
    } finally {
      setLoading(false)
    }
  }

  // Filtere nur verfügbare Monate
  const availableMonthsFiltered = availableMonths.filter(m => m.available)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="employee">Mitarbeiter</Label>
          <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
            <SelectTrigger id="employee">
              <SelectValue placeholder="Mitarbeiter auswählen" />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.user.firstName} {employee.user.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="month">Abrechnungsmonat</Label>
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger id="month">
              <SelectValue placeholder="Monat auswählen" />
            </SelectTrigger>
            <SelectContent>
              {availableMonthsFiltered.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {availableMonthsFiltered.length === 0 && (
            <p className="text-sm text-gray-500 mt-1">
              Keine Monate verfügbar. PDF-Generierung ist erst ab dem 3. Tag des Folgemonats möglich.
            </p>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleGeneratePDF}
        disabled={!selectedEmployee || !selectedMonth || loading || availableMonthsFiltered.length === 0}
        className="w-full"
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            PDF wird generiert...
          </>
        ) : (
          <>
            <Download className="mr-2 h-4 w-4" />
            PDF generieren und herunterladen
          </>
        )}
      </Button>

      <div className="text-sm text-gray-600 space-y-2">
        <p className="font-semibold">Die Abrechnung enthält:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Gearbeitete Arbeitszeit vom Vormonat</li>
          <li>Zeitzuschläge für Sonn-/Feiertage</li>
          <li>Soll-Stunden und Saldo</li>
          <li>Aktueller Stundensaldo</li>
          <li>Verbleibender Feriensaldo</li>
          <li>Bezogene Ferientage</li>
        </ul>
      </div>
    </div>
  )
}






