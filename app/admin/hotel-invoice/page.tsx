import { redirect } from 'next/navigation'
import { getSession } from '@/lib/get-session'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import HotelInvoiceGenerator from '@/components/admin/hotel-invoice-generator'

export default async function HotelInvoicePage() {
  const session = await getSession()

  if (!session || session.user.role !== 'ADMIN') {
    redirect('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Link href="/admin/dashboard">
            <Button variant="outline" className="mb-4">
              ← Zurück zum Dashboard
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Rechnung an Hotel</h1>
          <p className="text-gray-600 mt-1">Generieren Sie die Hotel-Rechnung als PDF.</p>
        </div>

        <HotelInvoiceGenerator />
      </div>
    </div>
  )
}

