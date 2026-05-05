import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SzsAdminIndex() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN_SZS') {
    redirect('/szs-admin/login')
  }

  redirect('/szs-admin/dashboard')
}
