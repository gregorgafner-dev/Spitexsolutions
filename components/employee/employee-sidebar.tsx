'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, 
  Clock, 
  User
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/signout-button'
import { Logo } from '@/components/logo'

const employeeNavItems = [
  {
    title: 'Dashboard',
    href: '/employee/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Arbeitszeiterfassung',
    href: '/employee/time-tracking',
    icon: Clock,
  },
  {
    title: 'Profil',
    href: '/employee/profile',
    icon: User,
  },
]

export function EmployeeSidebar() {
  const pathname = usePathname()

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow bg-gradient-to-b from-blue-600 to-blue-700 border-r border-blue-800 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4 mb-8">
            <Logo className="text-white" showTagline={false} />
          </div>
          <div className="mt-5 flex-1 flex flex-col">
            <nav className="flex-1 px-2 space-y-1">
              {employeeNavItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || 
                  (item.href !== '/employee/dashboard' && pathname?.startsWith(item.href))
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-white text-blue-700 shadow-lg'
                        : 'text-blue-100 hover:bg-blue-800 hover:text-white'
                    )}
                  >
                    <Icon
                      className={cn(
                        'mr-3 flex-shrink-0 h-5 w-5 transition-colors',
                        isActive ? 'text-blue-700' : 'text-blue-200 group-hover:text-white'
                      )}
                    />
                    {item.title}
                  </Link>
                )
              })}
            </nav>
          </div>
          <div className="flex-shrink-0 flex border-t border-blue-800 p-4">
            <div className="flex-shrink-0 w-full">
              <SignOutButton 
                className="w-full justify-start text-blue-100 hover:text-white hover:bg-blue-800" 
                variant="ghost"
                showIcon={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

