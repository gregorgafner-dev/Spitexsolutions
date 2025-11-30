import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'

export default async function EmployeePage() {
  const session = await getSession()
  
  if (!session || session.user.role !== 'EMPLOYEE') {
    redirect('/login')
  }
  
  redirect('/employee/dashboard')
}









