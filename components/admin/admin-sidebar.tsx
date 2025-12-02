'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Settings, 
  Plane, 
  FileText, 
  Clock, 
  Calculator, 
  MessageSquare, 
  AlertTriangle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/signout-button'
import { Logo } from '@/components/logo'

const adminNavItems = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Mitarbeiter',
    href: '/admin/employees',
    icon: Users,
  },
  {
    title: 'Dienstplanung',
    href: '/admin/schedule',
    icon: Calendar,
  },
  {
    title: 'Dienst-Definitionen',
    href: '/admin/services',
    icon: Settings,
  },
  {
    title: 'Ferien',
    href: '/admin/vacations',
    icon: Plane,
  },
  {
    title: 'Zeiterfassung',
    href: '/admin/time-tracking',
    icon: Clock,
  },
  {
    title: 'Abrechnungen',
    href: '/admin/reports',
    icon: FileText,
  },
  {
    title: 'Berechnungen',
    href: '/admin/calculations',
    icon: Calculator,
  },
  {
    title: 'Nachrichten',
    href: '/admin/messages',
    icon: MessageSquare,
  },
  {
    title: 'Plausibilisierungen',
    href: '/admin/plausibility-checks',
    icon: AlertTriangle,
  },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow bg-gradient-to-b from-slate-800 to-slate-900 border-r border-slate-700 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4 mb-8">
            <Logo className="text-white" showTagline={false} />
          </div>
          <div className="mt-5 flex-1 flex flex-col">
            <nav className="flex-1 px-2 space-y-1">
              {adminNavItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || 
                  (item.href !== '/admin/dashboard' && pathname?.startsWith(item.href))
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                        : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    )}
                  >
                    <Icon
                      className={cn(
                        'mr-3 flex-shrink-0 h-5 w-5 transition-colors',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                      )}
                    />
                    {item.title}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-slate-700 p-4">
            <div className="flex-shrink-0 w-full">
              <SignOutButton 
                className="w-full justify-start text-white bg-red-600 hover:bg-red-700 hover:text-white border-0" 
                variant="default"
                showIcon={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

