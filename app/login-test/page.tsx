'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function LoginTestPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage('')
    setLoading(true)
    
    console.log('[LoginTest] Form submitted')
    console.log('[LoginTest] Email:', email)
    console.log('[LoginTest] Password:', password ? '***' : 'empty')

    try {
      console.log('[LoginTest] Calling signIn...')
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      console.log('[LoginTest] Result:', result)

      if (result?.error) {
        setMessage(`Fehler: ${result.error}`)
      } else if (result?.ok) {
        setMessage('Login erfolgreich! Leite weiter...')
        setTimeout(() => {
          window.location.href = '/employee/dashboard'
        }, 1000)
      } else {
        setMessage('Unbekannter Fehler')
      }
    } catch (error) {
      console.error('[LoginTest] Exception:', error)
      setMessage(`Exception: ${error instanceof Error ? error.message : 'Unknown'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '500px', margin: '0 auto' }}>
      <h1>Login Test (Minimal)</h1>
      <p>Diese Seite testet nur die grundlegende Login-Funktion.</p>
      
      <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>Passwort:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px'
            }}
          />
        </div>
        
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: '16px',
            backgroundColor: loading ? '#ccc' : '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Anmelden...' : 'Anmelden'}
        </button>
      </form>

      {message && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: message.includes('Fehler') || message.includes('Exception') ? '#fee' : '#efe',
          border: `1px solid ${message.includes('Fehler') || message.includes('Exception') ? '#fcc' : '#cfc'}`,
          borderRadius: '4px'
        }}>
          {message}
        </div>
      )}

      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
        <h3>Anweisungen:</h3>
        <ol>
          <li>Öffnen Sie die Browser-Konsole (F12 → Console)</li>
          <li>Füllen Sie Email und Passwort aus</li>
          <li>Klicken Sie auf &quot;Anmelden&quot;</li>
          <li>Prüfen Sie die Console-Logs</li>
        </ol>
      </div>
    </div>
  )
}

