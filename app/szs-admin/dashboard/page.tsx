import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import { BarChart3, ArrowRight } from 'lucide-react'

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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            href="/szs-admin/cockpit"
            className="group relative flex flex-col items-start justify-between overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 p-8 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-blue-300 cursor-pointer"
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-110"></div>
            <div className="relative z-10 flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                <BarChart3 className="h-7 w-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold">Cockpit Reporting Tool</h2>
            </div>
            <p className="relative z-10 text-base text-blue-50 mb-6">
              Produktivität, Overhead-Verhältnisse, Personalmix, Stellenplan,
              Lohnrechner und mehr.
            </p>
            <span className="relative z-10 inline-flex items-center gap-2 rounded-lg bg-white/20 px-5 py-2.5 text-sm font-semibold backdrop-blur-sm transition-all duration-200 group-hover:bg-white/30">
              Öffnen
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
