'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'

export default function DebugPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testLogin = async () => {
    setLoading(true)
    setResult(null)
    
    console.log('[DEBUG] Starte Login-Test...')
    
    try {
      const res = await signIn('credentials', {
        email: 'ss@spitex-domus.ch',
        password: 'Tester11!!!',
        redirect: false,
      })
      
      console.log('[DEBUG] Result:', res)
      setResult(res)
    } catch (error) {
      console.error('[DEBUG] Error:', error)
      setResult({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'monospace' }}>
      <h1>Debug Page</h1>
      <button 
        onClick={testLogin}
        disabled={loading}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#0070f3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          marginBottom: '20px'
        }}
      >
        {loading ? 'Testing...' : 'Test Login'}
      </button>
      
      {result && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f5f5f5',
          borderRadius: '4px',
          marginTop: '20px'
        }}>
          <h2>Result:</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
      
      <div style={{ marginTop: '30px', padding: '20px', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
        <h2>Anweisungen:</h2>
        <ol>
          <li>Öffnen Sie die Browser-Konsole (F12)</li>
          <li>Klicken Sie auf &quot;Test Login&quot;</li>
          <li>Prüfen Sie die Console-Logs</li>
          <li>Prüfen Sie das Result oben</li>
        </ol>
      </div>
    </div>
  )
}





