import Link from 'next/link'
import {
  ArrowRight,
  ArrowLeft,
  Users,
  ClipboardList,
  Building2,
  ShieldCheck,
  LogIn,
} from 'lucide-react'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Öffentliches Login-Portal.
 *
 * Übersicht aller Anmeldemasken für die unterschiedlichen Rollen. Während der
 * Test-Phase nützlich, um schnell zwischen Mitarbeiter-, Planer- und Admin-
 * Logins wechseln zu können.
 */
export default function LoginPortalPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-100 to-slate-200">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <header className="mb-10 text-center">
          <div className="mx-auto mb-4 inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 p-4 shadow-lg">
            <LogIn className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            Login-Portal
          </h1>
          <p className="mt-3 text-base text-gray-600">
            Wähle deine Rolle, um zur passenden Anmeldemaske zu gelangen.
          </p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-2">
          {/* Pool-Mitarbeitende */}
          <Link
            href="/pool/login"
            className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 p-7 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-110" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                <Users className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-xl font-bold">Pool-Mitarbeitende</h2>
            </div>
            <p className="relative z-10 text-sm text-emerald-50">
              Verfügbarkeiten eintragen, Anfragen sehen und Dienste übernehmen.
            </p>
            <span className="relative z-10 mt-auto inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-all duration-200 group-hover:bg-white/30">
              Anmelden
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>

          {/* Pool-Planung */}
          <Link
            href="/pool/login"
            className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-7 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-110" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                <ClipboardList className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-xl font-bold">Planung Spitex Zürichsee</h2>
            </div>
            <p className="relative z-10 text-sm text-indigo-50">
              Dienstanfragen erstellen, Verfügbarkeiten einsehen und buchen.
            </p>
            <span className="relative z-10 mt-auto inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-all duration-200 group-hover:bg-white/30">
              Anmelden
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>

          {/* Domus-Mitarbeitende */}
          <Link
            href="/login"
            className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-7 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-110" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-xl font-bold">Domus-Mitarbeitende</h2>
            </div>
            <p className="relative z-10 text-sm text-amber-50">
              Zeiterfassung, Lohnauszüge und persönliche Auswertungen.
            </p>
            <span className="relative z-10 mt-auto inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-all duration-200 group-hover:bg-white/30">
              Anmelden
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>

          {/* SZS-Admin */}
          <Link
            href="/szs-admin/login"
            className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 p-7 text-white shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl"
          >
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/10 blur-2xl transition-transform duration-300 group-hover:scale-110" />
            <div className="relative z-10 flex items-center gap-3">
              <div className="rounded-xl bg-white/15 p-3 backdrop-blur-sm">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              <h2 className="text-xl font-bold">SZS-Administration</h2>
            </div>
            <p className="relative z-10 text-sm text-slate-200">
              Dashboard mit allen Tools für SZS-Administratoren.
            </p>
            <span className="relative z-10 mt-auto inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold backdrop-blur-sm transition-all duration-200 group-hover:bg-white/30">
              Anmelden
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </span>
          </Link>
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-5 text-sm text-gray-600">
          <p className="font-semibold text-gray-900">Hinweis</p>
          <p className="mt-1">
            Pool-Mitarbeitende und Planung verwenden dieselbe Anmeldemaske
            (<code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/pool/login</code>).
            Die Weiterleitung erfolgt automatisch je nach Rolle:
            Mitarbeitende landen auf{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/pool/dashboard</code>,
            Planer/-innen auf{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/pool/planung</code>.
          </p>
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Startseite
          </Link>
        </div>
      </div>
    </div>
  )
}
