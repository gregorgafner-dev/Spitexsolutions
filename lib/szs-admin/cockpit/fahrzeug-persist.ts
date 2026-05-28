import { prisma } from '@/lib/db'

const SINGLETON_ID = 'singleton'

export type DaySlots = {
  vormittag: boolean
  nachmittag: boolean
  abend: boolean
}

export type UtilizationValue = {
  soll: string
}

export type MobilityEntry = {
  kennzeichen: string
  bemerkung: string
}

export type MobilityByDate = Record<string, Partial<Record<string, MobilityEntry>>>

export type FahrzeugPersistedPayload = {
  version: 1
  daySlots: Record<string, Record<string, DaySlots>>
  mobilityByDate: MobilityByDate
  utilization: Record<string, UtilizationValue>
  fleet: unknown | null
}

export const emptyFahrzeugPayload = (): FahrzeugPersistedPayload => ({
  version: 1,
  daySlots: {},
  mobilityByDate: {},
  utilization: {},
  fleet: null,
})

function normalizePayload(raw: unknown): FahrzeugPersistedPayload {
  const base = emptyFahrzeugPayload()
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>
  return {
    version: 1,
    daySlots:
      o.daySlots && typeof o.daySlots === 'object'
        ? (o.daySlots as Record<string, Record<string, DaySlots>>)
        : base.daySlots,
    mobilityByDate:
      o.mobilityByDate && typeof o.mobilityByDate === 'object'
        ? (o.mobilityByDate as MobilityByDate)
        : base.mobilityByDate,
    utilization:
      o.utilization && typeof o.utilization === 'object'
        ? (o.utilization as Record<string, UtilizationValue>)
        : base.utilization,
    fleet: o.fleet ?? null,
  }
}

export async function loadFahrzeugPersistedState(): Promise<FahrzeugPersistedPayload> {
  const row = await prisma.cockpitFahrzeugState.findUnique({
    where: { id: SINGLETON_ID },
  })
  if (!row?.payload) return emptyFahrzeugPayload()
  try {
    return normalizePayload(JSON.parse(row.payload))
  } catch {
    return emptyFahrzeugPayload()
  }
}

export async function saveFahrzeugPersistedState(
  payload: FahrzeugPersistedPayload,
  updatedBy?: string | null
): Promise<FahrzeugPersistedPayload> {
  const normalized = normalizePayload(payload)
  const json = JSON.stringify(normalized)
  await prisma.cockpitFahrzeugState.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      payload: json,
      updatedBy: updatedBy ?? null,
    },
    update: {
      payload: json,
      updatedBy: updatedBy ?? null,
    },
  })
  return normalized
}
