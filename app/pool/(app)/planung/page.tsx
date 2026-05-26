import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPoolSession } from '@/lib/pool/auth'
import PoolPlannerCalendar from '@/components/pool/admin/PoolPlannerCalendar'
import { Users, MessageSquare, Calendar, Inbox } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PoolPlannerPage() {
  const session = await getPoolSession()
  if (!session) redirect('/pool/login')
  if (session.role !== 'PLANNER') redirect('/pool/dashboard')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Planung</h1>
          <p className="text-gray-600 mt-1">
            Übersicht über Verfügbarkeiten, offene Anfragen und Buchungen im Pool.
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

      {/* Schnellzugriffe */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <EnabledCard
          icon={Users}
          title="Mitarbeitende"
          description="Pool-Mitarbeitende erfassen, bearbeiten, deaktivieren."
          href="/pool/planung/mitarbeitende"
        />
        <EnabledCard
          icon={Calendar}
          title="Verfügbarkeiten"
          description="Gesamtübersicht aller eingetragenen Verfügbarkeiten mit Filtern und direkter Buchung."
          href="/pool/planung/verfuegbarkeiten"
        />
        <EnabledCard
          icon={MessageSquare}
          title="Dienstanfragen"
          description="Offene Anfragen erstellen und ausgefüllte Anfragen prüfen."
          href="/pool/planung/anfragen"
        />
      </div>

      <PoolPlannerCalendar />
    </div>
  )
}

function EnabledCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: typeof Users
  title: string
  description: string
  href: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-gray-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-center gap-2.5">
        <div className="rounded-lg bg-emerald-600 p-2 shadow-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-gray-600">{description}</p>
      <p className="mt-3 text-xs font-medium text-emerald-700 group-hover:text-emerald-800">
        Öffnen →
      </p>
    </Link>
  )
}
