import type { DaySlots, FahrzeugPersistedPayload, UtilizationValue } from './fahrzeug-persist'

const SLOT_WEIGHT_VM = 33.33333333
const SLOT_WEIGHT_NM = 33.33333333
const SLOT_WEIGHT_AB = 33.33333333

export type FleetAuto = {
  id: string
  kontrollschild: string
  standort: string
  typ: string
  status: 'aktiv' | 'ausser-betrieb'
}

export type FleetSnapshot = {
  autos: FleetAuto[]
}

export type AuswertungVehicleRow = {
  vehicleId: string
  kontrollschild: string
  standort: string
  typ: string
  sollPct: number
  avgIstPct: number
  deltaPct: number
  daysWithUsage: number
}

export type AuswertungDailyRow = {
  date: string
  vehicleId: string
  kontrollschild: string
  standort: string
  vormittag: boolean
  nachmittag: boolean
  abend: boolean
  istPct: number
  sollPct: number
  deltaPct: number
}

export type FahrzeugAuswertung = {
  dateFrom: string
  dateTo: string
  daysInRange: number
  activeVehicleCount: number
  fleetAvgIst: number
  fleetAvgSoll: number
  fleetDelta: number
  vehicles: AuswertungVehicleRow[]
  daily: AuswertungDailyRow[]
}

const emptySlots = (): DaySlots => ({
  vormittag: false,
  nachmittag: false,
  abend: false,
})

export function dayUtilizationPct(slots: DaySlots): number {
  const total =
    (slots.vormittag ? SLOT_WEIGHT_VM : 0) +
    (slots.nachmittag ? SLOT_WEIGHT_NM : 0) +
    (slots.abend ? SLOT_WEIGHT_AB : 0)
  return slots.vormittag && slots.nachmittag && slots.abend ? 100 : total
}

export function parsePercent(value: string | undefined | null): number {
  const normalized = String(value ?? '').replace(',', '.').trim()
  const n = Number(normalized)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

export function eachIsoDayInclusive(from: string, to: string): string[] {
  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from)
  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to)
  if (!fromMatch || !toMatch) return []

  const cur = new Date(
    parseInt(fromMatch[1], 10),
    parseInt(fromMatch[2], 10) - 1,
    parseInt(fromMatch[3], 10)
  )
  const end = new Date(
    parseInt(toMatch[1], 10),
    parseInt(toMatch[2], 10) - 1,
    parseInt(toMatch[3], 10)
  )
  if (cur.getTime() > end.getTime()) return []

  const dates: string[] = []
  while (cur.getTime() <= end.getTime()) {
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const d = String(cur.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${d}`)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function getFleetAutos(payload: FahrzeugPersistedPayload): FleetAuto[] {
  const fleet = payload.fleet as FleetSnapshot | null
  if (!fleet || !Array.isArray(fleet.autos)) return []
  return fleet.autos
}

function getSlots(
  daySlots: FahrzeugPersistedPayload['daySlots'],
  date: string,
  vehicleId: string
): DaySlots {
  const raw = daySlots[date]?.[vehicleId]
  if (!raw) return emptySlots()
  return {
    vormittag: Boolean(raw.vormittag),
    nachmittag: Boolean(raw.nachmittag),
    abend: Boolean(raw.abend),
  }
}

function getSoll(
  utilization: Record<string, UtilizationValue>,
  vehicleId: string,
  status: FleetAuto['status']
): number {
  const configured = utilization[vehicleId]?.soll
  if (configured !== undefined && configured !== '') return parsePercent(configured)
  return status === 'aktiv' ? 75 : 0
}

export function computeFahrzeugAuswertung(
  payload: FahrzeugPersistedPayload,
  dateFrom: string,
  dateTo: string
): FahrzeugAuswertung {
  const dates = eachIsoDayInclusive(dateFrom, dateTo)
  const activeAutos = getFleetAutos(payload).filter((a) => a.status === 'aktiv')

  const daily: AuswertungDailyRow[] = []
  const vehicles: AuswertungVehicleRow[] = activeAutos.map((auto) => {
    const sollPct = getSoll(payload.utilization, auto.id, auto.status)
    let sumIst = 0
    let daysWithUsage = 0

    for (const date of dates) {
      const slots = getSlots(payload.daySlots, date, auto.id)
      const istPct = dayUtilizationPct(slots)
      if (istPct > 0) daysWithUsage += 1
      sumIst += istPct
      daily.push({
        date,
        vehicleId: auto.id,
        kontrollschild: auto.kontrollschild || '-',
        standort: auto.standort || '-',
        vormittag: slots.vormittag,
        nachmittag: slots.nachmittag,
        abend: slots.abend,
        istPct,
        sollPct,
        deltaPct: istPct - sollPct,
      })
    }

    const avgIstPct = dates.length > 0 ? sumIst / dates.length : 0
    return {
      vehicleId: auto.id,
      kontrollschild: auto.kontrollschild || '-',
      standort: auto.standort || '-',
      typ: auto.typ || '-',
      sollPct,
      avgIstPct,
      deltaPct: avgIstPct - sollPct,
      daysWithUsage,
    }
  })

  const fleetAvgIst =
    vehicles.length > 0
      ? vehicles.reduce((acc, v) => acc + v.avgIstPct, 0) / vehicles.length
      : 0
  const fleetAvgSoll =
    vehicles.length > 0
      ? vehicles.reduce((acc, v) => acc + v.sollPct, 0) / vehicles.length
      : 0

  return {
    dateFrom,
    dateTo,
    daysInRange: dates.length,
    activeVehicleCount: vehicles.length,
    fleetAvgIst,
    fleetAvgSoll,
    fleetDelta: fleetAvgIst - fleetAvgSoll,
    vehicles: vehicles.sort((a, b) =>
      (a.kontrollschild || '').localeCompare(b.kontrollschild || '', 'de')
    ),
    daily: daily.sort((a, b) =>
      a.date === b.date
        ? a.kontrollschild.localeCompare(b.kontrollschild, 'de')
        : a.date.localeCompare(b.date)
    ),
  }
}
