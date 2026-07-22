import { EmployeeSidebar } from '@/components/employee/employee-sidebar'
import { getSession } from '@/lib/get-session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import { isEmployeeArchived } from '@/lib/employee-status'

export default async function EmployeeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  
  if (!session || session.user.role !== 'EMPLOYEE') {
    console.log('[EmployeeLayout] redirect -> /login', {
      sessionPresent: !!session,
      role: session?.user?.role ?? null,
    })
    redirect('/login')
  }

  // Archivierte Mitarbeiter (ausgetreten) aussperren, auch bei noch gültiger Session.
  if (session.user.employeeId) {
    const employee = await prisma.employee.findUnique({
      where: { id: session.user.employeeId },
      select: { exitDate: true },
    })
    if (!employee || isEmployeeArchived(employee)) {
      console.log('[EmployeeLayout] redirect -> /login (archiviert/kein Employee)')
      redirect('/login')
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <EmployeeSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
