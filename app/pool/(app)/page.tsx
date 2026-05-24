import { redirect } from 'next/navigation'
import { getPoolSession } from '@/lib/pool/auth'

export const dynamic = 'force-dynamic'

export default async function PoolIndexPage() {
  const session = await getPoolSession()
  if (!session) {
    redirect('/pool/login')
  }

  if (session.role === 'PLANNER') {
    redirect('/pool/planung')
  }
  redirect('/pool/dashboard')
}
