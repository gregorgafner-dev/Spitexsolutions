import { prisma } from '@/lib/db'

export default async function TestDbPage() {
  let error: string | null = null
  let userCount = 0
  let employeeCount = 0
  let adminCount = 0
  let dbConnected = false
  let employees: any[] = []
  let users: any[] = []

  try {
    // Teste Datenbankverbindung
    await prisma.$connect()
    dbConnected = true

    // Teste einfache Queries
    userCount = await prisma.user.count()
    employeeCount = await prisma.employee.count()
    adminCount = await prisma.admin.count()
    
    // Hole alle User mit Details
    users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        employee: {
          select: {
            id: true,
            pensum: true,
            employmentType: true,
          }
        },
        admin: {
          select: {
            id: true,
          }
        }
      }
    })
    
    // Hole alle Employees
    employees = await prisma.employee.findMany({
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
          }
        }
      }
    })
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
            <h2 className="font-semibold mb-2">Datenbank-Statistiken:</h2>
            {error ? (
              <p className="text-red-600">✗ Fehler: {error}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                <li>✓ {userCount} User gesamt</li>
                <li>✓ {employeeCount} Mitarbeiter</li>
                <li>✓ {adminCount} Administratoren</li>
              </ul>
            )}
          </div>

          {employees.length > 0 && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="font-semibold mb-2">Mitarbeiter-Liste:</h2>
              <ul className="space-y-2 text-sm">
                {employees.map((emp) => (
                  <li key={emp.id} className="border-b pb-2">
                    <div className="font-medium">{emp.user.firstName} {emp.user.lastName}</div>
                    <div className="text-gray-600">{emp.user.email}</div>
                    <div className="text-gray-500">Pensum: {emp.pensum}% | {emp.employmentType === 'MONTHLY_SALARY' ? 'Monatslohn' : 'Stundenlohn'}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {users.length > 0 && (
            <div className="p-4 bg-white rounded-lg shadow">
              <h2 className="font-semibold mb-2">Alle User:</h2>
              <ul className="space-y-2 text-sm">
                {users.map((user) => (
                  <li key={user.id} className="border-b pb-2">
                    <div className="font-medium">{user.firstName} {user.lastName} ({user.role})</div>
                    <div className="text-gray-600">{user.email}</div>
                    {user.employee && (
                      <div className="text-gray-500">Mitarbeiter: Pensum {user.employee.pensum}%</div>
                    )}
                    {user.admin && (
                      <div className="text-gray-500">Administrator</div>
                    )}
                    {!user.employee && !user.admin && (
                      <div className="text-orange-500">⚠️ User ohne Employee/Admin-Eintrag</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

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





