'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/components/signout-button'
import { Logo } from '@/components/logo'

const szsNavItems = [
  {
    title: 'Dashboard',
    href: '/szs-admin/dashboard',
    icon: LayoutDashboard,
  },
]

export function SzsSidebar() {
  const pathname = usePathname()

  return (
    <div className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow bg-gradient-to-br from-slate-800 via-slate-900 to-blue-900 border-r border-slate-700/50 shadow-xl relative overflow-hidden pt-5 pb-4 overflow-y-auto">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400"></div>
          <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>

          <div className="flex items-center flex-shrink-0 px-4 mb-8 relative z-10">
            <Logo className="text-white" showTagline={false} />
          </div>
          <div className="mt-5 flex-1 flex flex-col relative z-10">
            <nav className="flex-1 px-2 space-y-1">
              {szsNavItems.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/szs-admin/dashboard' && pathname?.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                        : 'text-slate-300 hover:bg-slate-700/80 hover:text-white hover:shadow-md hover:shadow-slate-900/20'
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
          <div className="flex-shrink-0 flex border-t border-slate-700/50 p-4 relative z-10">
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
