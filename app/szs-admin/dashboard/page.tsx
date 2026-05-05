import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SzsAdminDashboard() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN_SZS') {
    redirect('/szs-admin/login')
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">SZS Dashboard</h1>
          <p className="text-gray-600 mt-2">Willkommen, {session.user.name}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          Inhalte folgen.
        </div>
      </div>
    </div>
  )
}
