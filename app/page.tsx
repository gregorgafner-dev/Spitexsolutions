import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="max-w-lg w-full bg-white rounded-xl shadow-2xl p-8 md:p-12 overflow-visible border-0">
        <div className="mb-8 overflow-visible">
          <Logo className="mb-6" />
          <p className="text-center text-gray-600 mt-6">
            Arbeitszeiterfassung & Dienstplanung
          </p>
        </div>
        <div className="space-y-4">
          <Link href="/login" className="block">
            <Button className="w-full" size="lg">
              Mitarbeiter Login
            </Button>
          </Link>
          <Link href="/admin/login" className="block">
            <Button className="w-full" variant="outline" size="lg">
              Admin Login
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

