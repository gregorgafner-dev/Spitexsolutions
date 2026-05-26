import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPoolSession } from '@/lib/pool/auth'
import MemberBookingsView from '@/components/pool/member/MemberBookingsView'

export const dynamic = 'force-dynamic'

export default async function PoolMyBookingsPage() {
  const session = await getPoolSession()
  if (!session) redirect('/pool/login')
  if (session.role !== 'MEMBER') redirect('/pool/planung')

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/pool/dashboard"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Meine Dienste</h1>
            <p className="text-sm text-gray-600">
              Übersicht deiner gebuchten Schichten – als Grundlage für die Abrechnung.
            </p>
          </div>
        </div>
      </div>

      <MemberBookingsView />
    </div>
  )
}
