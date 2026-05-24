import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPoolSession } from '@/lib/pool/auth'
import MemberCalendarClient from '@/components/pool/member/MemberCalendarClient'
import { Inbox } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PoolMemberDashboardPage() {
  const session = await getPoolSession()
  if (!session) redirect('/pool/login')
  if (session.role !== 'MEMBER') redirect('/pool/planung')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Willkommen, {session.firstName}
          </h1>
          <p className="text-gray-600 mt-1">
            Hier siehst du deinen persönlichen Kalender und kannst deine Verfügbarkeit eintragen.
          </p>
        </div>
        <Link
          href="/pool/postfach"
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          <Inbox className="h-4 w-4" />
          Postfach
        </Link>
      </div>

      <MemberCalendarClient />
    </div>
  )
}
