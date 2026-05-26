import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/get-session'
import PoolPlannerCalendar from '@/components/pool/admin/PoolPlannerCalendar'
import { ArrowLeft, Users, Calendar, MessageSquare, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SzsAdminPoolPage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN_SZS') {
    redirect('/szs-admin/login')
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Back-Link + Header */}
        <div className="flex flex-col gap-2">
          <Link
            href="/szs-admin/dashboard"
            className="inline-flex w-fit items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" /> Zurück zum SZS Dashboard
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Spitex Zürichsee Pool</h1>
            <p className="text-gray-600 mt-1">
              Dienstplanung und Verfügbarkeits-Pool · Kanton Zürich
            </p>
          </div>
        </div>

        {/* Schnellzugriffe für SZS-Admin */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuickCard
            icon={Users}
            title="Pool-Mitarbeitende"
            description="Erfassen, bearbeiten, aktivieren/deaktivieren. Auch Planer-Konten anlegen."
            href="/szs-admin/pool/mitarbeitende"
          />
          <QuickCard
            icon={Calendar}
            title="Verfügbarkeiten"
            description="Übersicht aller Verfügbarkeiten mit Filtern und direkter Buchung."
            href="/szs-admin/pool/verfuegbarkeiten"
          />
          <QuickCard
            icon={MessageSquare}
            title="Dienstanfragen"
            description="Anfragen an alle Mitarbeitenden erstellen und Status verfolgen."
            href="/szs-admin/pool/anfragen"
          />
        </div>

        {/* Planungs-Kalender: Klick auf Tag öffnet Dialog zum Anlegen von Anfragen */}
        <PoolPlannerCalendar />
      </div>
    </div>
  )
}

function QuickCard({
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
      className="group flex items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-600 p-2.5 shadow-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-gray-400 group-hover:text-emerald-700" />
    </Link>
  )
}
