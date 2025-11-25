'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CarryoverEmployee {
  employee: {
    id: string
    user: {
      firstName: string
      lastName: string
      email: string
    }
    vacationBalances: Array<{
      id: string
      year: number
      totalDays: number
      usedDays: number
      startDate: string | null
    }>
  }
  previousBalance: { year: number; totalDays: number; usedDays: number }
  remainingDays: number
}

interface CarryoverListProps {
  employeesWithCarryover: CarryoverEmployee[]
  isYearEnd: boolean
  currentYear: number
  nextYear: number
  previousYear: number
}

export default function CarryoverList({
  employeesWithCarryover,
  isYearEnd,
  currentYear,
  nextYear,
  previousYear,
}: CarryoverListProps) {
  if (employeesWithCarryover.length === 0) {
    return null
  }

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="text-orange-900">
          {isYearEnd ? `Restferien ${currentYear} → ${nextYear}` : `Resturlaub aus ${previousYear}`}
        </CardTitle>
        <CardDescription>
          {isYearEnd 
            ? `Die folgenden Mitarbeiter haben noch Restferien aus ${currentYear}, die ins nächste Jahr (${nextYear}) übertragen werden können`
            : `Die folgenden Mitarbeiter haben noch Resturlaub aus dem Vorjahr, der ins neue Jahr übertragen werden kann`
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {employeesWithCarryover.map(({ employee, previousBalance, remainingDays }) => {
            const isYearEndCarryover = isYearEnd && previousBalance.year === currentYear
            const targetYear = isYearEndCarryover ? nextYear : currentYear
            
            return (
              <div
                key={employee.id}
                className="flex items-center justify-between p-4 border border-orange-200 rounded-lg bg-white"
              >
                <div>
                  <h3 className="font-semibold">
                    {employee.user.firstName} {employee.user.lastName}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Restferien {previousBalance.year}: <span className="font-medium text-orange-600">{remainingDays} Tage</span>
                    {isYearEndCarryover && (
                      <span className="text-gray-500 ml-2">→ Übertrag nach {nextYear}</span>
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    // Wird in der Komponente behandelt
                    const event = new CustomEvent('openCarryoverDialog', {
                      detail: { 
                        employeeId: employee.id, 
                        remainingDays,
                        sourceYear: previousBalance.year,
                        targetYear: targetYear
                      }
                    })
                    window.dispatchEvent(event)
                  }}
                >
                  Übernehmen
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}





