'use client'

import { useState } from 'react'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Edit, Archive, RotateCcw } from 'lucide-react'

interface Employee {
  id: string
  employmentType: 'MONTHLY_SALARY' | 'HOURLY_WAGE'
  pensum: number // 0-100 (Prozent)
  exitDate?: string | null
  user: {
    id: string
    firstName: string
    lastName: string
    email: string
  }
}

interface EmployeeListProps {
  employees: Employee[]
}

// Archiviert = Austrittsdatum gesetzt UND erreicht (<= heute). Ein zukünftiges
// Austrittsdatum bedeutet: noch aktiv (wird erst am Austrittstag archiviert).
function isArchived(employee: Employee): boolean {
  if (!employee.exitDate) return false
  const exit = new Date(employee.exitDate)
  if (Number.isNaN(exit.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return exit.getTime() <= today.getTime()
}

function formatDate(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-CH')
}

// Heutiges Datum als yyyy-MM-dd (Ortszeit) für das Datums-Eingabefeld.
function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function EmployeeList({ employees: initialEmployees }: EmployeeListProps) {
  const [employees, setEmployees] = useState(initialEmployees)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    passwordConfirm: '',
    employmentType: 'HOURLY_WAGE' as 'MONTHLY_SALARY' | 'HOURLY_WAGE',
    pensum: '100',
    exitDate: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Archivieren-Dialog: erlaubt das Setzen eines (auch zukünftigen) Austrittsdatums.
  const [archivingEmployee, setArchivingEmployee] = useState<Employee | null>(null)
  const [archiveDate, setArchiveDate] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const [archiveLoading, setArchiveLoading] = useState(false)

  const activeEmployees = employees.filter(e => !isArchived(e))
  const archivedEmployees = employees.filter(e => isArchived(e))
  const visibleEmployees = view === 'active' ? activeEmployees : archivedEmployees

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      passwordConfirm: '',
      employmentType: 'HOURLY_WAGE',
      pensum: '100',
      exitDate: '',
    })
    setEditingEmployee(null)
    setError('')
  }

  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee)
    setFormData({
      firstName: employee.user.firstName,
      lastName: employee.user.lastName,
      email: employee.user.email,
      password: '',
      passwordConfirm: '',
      employmentType: employee.employmentType,
      pensum: employee.pensum.toString(),
      exitDate: employee.exitDate ? String(employee.exitDate).slice(0, 10) : '',
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Passwort-Bestätigung prüfen
    if (!editingEmployee && formData.password !== formData.passwordConfirm) {
      setError('Die Passwörter stimmen nicht überein')
      setLoading(false)
      return
    }

    if (!editingEmployee && formData.password.length < 6) {
      setError('Das Passwort muss mindestens 6 Zeichen lang sein')
      setLoading(false)
      return
    }

    try {
      const url = editingEmployee
        ? `/api/admin/employees/${editingEmployee.id}`
        : '/api/admin/employees'
      
      const method = editingEmployee ? 'PUT' : 'POST'

      const payload: Record<string, unknown> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password || undefined,
        employmentType: formData.employmentType,
        pensum: parseFloat(formData.pensum),
      }
      // Austrittsdatum nur beim Bearbeiten übertragen (leer = Austritt zurücknehmen)
      if (editingEmployee) {
        payload.exitDate = formData.exitDate || null
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        const errorMsg = data.details 
          ? `${data.error}: ${data.details}` 
          : data.error || 'Ein Fehler ist aufgetreten'
        setError(errorMsg)
        setLoading(false)
        console.error('API Error:', data)
        return
      }

      setIsDialogOpen(false)
      resetForm()
      window.location.reload()
    } catch (error) {
      setError('Ein Fehler ist aufgetreten')
      setLoading(false)
    }
  }

  const openArchiveDialog = (employee: Employee) => {
    setArchivingEmployee(employee)
    // Vorbelegung: bereits gesetztes Austrittsdatum, sonst heute.
    setArchiveDate(employee.exitDate ? String(employee.exitDate).slice(0, 10) : todayStr())
    setArchiveError('')
  }

  const closeArchiveDialog = () => {
    setArchivingEmployee(null)
    setArchiveDate('')
    setArchiveError('')
    setArchiveLoading(false)
  }

  const submitArchive = async () => {
    if (!archivingEmployee) return
    if (!archiveDate) {
      setArchiveError('Bitte ein Austrittsdatum wählen.')
      return
    }

    setArchiveLoading(true)
    setArchiveError('')
    try {
      const response = await fetch(`/api/admin/employees/${archivingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: archivingEmployee.user.firstName,
          lastName: archivingEmployee.user.lastName,
          email: archivingEmployee.user.email,
          employmentType: archivingEmployee.employmentType,
          pensum: archivingEmployee.pensum,
          exitDate: archiveDate,
        }),
      })
      if (response.ok) {
        window.location.reload()
      } else {
        const data = await response.json().catch(() => ({}))
        setArchiveError(data.error || 'Archivieren fehlgeschlagen')
        setArchiveLoading(false)
      }
    } catch (error) {
      console.error('Fehler beim Archivieren:', error)
      setArchiveError('Archivieren fehlgeschlagen')
      setArchiveLoading(false)
    }
  }

  const handleReactivate = async (employee: Employee) => {
    if (!confirm(`Mitarbeiter "${employee.user.firstName} ${employee.user.lastName}" wieder aktivieren?`)) {
      return
    }
    try {
      const response = await fetch(`/api/admin/employees/${employee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: employee.user.firstName,
          lastName: employee.user.lastName,
          email: employee.user.email,
          employmentType: employee.employmentType,
          pensum: employee.pensum,
          exitDate: null,
        }),
      })
      if (response.ok) {
        window.location.reload()
      } else {
        const data = await response.json().catch(() => ({}))
        alert(data.error || 'Reaktivieren fehlgeschlagen')
      }
    } catch (error) {
      console.error('Fehler beim Reaktivieren:', error)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="inline-flex rounded-lg border bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setView('active')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === 'active' ? 'bg-white shadow font-medium' : 'text-gray-600'
            }`}
          >
            Aktiv ({activeEmployees.length})
          </button>
          <button
            type="button"
            onClick={() => setView('archived')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              view === 'archived' ? 'bg-white shadow font-medium' : 'text-gray-600'
            }`}
          >
            Archiviert ({archivedEmployees.length})
          </button>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Mitarbeiter
        </Button>
      </div>

      <div className="space-y-2">
        {visibleEmployees.length === 0 ? (
          <p className="text-center text-gray-500 py-8">
            {view === 'active' ? 'Keine aktiven Mitarbeiter vorhanden' : 'Keine archivierten Mitarbeiter'}
          </p>
        ) : (
          visibleEmployees.map((employee) => {
            const archived = isArchived(employee)
            const futureExit = !archived && !!employee.exitDate
            return (
              <div
                key={employee.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${
                  archived ? 'bg-gray-50' : 'bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{employee.user.firstName} {employee.user.lastName}</h3>
                    {archived && (
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full">
                        Archiviert seit {formatDate(employee.exitDate)}
                      </span>
                    )}
                    {futureExit && (
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        Austritt per {formatDate(employee.exitDate)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{employee.user.email}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {employee.employmentType === 'MONTHLY_SALARY' ? 'Monatslohn' : 'Stundenlohn'} | 
                    Pensum: {employee.pensum.toFixed(0)}%
                  </p>
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(employee)}
                    title="Bearbeiten"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  {archived ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReactivate(employee)}
                      title="Reaktivieren"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openArchiveDialog(employee)}
                      title="Archivieren (Austritt)"
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingEmployee ? 'Mitarbeiter bearbeiten' : 'Neuer Mitarbeiter'}
            </DialogTitle>
            <DialogDescription>
              {editingEmployee
                ? 'Bearbeiten Sie die Mitarbeiterdaten'
                : 'Erstellen Sie einen neuen Mitarbeiter'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">Vorname</Label>
                <Input
                  id="firstName"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="lastName">Nachname</Label>
                <Input
                  id="lastName"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            {!editingEmployee && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="passwordConfirm">Passwort bestätigen</Label>
                  <Input
                    id="passwordConfirm"
                    type="password"
                    value={formData.passwordConfirm}
                    onChange={(e) => setFormData({ ...formData, passwordConfirm: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label htmlFor="pensum">Pensum (%)</Label>
                <Input
                  id="pensum"
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={formData.pensum}
                  onChange={(e) => setFormData({ ...formData, pensum: e.target.value })}
                  required
                />
              </div>
              
              <div>
                <Label className="mb-2 block">Anstellungstyp</Label>
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="monthlySalary"
                      checked={formData.employmentType === 'MONTHLY_SALARY'}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({
                            ...formData,
                            employmentType: 'MONTHLY_SALARY',
                          })
                        }
                      }}
                    />
                    <Label htmlFor="monthlySalary" className="cursor-pointer">
                      Monatslohn
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="hourlyWage"
                      checked={formData.employmentType === 'HOURLY_WAGE'}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormData({
                            ...formData,
                            employmentType: 'HOURLY_WAGE',
                          })
                        }
                      }}
                    />
                    <Label htmlFor="hourlyWage" className="cursor-pointer">
                      Stundenlohn
                    </Label>
                  </div>
                </div>
              </div>

              {editingEmployee && (
                <div>
                  <Label htmlFor="exitDate">Austrittsdatum</Label>
                  <Input
                    id="exitDate"
                    type="date"
                    value={formData.exitDate}
                    onChange={(e) => setFormData({ ...formData, exitDate: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Ab dem Austrittsdatum wird der Mitarbeiter automatisch archiviert (Login gesperrt,
                    nicht mehr in aktiven Listen). Ein zukünftiges Datum lässt ihn bis dahin aktiv.
                    Feld leeren, um den Austritt zurückzunehmen. Es werden keine Daten gelöscht.
                  </p>
                </div>
              )}
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
                onClick={() => setIsDialogOpen(false)}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Speichern...' : 'Speichern'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archivingEmployee} onOpenChange={(open) => { if (!open) closeArchiveDialog() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mitarbeiter archivieren</DialogTitle>
            <DialogDescription>
              {archivingEmployee && (
                <>
                  Mitarbeiter „{archivingEmployee.user.firstName} {archivingEmployee.user.lastName}“ archivieren.
                  Es werden KEINE Daten gelöscht – alle Einträge bleiben erhalten und jederzeit abrufbar.
                  Die Archivierung kann jederzeit rückgängig gemacht werden.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="archiveDate">Austrittsdatum</Label>
            <Input
              id="archiveDate"
              type="date"
              value={archiveDate}
              onChange={(e) => setArchiveDate(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Ab dem Austrittsdatum wird der Mitarbeiter automatisch archiviert (Login gesperrt,
              nicht mehr in aktiven Listen). Ein Datum in der Zukunft lässt ihn bis dahin aktiv.
            </p>
          </div>

          {archiveError && (
            <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
              {archiveError}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeArchiveDialog} disabled={archiveLoading}>
              Abbrechen
            </Button>
            <Button type="button" onClick={submitArchive} disabled={archiveLoading}>
              {archiveLoading ? 'Archivieren...' : 'Archivieren'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
