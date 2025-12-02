'use client'

import { useState, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/logo'
import { Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Stelle sicher, dass loading beim Mount zurückgesetzt wird
  useEffect(() => {
    console.log('[Login] Komponente wurde geladen (Mounted)')
    setLoading(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Login] handleSubmit aufgerufen')
    setError('')
    setLoading(true)

    try {
      console.log('[Login] Starte Login-Versuch für:', email)
      console.log('[Login] Email vorhanden:', !!email)
      console.log('[Login] Password vorhanden:', !!password)
      
      // Timeout nach 10 Sekunden
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login-Timeout: Die Anfrage hat zu lange gedauert')), 10000)
      })

      console.log('[Login] Rufe signIn auf...')
      
      const signInPromise = signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/employee/dashboard',
      })

      const result = await Promise.race([signInPromise, timeoutPromise]) as any

      console.log('[Login] Ergebnis:', result)
      console.log('[Login] Ergebnis-Details:', JSON.stringify(result, null, 2))

      if (result?.error) {
        console.error('Login-Fehler:', result.error)
        setError(`Ungültige Anmeldedaten: ${result.error}`)
        return
      }

      if (result?.ok) {
        console.log('[Login] Login erfolgreich, leite weiter...')
        // Warte kurz und aktualisiere die Session
        await new Promise(resolve => setTimeout(resolve, 300))
        const session = await getSession()
        console.log('[Login] Session nach Login:', session)
        
        if (session) {
          // Verwende router.push für client-side navigation
          router.push('/employee/dashboard')
          router.refresh() // Aktualisiere die Route
        } else {
          // Fallback: Falls Session nicht gesetzt, verwende window.location
          console.warn('[Login] Session nicht gesetzt, verwende window.location')
          window.location.href = '/employee/dashboard'
        }
      } else {
        console.log('[Login] Login fehlgeschlagen, kein ok-Status')
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Dekorative Hintergrund-Elemente */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl"></div>
      </div>
      
      <Card className="w-full max-w-lg shadow-2xl border-0 relative z-10 backdrop-blur-sm bg-white/95">
        <CardHeader className="space-y-4">
          <div className="mb-6 flex justify-center">
            <Logo className="mb-4" showTagline={true} />
          </div>
          <div className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Mitarbeiter Login
            </CardTitle>
            <CardDescription className="text-base">
              Melden Sie sich mit Ihren Zugangsdaten an
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="ihre.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200" 
              disabled={loading}
              onClick={() => console.log('[Login] Button geklickt')}
            >
              {loading ? 'Anmelden...' : 'Anmelden'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

