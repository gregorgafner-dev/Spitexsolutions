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
    // #region agent log H5
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const keys = Array.from(params.keys()).slice(0, 10)
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:useEffect:mount',message:'login page mounted',data:{path:window.location.pathname,hasQuery:window.location.search.length>0,queryKeys:keys},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H5'})}).catch(()=>{});
    }
    // #endregion
    setLoading(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Login] handleSubmit aufgerufen')
    setError('')
    setLoading(true)

    try {
      // #region agent log H1
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:handleSubmit:entry',message:'employee login submit',data:{hasEmail:!!email,hasPassword:!!password,loadingBefore:false},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      console.log('[Login] Starte Login-Versuch', { hasEmail: !!email, hasPassword: !!password })
      console.log('[Login] Email vorhanden:', !!email)
      console.log('[Login] Password vorhanden:', !!password)
      
      // Timeout nach 10 Sekunden
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login-Timeout: Die Anfrage hat zu lange gedauert')), 10000)
      })

      console.log('[Login] Rufe signIn auf...')
      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:handleSubmit:beforeSignIn',message:'calling next-auth signIn(credentials)',data:{redirect:false,callbackUrl:'/employee/dashboard'},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      
      const signInPromise = signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: '/employee/dashboard',
      })

      const result = await Promise.race([signInPromise, timeoutPromise]) as any

      console.log('[Login] Ergebnis:', result)
      console.log('[Login] Ergebnis-Details:', JSON.stringify(result, null, 2))
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:handleSubmit:afterSignIn',message:'signIn resolved',data:{ok:!!result?.ok,hasError:!!result?.error,status:result?.status??null,url:result?.url??null},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      if (result?.error) {
        console.error('Login-Fehler:', result.error)
        setError(`Ungültige Anmeldedaten: ${result.error}`)
        return
      }

      if (result?.ok) {
        console.log('[Login] Login erfolgreich, leite weiter...')
        // Warte kurz, damit die Session gesetzt wird
        await new Promise(resolve => setTimeout(resolve, 100))
        window.location.href = '/employee/dashboard'
      } else {
        console.log('[Login] Login fehlgeschlagen, kein ok-Status')
        setError('Login fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } catch (error) {
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/login/page.tsx:handleSubmit:catch',message:'login exception',data:{errorType:error instanceof Error ? error.name : typeof error},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      console.error('Login-Exception:', error)
      setError(`Ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    } finally {
      // Stelle sicher, dass loading immer zurückgesetzt wird
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Card className="w-full max-w-lg shadow-2xl border-0">
        <CardHeader>
          <div className="mb-6 flex justify-center">
            <Logo className="mb-4" showTagline={true} />
          </div>
          <CardTitle>Mitarbeiter Login</CardTitle>
          <CardDescription>
            Melden Sie sich mit Ihren Zugangsdaten an
          </CardDescription>
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
            <Button 
              type="submit" 
              className="w-full" 
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

