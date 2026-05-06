import Link from 'next/link'
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link
            href="/szs-admin/cockpit"
            className="block bg-white rounded-lg shadow p-8 hover:shadow-lg transition border border-gray-200"
          >
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Cockpit Reporting Tool</h2>
            <p className="text-gray-600">
              Produktivität, Overhead-Verhältnisse, Personalmix, Stellenplan, Lohnrechner und mehr.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
