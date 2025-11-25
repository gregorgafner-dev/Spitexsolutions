import { getHolidaysForYear, countWorkDaysInMonth, calculateMonthlyTargetHours } from '../lib/calculations'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'

const year = 2025

console.log('📅 Feiertage des Kantons Zug für', year, ':\n')
const holidays = getHolidaysForYear(year)
holidays.forEach(h => {
  console.log(`  ${format(h, 'EEEE, d. MMMM yyyy', { locale: de })}`)
})

console.log('\n📊 Arbeitstage und Soll-Stunden pro Monat (100% Pensum):\n')
for (let month = 1; month <= 12; month++) {
  const workDays = countWorkDaysInMonth(year, month)
  const targetHours = calculateMonthlyTargetHours(42.5, 100, year, month)
  const monthName = format(new Date(year, month - 1, 1), 'MMMM', { locale: de })
  console.log(`  ${monthName}: ${workDays} Arbeitstage → ${targetHours.toFixed(1)}h`)
}

console.log('\n✅ Feiertage werden in der Berechnung berücksichtigt!')




