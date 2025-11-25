'use client'

import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/logo'
import { Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Stelle sicher, dass loading beim Mount zurückgesetzt wird
  useEffect(() => {
    setLoading(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      console.log('[Admin Login] Starte Login-Versuch für:', email)
      
      // Timeout nach 10 Sekunden
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login-Timeout: Die Anfrage hat zu lange gedauert')), 10000)
      })

      const signInPromise = signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      const result = await Promise.race([signInPromise, timeoutPromise]) as any

      console.log('[Admin Login] Ergebnis:', result)

      if (result?.error) {
        console.error('Login-Fehler:', result.error)
        setError(`Ungültige Anmeldedaten: ${result.error}`)
        return
      }

      if (result?.ok) {
        console.log('[Admin Login] Login erfolgreich, leite weiter...')
        // Warte kurz, damit die Session gesetzt wird
        await new Promise(resolve => setTimeout(resolve, 100))
        window.location.href = '/admin/dashboard'
      } else {
        console.log('[Admin Login] Login fehlgeschlagen, kein ok-Status')
        setError('Login fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } catch (error) {
      console.error('Login-Exception:', error)
      setError(`Ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    } finally {
      // Stelle sicher, dass loading immer zurückgesetzt wird
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-6 flex justify-center">
            <Logo className="mb-4" showTagline={true} />
          </div>
          <CardTitle>Admin Login</CardTitle>
          <CardDescription>
            Melden Sie sich als Administrator an
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Passwort</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Anmelden...' : 'Anmelden'}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 underline">
              ← Zurück zur Startseite
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

