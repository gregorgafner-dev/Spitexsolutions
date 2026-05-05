import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      role: 'ADMIN' | 'EMPLOYEE' | 'ADMIN_SZS'
      employeeId?: string
      adminId?: string
    }
  }

  interface User {
    role: 'ADMIN' | 'EMPLOYEE' | 'ADMIN_SZS'
    employeeId?: string
    adminId?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role: 'ADMIN' | 'EMPLOYEE' | 'ADMIN_SZS'
    employeeId?: string
    adminId?: string
  }
}









