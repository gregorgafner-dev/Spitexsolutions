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
    // #region agent log H5
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const keys = Array.from(params.keys()).slice(0, 10)
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:useEffect:mount',message:'admin login page mounted',data:{path:window.location.pathname,hasQuery:window.location.search.length>0,queryKeys:keys},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H5'})}).catch(()=>{});
    }
    // #endregion
    setLoading(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // #region agent log H1
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:handleSubmit:entry',message:'admin login submit',data:{hasEmail:!!email,hasPassword:!!password},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      console.log('[Admin Login] Starte Login-Versuch', { hasEmail: !!email, hasPassword: !!password })
      
      // Timeout nach 10 Sekunden
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Login-Timeout: Die Anfrage hat zu lange gedauert')), 10000)
      })

      // #region agent log H2
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:handleSubmit:beforeSignIn',message:'calling next-auth signIn(credentials)',data:{redirect:false},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      const signInPromise = signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      const result = await Promise.race([signInPromise, timeoutPromise]) as any

      console.log('[Admin Login] Ergebnis:', result)
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:handleSubmit:afterSignIn',message:'signIn resolved',data:{ok:!!result?.ok,hasError:!!result?.error,status:result?.status??null,url:result?.url??null},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion

      if (result?.error) {
        console.error('Login-Fehler:', result.error)
        setError(`Ungültige Anmeldedaten: ${result.error}`)
        return
      }

      if (result?.ok) {
        console.log('[Admin Login] Login erfolgreich, leite weiter...')
        // Warte kurz und aktualisiere die Session
        await new Promise(resolve => setTimeout(resolve, 300))
        const session = await getSession()
        console.log('[Admin Login] Session nach Login vorhanden:', !!session, 'role:', session?.user?.role)
        // #region agent log H4
        fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:handleSubmit:afterGetSession',message:'getSession after login',data:{sessionPresent:!!session,role:session?.user?.role??null},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H4'})}).catch(()=>{});
        // #endregion
        
        if (session) {
          // Verwende router.push für client-side navigation
          router.push('/admin/dashboard')
          router.refresh() // Aktualisiere die Route
        } else {
          // Fallback: Falls Session nicht gesetzt, verwende window.location
          console.warn('[Admin Login] Session nicht gesetzt, verwende window.location')
          window.location.href = '/admin/dashboard'
        }
      } else {
        console.log('[Admin Login] Login fehlgeschlagen, kein ok-Status')
        setError('Login fehlgeschlagen. Bitte versuchen Sie es erneut.')
      }
    } catch (error) {
      // #region agent log H3
      fetch('http://127.0.0.1:7242/ingest/c4ee99e0-3287-4046-98fb-464abd62c89f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/admin/login/page.tsx:handleSubmit:catch',message:'admin login exception',data:{errorType:error instanceof Error ? error.name : typeof error},timestamp:Date.now(),sessionId:'debug-session',runId:'vercel-debug',hypothesisId:'H3'})}).catch(()=>{});
      // #endregion
      console.error('Login-Exception:', error)
      setError(`Ein Fehler ist aufgetreten: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`)
    } finally {
      // Stelle sicher, dass loading immer zurückgesetzt wird
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 relative overflow-hidden">
      {/* Dekorative Hintergrund-Elemente */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-slate-200/30 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 right-1/2 transform translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-200/20 rounded-full blur-3xl"></div>
      </div>
      
      <Card className="w-full max-w-lg shadow-2xl border-0 relative z-10 backdrop-blur-sm bg-white/95">
        <CardHeader className="space-y-4">
          <div className="mb-6 flex justify-center">
            <Logo className="mb-4" showTagline={true} />
          </div>
          <div className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-slate-700 via-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Admin Login
            </CardTitle>
            <CardDescription className="text-base">
              Melden Sie sich als Administrator an
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
                placeholder="admin@example.com"
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
              className="w-full bg-gradient-to-r from-slate-700 via-blue-600 to-indigo-600 hover:from-slate-800 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200" 
              disabled={loading}
            >
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
