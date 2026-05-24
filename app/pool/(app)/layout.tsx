import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPoolSession } from '@/lib/pool/auth'
import { PoolLogoutButton } from '@/components/pool/PoolLogoutButton'
import { Waves } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PoolAppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getPoolSession()
  if (!session) {
    redirect('/pool/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-cyan-50/40">
      <header className="border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/pool" className="flex items-center gap-3">
            <div className="rounded-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-2 shadow-sm">
              <Waves className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900">Spitex Zürichsee Pool</div>
              <div className="text-xs text-gray-500">
                {session.role === 'PLANNER' ? 'Planung' : 'Mitarbeiterbereich'}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-gray-700">
              {session.firstName} {session.lastName}
            </span>
            <PoolLogoutButton />
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  )
}
