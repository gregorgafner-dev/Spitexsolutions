'use client'

import { signOut } from 'next-auth/react'
import { Button, ButtonProps } from '@/components/ui/button'
import { LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SignOutButtonProps extends Omit<ButtonProps, 'onClick'> {
  showIcon?: boolean
}

export function SignOutButton({ className, variant = "outline", showIcon = false, ...props }: SignOutButtonProps) {
  return (
    <Button
      variant={variant}
      className={cn("gap-2", className)}
      onClick={() => signOut({ callbackUrl: '/' })}
      {...props}
    >
      {showIcon && <LogOut className="h-4 w-4" />}
      Abmelden
    </Button>
  )
}









