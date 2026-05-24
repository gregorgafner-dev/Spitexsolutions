import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSession } from '@/lib/get-session'
import ShiftRequestsView from '@/components/pool/admin/ShiftRequestsView'

export const dynamic = 'force-dynamic'

export default async function SzsAdminPoolShiftRequestsPage() {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    redirect('/szs-admin/login')
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-5">
        <div>
          <Link
            href="/szs-admin/pool"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Zurück zum Pool-Übersicht
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-gray-900">Dienstanfragen</h1>
          <p className="text-gray-600 mt-1">
            Erstelle Anfragen an alle aktiven Pool-Mitarbeitenden – die schnellste
            Person erhält den Dienst (FCFS).
          </p>
        </div>

        <ShiftRequestsView />
      </div>
    </div>
  )
}
