'use client'

import { useState, useEffect } from 'react'
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
import { Plus, Edit, Trash2 } from 'lucide-react'

interface Service {
  id: string
  name: string
  description: string | null
  duration: number
  color: string
}

interface ServiceListProps {
  services: Service[]
}

export default function ServiceList({ services: initialServices }: ServiceListProps) {
  const [services, setServices] = useState(initialServices)
  
  // Debug: Log services to check if description is present
  useEffect(() => {
    console.log('Services loaded:', services.map(s => ({ name: s.name, description: s.description })))
  }, [services])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    duration: '',
    color: '#3b82f6',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      duration: '',
      color: '#3b82f6',
    })
    setEditingService(null)
    setError('')
  }

  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (service: Service) => {
    setEditingService(service)
    setFormData({
      name: service.name,
      description: service.description || '',
      duration: service.duration.toString(),
      color: service.color,
    })
    setIsDialogOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const url = editingService
        ? `/api/admin/services/${editingService.id}`
        : '/api/admin/services'
      
      const method = editingService ? 'PUT' : 'POST'

      const requestBody = {
        name: formData.name,
        description: formData.description || null,
        duration: formData.name === 'FW' ? (formData.duration ? parseInt(formData.duration) : 0) : parseInt(formData.duration),
        color: formData.color,
      }
      
      console.log('Sending request:', { url, method, body: requestBody })
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const data = await response.json()
        console.error('API Error:', data)
        setError(data.error || data.details || 'Ein Fehler ist aufgetreten')
        setLoading(false)
        return
      }

      const updatedService = await response.json()
      
      if (editingService) {
        setServices(services.map(s => s.id === updatedService.id ? updatedService : s))
      } else {
        setServices([...services, updatedService])
      }

      setIsDialogOpen(false)
      resetForm()
      window.location.reload()
    } catch (error) {
      console.error('Error submitting form:', error)
      setError(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten')
      setLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Möchten Sie diesen Dienst wirklich löschen?')) {
      return
    }

    try {
      const response = await fetch(`/api/admin/services/${id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        setServices(services.filter(s => s.id !== id))
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
          Neuer Dienst
        </Button>
      </div>

      <div className="space-y-2">
        {services.length === 0 ? (
          <p className="text-center text-gray-500 py-8">Keine Dienste vorhanden</p>
        ) : (
          services.map((service) => (
            <div
              key={service.id}
              className="flex items-center justify-between p-4 border rounded-lg bg-white"
            >
              <div className="flex items-center space-x-4">
                <div
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: service.color }}
                />
                <div>
                  <h3 className="font-semibold">
                    {service.name}
                    {service.description ? (
                      <span className="text-gray-500 font-normal ml-2">{service.description}</span>
                    ) : null}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {service.name === 'FW' ? (
                      'Keine Dauer erforderlich'
                    ) : (
                      <>
                        Dauer: {Math.floor(service.duration / 60)}:{String(service.duration % 60).padStart(2, '0')}
                        {(service.name === 'FE' || service.name === 'K') && ' (bei 100% Pensum, wird auf Pensum angepasst)'}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(service)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(service.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingService ? 'Dienst bearbeiten' : 'Neuer Dienst'}
            </DialogTitle>
            <DialogDescription>
              {editingService
                ? 'Bearbeiten Sie die Dienstdaten'
                : 'Erstellen Sie einen neuen Dienst'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Bezeichnung</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Beschreibung (optional)</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="z.B. Büro, Ferien, Frühdienst"
              />
            </div>

            <div>
              <Label htmlFor="duration">
                Dauer (Minuten)
                {formData.name === 'FW' && <span className="text-gray-500 font-normal ml-1">(optional für Freiwunsch)</span>}
              </Label>
              <Input
                id="duration"
                type="number"
                min="0"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                required={formData.name !== 'FW'}
              />
              {formData.duration && (
                <p className="text-xs text-gray-500 mt-1">
                  Entspricht: {Math.floor(parseInt(formData.duration) / 60)}:{String(parseInt(formData.duration) % 60).padStart(2, '0')}
                </p>
              )}
              {formData.name === 'FW' && !formData.duration && (
                <p className="text-xs text-gray-500 mt-1">
                  Bei Freiwunsch ist keine Dauer erforderlich
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="color">Farbe</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10"
                />
                <Input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  placeholder="#3b82f6"
                />
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


