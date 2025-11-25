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
import { Plus, Edit, Trash2 } from 'lucide-react'

interface Employee {
  id: string
  employmentType: 'MONTHLY_SALARY' | 'HOURLY_WAGE'
  pensum: number // 0-100 (Prozent)
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

export default function EmployeeList({ employees: initialEmployees }: EmployeeListProps) {
  const [employees, setEmployees] = useState(initialEmployees)
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
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      passwordConfirm: '',
      employmentType: 'HOURLY_WAGE',
      pensum: '100',
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

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          password: formData.password || undefined,
          employmentType: formData.employmentType,
          pensum: parseFloat(formData.pensum),
        }),
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

      const updatedEmployee = await response.json()
      
      if (editingEmployee) {
        setEmployees(employees.map(e => e.id === updatedEmployee.id ? updatedEmployee : e))
      } else {
        setEmployees([...employees, updatedEmployee])
      }

      setIsDialogOpen(false)
      resetForm()
      window.location.reload()
    } catch (error) {
      setError('Ein Fehler ist aufgetreten')
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Mitarbeiter wirklich löschen?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/employees/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setEmployees(employees.filter(e => e.id !== id))
      }
    } catch (error) {
      console.error('Fehler beim Löschen:', error)
    }
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Neuer Mitarbeiter
        </Button>
      </div>

      <div className="space-y-2">
        {employees.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Keine Mitarbeiter vorhanden</p>
        ) : (
          employees.map((employee) => (
            <div
              key={employee.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-white"
            >
              <div>
                <h3 className="font-semibold">{employee.user.firstName} {employee.user.lastName}</h3>
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
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(employee.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
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
    </div>
  )
}

