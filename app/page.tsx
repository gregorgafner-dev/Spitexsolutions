import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/logo'
import { Clock, Users, Shield } from 'lucide-react'

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 relative overflow-hidden">
      {/* Dekorative Hintergrund-Elemente */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-200/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-200/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>
      
      <div className="max-w-2xl w-full mx-4 relative z-10">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 md:p-12 border border-white/20 overflow-visible">
          {/* Logo und Header */}
          <div className="mb-10 overflow-visible text-center">
            <Logo className="mb-6" />
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent mb-3">
              Arbeitszeiterfassung & Dienstplanung
            </h1>
            <p className="text-gray-600 text-base md:text-lg">
              Professionelle Lösung für Ihre Zeiterfassung und Dienstplanung
            </p>
          </div>

          {/* Feature Icons */}
          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="flex flex-col items-center p-4 rounded-lg bg-blue-50/50">
              <Clock className="h-8 w-8 text-blue-600 mb-2" />
              <span className="text-xs md:text-sm font-medium text-gray-700 text-center">Zeiterfassung</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-indigo-50/50">
              <Users className="h-8 w-8 text-indigo-600 mb-2" />
              <span className="text-xs md:text-sm font-medium text-gray-700 text-center">Dienstplanung</span>
            </div>
            <div className="flex flex-col items-center p-4 rounded-lg bg-purple-50/50">
              <Shield className="h-8 w-8 text-purple-600 mb-2" />
              <span className="text-xs md:text-sm font-medium text-gray-700 text-center">Sicher</span>
            </div>
          </div>

          {/* Login Buttons */}
          <div className="space-y-4">
            <Link href="/login" className="block group">
              <Button 
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] h-14 text-base font-semibold" 
                size="lg"
              >
                <Users className="mr-2 h-5 w-5" />
                Mitarbeiter Login
              </Button>
            </Link>
            <Link href="/admin/login" className="block group">
              <Button 
                className="w-full bg-gradient-to-r from-slate-700 via-blue-600 to-indigo-600 hover:from-slate-800 hover:via-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] h-14 text-base font-semibold" 
                size="lg"
              >
                <Shield className="mr-2 h-5 w-5" />
                Admin Login
              </Button>
            </Link>
          </div>

          {/* Footer Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-500">
              Persönlich, freundlich und kompetent
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

