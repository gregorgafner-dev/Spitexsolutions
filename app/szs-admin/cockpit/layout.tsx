import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'

export const dynamic = 'force-dynamic'

export default async function SzsCockpitLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session || session.user.role !== 'ADMIN_SZS') {
    redirect('/szs-admin/login')
  }
  return <>{children}</>
}
