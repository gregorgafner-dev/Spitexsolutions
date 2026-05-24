import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getPoolSession } from '@/lib/pool/auth'
import MembersAdminClient from '@/components/pool/admin/MembersAdminClient'

export const dynamic = 'force-dynamic'

export default async function PoolPlannerMembersPage() {
  const session = await getPoolSession()
  if (!session) redirect('/pool/login')
  if (session.role !== 'PLANNER') redirect('/pool/dashboard')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-5">
      <div>
        <Link
          href="/pool/planung"
          className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Zurück zur Planung
        </Link>
        <h1 className="mt-1 text-3xl font-bold text-gray-900">Mitarbeitende</h1>
        <p className="text-gray-600 mt-1">
          Pool-Mitarbeitende und Planung erfassen, bearbeiten, aktivieren/deaktivieren.
        </p>
      </div>

      <MembersAdminClient />
    </div>
  )
}
