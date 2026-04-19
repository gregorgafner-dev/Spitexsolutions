export function parseSignedHHMMToMinutes(input: string): number {
  const raw = (input ?? '').trim()
  if (!raw) throw new Error('Empty time value')

  const m = raw.match(/^([+-])?\s*(\d+)\s*:\s*([0-5]\d)$/)
  if (!m) throw new Error('Invalid format, expected HH:MM (optional leading +/−)')

  const sign = m[1] === '-' ? -1 : 1
  const hours = parseInt(m[2], 10)
  const minutes = parseInt(m[3], 10)
  return sign * (hours * 60 + minutes)
}

export function minutesToSignedHHMM(totalMinutes: number): string {
  const sign = totalMinutes < 0 ? '-' : ''
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${String(h)}:${String(m).padStart(2, '0')}`
}

export function minutesToHoursFloat(totalMinutes: number): number {
  return totalMinutes / 60
}

