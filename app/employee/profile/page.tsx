'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    try {
      const response = await fetch('/api/employee/profile')
      if (!response.ok) {
        throw new Error('Fehler beim Laden des Profils')
      }
      const data = await response.json()
      setFormData(prev => ({
        ...prev,
        email: data.email,
      }))
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Fehler beim Laden des Profils')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const response = await fetch('/api/employee/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          newPassword: formData.newPassword || undefined,
          confirmPassword: formData.confirmPassword || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Fehler beim Aktualisieren des Profils')
      }

      setSuccess('Profil erfolgreich aktualisiert!')
      
      // Reset Passwort-Felder
      setFormData(prev => ({
        ...prev,
        newPassword: '',
        confirmPassword: '',
      }))

      // Wenn E-Mail geändert wurde, muss sich der Benutzer neu anmelden
      if (formData.email !== data.email) {
        setTimeout(() => {
          alert('Ihre E-Mail-Adresse wurde geändert. Bitte melden Sie sich mit der neuen E-Mail-Adresse an.')
          router.push('/login')
        }, 2000)
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">Lade Profil...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/employee/dashboard">
            <Button variant="outline" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zurück zum Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Profil bearbeiten</h1>
          <p className="text-gray-600 mt-1">
            Ändern Sie Ihre E-Mail-Adresse oder Ihr Passwort
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Kontoinformationen</CardTitle>
            <CardDescription>
              Aktualisieren Sie Ihre E-Mail-Adresse oder Ihr Passwort
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email">E-Mail-Adresse (Benutzername)</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  placeholder="ihre.email@example.com"
                />
                <p className="text-xs text-gray-500">
                  Ihre E-Mail-Adresse wird als Benutzername verwendet
                </p>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold mb-4">Passwort ändern</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Lassen Sie die Felder leer, wenn Sie Ihr Passwort nicht ändern möchten
                </p>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Neues Passwort</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={formData.newPassword}
                        onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                        className="pr-10"
                        placeholder="Mindestens 6 Zeichen"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-label={showNewPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      >
                        {showNewPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Neues Passwort bestätigen</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                        className="pr-10"
                        placeholder="Passwort wiederholen"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                        aria-label={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="text-sm text-green-600 bg-green-50 p-3 rounded border border-green-200">
                  {success}
                </div>
              )}

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? 'Wird gespeichert...' : 'Änderungen speichern'}
                </Button>
                <Link href="/employee/dashboard" className="flex-1">
                  <Button type="button" variant="outline" className="w-full">
                    Abbrechen
                  </Button>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

