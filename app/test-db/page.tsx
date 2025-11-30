import { prisma } from '@/lib/db'

export default async function TestDbPage() {
  let error: string | null = null
  let userCount = 0
  let dbConnected = false

  try {
    // Teste Datenbankverbindung
    await prisma.$connect()
    dbConnected = true

    // Teste einfache Query
    userCount = await prisma.user.count()
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unbekannter Fehler'
  } finally {
    await prisma.$disconnect().catch(() => {})
  }

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Datenbank-Test</h1>
        
        <div className="space-y-4">
          <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="font-semibold mb-2">Umgebungsvariablen:</h2>
            <ul className="space-y-1 text-sm">
              <li>
                DATABASE_URL: {process.env.DATABASE_URL ? (
                  <span className="text-green-600">✓ Gesetzt</span>
                ) : (
                  <span className="text-red-600">✗ Nicht gesetzt</span>
                )}
              </li>
              <li>
                NEXTAUTH_SECRET: {process.env.NEXTAUTH_SECRET ? (
                  <span className="text-green-600">✓ Gesetzt</span>
                ) : (
                  <span className="text-red-600">✗ Nicht gesetzt</span>
                )}
              </li>
              <li>
                NEXTAUTH_URL: {process.env.NEXTAUTH_URL ? (
                  <span className="text-green-600">✓ Gesetzt ({process.env.NEXTAUTH_URL})</span>
                ) : (
                  <span className="text-red-600">✗ Nicht gesetzt</span>
                )}
              </li>
            </ul>
          </div>

          <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="font-semibold mb-2">Datenbankverbindung:</h2>
            {dbConnected ? (
              <p className="text-green-600">✓ Verbindung erfolgreich</p>
            ) : (
              <p className="text-red-600">✗ Verbindung fehlgeschlagen</p>
            )}
          </div>

          <div className="p-4 bg-white rounded-lg shadow">
            <h2 className="font-semibold mb-2">User Count:</h2>
            {error ? (
              <p className="text-red-600">✗ Fehler: {error}</p>
            ) : (
              <p className="text-green-600">✓ {userCount} User gefunden</p>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <h3 className="font-semibold text-red-800 mb-2">Fehler-Details:</h3>
              <pre className="text-sm text-red-600 overflow-auto">{error}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

