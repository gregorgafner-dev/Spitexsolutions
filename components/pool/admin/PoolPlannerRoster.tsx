'use client'

import { useMemo } from 'react'
import { POOL_TEAMS, POOL_TEAM_IDS, type PoolTeamId } from '@/lib/pool/teams'
import type { PoolHoliday } from '@/lib/pool/holidays-zh'

const WEEKDAY_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const

type PoolUserMini = {
  id: string
  firstName: string
  lastName: string
  qualification: string | null
  qualificationShort: string | null
}

type MemberRow = {
  id: string
  firstName: string
  lastName: string
  qualificationShort: string | null
}

type ShiftRequestRow = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  status: 'OPEN' | 'FILLED' | 'CANCELLED'
}

type BookingRow = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  team: PoolTeamId
  poolUser: PoolUserMini
}

type AvailabilityRow = {
  id: string
  date: string
  shift: 'EARLY' | 'LATE'
  poolUser: PoolUserMini
  lockedByBooking: boolean
}

type DayCol = {
  iso: string
  day: number
  weekday: number
  isWeekend: boolean
  holiday: PoolHoliday | null
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function buildDaysInMonth(
  year: number,
  monthIndex: number,
  holidayMap: Map<string, PoolHoliday>
): DayCol[] {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cols: DayCol[] = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex, day)
    const weekday = (date.getDay() + 6) % 7
    const isoStr = iso(year, monthIndex, day)
    cols.push({
      iso: isoStr,
      day,
      weekday,
      isWeekend: weekday >= 5,
      holiday: holidayMap.get(isoStr) ?? null,
    })
  }
  return cols
}

function shiftLetter(shift: 'EARLY' | 'LATE'): 'F' | 'S' {
  return shift === 'EARLY' ? 'F' : 'S'
}

export default function PoolPlannerRoster({
  year,
  monthIndex,
  holidayMap,
  requests,
  bookings,
  availabilities,
  members,
  onDayClick,
}: {
  year: number
  monthIndex: number
  holidayMap: Map<string, PoolHoliday>
  requests: ShiftRequestRow[]
  bookings: BookingRow[]
  availabilities: AvailabilityRow[]
  members: MemberRow[]
  onDayClick: (iso: string) => void
}) {
  const days = useMemo(
    () => buildDaysInMonth(year, monthIndex, holidayMap),
    [year, monthIndex, holidayMap]
  )

  const openByDay = useMemo(() => {
    const map = new Map<string, ShiftRequestRow[]>()
    for (const r of requests) {
      if (r.status !== 'OPEN') continue
      const list = map.get(r.date) ?? []
      list.push(r)
      map.set(r.date, list)
    }
    return map
  }, [requests])

  const bookingsByUserDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>()
    for (const b of bookings) {
      const key = `${b.poolUser.id}|${b.date}`
      const list = map.get(key) ?? []
      list.push(b)
      map.set(key, list)
    }
    return map
  }, [bookings])

  const availByUserDay = useMemo(() => {
    const map = new Map<string, AvailabilityRow[]>()
    for (const a of availabilities) {
      if (a.lockedByBooking) continue
      const key = `${a.poolUser.id}|${a.date}`
      const list = map.get(key) ?? []
      list.push(a)
      map.set(key, list)
    }
    return map
  }, [availabilities])

  // Alle aktiven Pool-Mitarbeitenden anzeigen (auch ohne Einträge im Monat),
  // analog zum klassischen Einsatzplan-Raster.
  const visibleMembers = useMemo(() => {
    return [...members].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'de')
    )
  }, [members])

  return (
    <div className="overflow-x-auto">
      <table className="min-w-max border-collapse text-xs">
        <thead>
          {/* Wochentage */}
          <tr className="bg-gray-100">
            <th className="sticky left-0 z-20 min-w-[200px] border border-gray-300 bg-gray-100 px-2 py-1 text-left font-semibold text-gray-700">
              &nbsp;
            </th>
            {days.map((d) => (
              <th
                key={`wd-${d.iso}`}
                className={`min-w-[28px] border border-gray-300 px-0.5 py-1 text-center font-medium ${
                  d.isWeekend ? 'bg-amber-100 text-red-700' : 'text-gray-600'
                }`}
              >
                {WEEKDAY_SHORT[d.weekday]}
              </th>
            ))}
          </tr>
          {/* Tageszahlen */}
          <tr className="bg-gray-50">
            <th className="sticky left-0 z-20 border border-gray-300 bg-gray-50 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Tag
            </th>
            {days.map((d) => (
              <th
                key={`dn-${d.iso}`}
                title={d.holiday?.name ?? undefined}
                className={`min-w-[28px] border border-gray-300 px-0.5 py-1 text-center font-semibold ${
                  d.holiday
                    ? 'bg-yellow-100 text-amber-900'
                    : d.isWeekend
                      ? 'bg-amber-50 text-red-800'
                      : 'text-gray-900'
                }`}
              >
                {d.day}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Grüner Team-Block: Offener Bedarf gesamt */}
          <tr>
            <td
              colSpan={days.length + 1}
              className="border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white"
            >
              Spitex Zürichsee Pool · Einsatzplan
            </td>
          </tr>

          {/* Zeile: Offener Bedarf (rot) */}
          <tr className="bg-emerald-50/80">
            <td className="sticky left-0 z-10 border border-gray-300 bg-emerald-50 px-2 py-1.5 font-semibold text-emerald-900">
              Offener Bedarf
            </td>
            {days.map((d) => {
              const open = openByDay.get(d.iso) ?? []
              return (
                <td
                  key={`open-${d.iso}`}
                  className={`border border-gray-300 p-0.5 align-top ${
                    d.holiday ? 'bg-yellow-50' : d.isWeekend ? 'bg-amber-50/80' : 'bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onDayClick(d.iso)}
                    className="flex min-h-[26px] w-full flex-col items-center gap-0.5 p-0.5 hover:bg-red-50/60"
                    title={open.length > 0 ? `${open.length} offene Anfrage(n)` : undefined}
                  >
                    {open.map((r) => (
                      <RosterBadge
                        key={r.id}
                        kind="open"
                        shift={r.shift}
                        team={r.team}
                      />
                    ))}
                  </button>
                </td>
              )
            })}
          </tr>

          {/* Unterkopf Mitarbeitende */}
          <tr>
            <td
              colSpan={days.length + 1}
              className="border border-emerald-400 bg-emerald-100 px-3 py-1 text-[11px] font-semibold text-emerald-900"
            >
              Pool-Mitarbeitende ({visibleMembers.length})
            </td>
          </tr>

          {visibleMembers.length === 0 ? (
            <tr>
              <td
                colSpan={days.length + 1}
                className="border border-gray-300 px-4 py-6 text-center text-sm text-gray-500"
              >
                Keine aktiven Pool-Mitarbeitenden erfasst.
              </td>
            </tr>
          ) : (
            visibleMembers.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50/50">
                <td className="sticky left-0 z-10 border border-gray-300 bg-white px-2 py-1.5">
                  <div className="font-medium text-gray-900">
                    {member.lastName} {member.firstName}
                  </div>
                  {member.qualificationShort && (
                    <div className="text-[10px] text-gray-500">{member.qualificationShort}</div>
                  )}
                </td>
                {days.map((d) => {
                  const userBookings = bookingsByUserDay.get(`${member.id}|${d.iso}`) ?? []
                  const userAvail = availByUserDay.get(`${member.id}|${d.iso}`) ?? []
                  const bookedShifts = new Set(userBookings.map((b) => b.shift))

                  return (
                    <td
                      key={`${member.id}-${d.iso}`}
                      className={`border border-gray-300 p-0.5 align-top ${
                        d.holiday ? 'bg-yellow-50' : d.isWeekend ? 'bg-amber-50/80' : 'bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onDayClick(d.iso)}
                        className="flex min-h-[26px] w-full flex-col items-center gap-0.5 p-0.5 hover:bg-blue-50/40"
                      >
                        {userBookings.map((b) => (
                          <RosterBadge
                            key={b.id}
                            kind="booked"
                            shift={b.shift}
                            team={b.team}
                          />
                        ))}
                        {userAvail
                          .filter((a) => !bookedShifts.has(a.shift))
                          .map((a) => (
                            <RosterBadge
                              key={a.id}
                              kind="avail"
                              shift={a.shift}
                            />
                          ))}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))
          )}

          {/* Team-Zusammenfassung (blau, analog Screenshot 1 unten) */}
          {POOL_TEAM_IDS.map((teamId) => {
            const team = POOL_TEAMS[teamId]
            const teamBookings = bookings.filter((b) => b.team === teamId)
            if (teamBookings.length === 0 && !requests.some((r) => r.team === teamId && r.status === 'OPEN')) {
              return null
            }
            return (
              <TeamSummaryBlock
                key={teamId}
                teamId={teamId}
                teamLabel={team.label}
                days={days}
                bookings={teamBookings}
                openRequests={requests.filter((r) => r.team === teamId && r.status === 'OPEN')}
                onDayClick={onDayClick}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function RosterBadge({
  kind,
  shift,
  team,
}: {
  kind: 'open' | 'booked' | 'avail'
  shift: 'EARLY' | 'LATE'
  team?: PoolTeamId
}) {
  const letter = shiftLetter(shift)
  const teamShort = team ? POOL_TEAMS[team]?.short : null
  const shiftName = shift === 'EARLY' ? 'Frühdienst' : 'Spätdienst'

  if (kind === 'open') {
    return (
      <span
        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm bg-red-500 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm"
        title={`Offen · ${shiftName}${teamShort ? ` · ${teamShort}` : ''}`}
      >
        {letter}
      </span>
    )
  }

  if (kind === 'booked') {
    return (
      <span
        className="inline-flex h-5 min-w-[20px] flex-col items-center justify-center rounded-sm bg-blue-600 px-0.5 text-[10px] font-bold leading-none text-white shadow-sm"
        title={`Gebucht · ${shiftName}${teamShort ? ` · ${teamShort}` : ''}`}
      >
        {letter}
        {teamShort && (
          <span className="text-[7px] font-semibold leading-none opacity-90">{teamShort}</span>
        )}
      </span>
    )
  }

  return (
    <span
      className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm border-2 border-teal-400 bg-teal-50 px-0.5 text-[10px] font-bold leading-none text-teal-800"
      title={`Verfügbar · ${shiftName}`}
    >
      {letter}
    </span>
  )
}

function TeamSummaryBlock({
  teamId,
  teamLabel,
  days,
  bookings,
  openRequests,
  onDayClick,
}: {
  teamId: PoolTeamId
  teamLabel: string
  days: DayCol[]
  bookings: BookingRow[]
  openRequests: ShiftRequestRow[]
  onDayClick: (iso: string) => void
}) {
  const team = POOL_TEAMS[teamId]
  const byDay = useMemo(() => {
    const map = new Map<string, BookingRow[]>()
    for (const b of bookings) {
      const list = map.get(b.date) ?? []
      list.push(b)
      map.set(b.date, list)
    }
    return map
  }, [bookings])

  const openByDay = useMemo(() => {
    const map = new Map<string, ShiftRequestRow[]>()
    for (const r of openRequests) {
      const list = map.get(r.date) ?? []
      list.push(r)
      map.set(r.date, list)
    }
    return map
  }, [openRequests])

  return (
    <>
      <tr>
        <td
          colSpan={days.length + 1}
          className="border border-sky-600 bg-sky-600 px-3 py-1.5 text-sm font-bold text-white"
        >
          {team.label} · gebuchte Schichten
        </td>
      </tr>
      <tr className="bg-sky-50/60">
        <td className="sticky left-0 z-10 border border-gray-300 bg-sky-50 px-2 py-1.5 font-semibold text-sky-900">
          <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${team.dotColor}`} />
          Belegung
        </td>
        {days.map((d) => {
          const dayBookings = byDay.get(d.iso) ?? []
          const dayOpen = openByDay.get(d.iso) ?? []
          return (
            <td
              key={`sum-${teamId}-${d.iso}`}
              className={`border border-gray-300 p-0.5 align-top ${
                d.isWeekend ? 'bg-amber-50/80' : 'bg-white'
              }`}
            >
              <button
                type="button"
                onClick={() => onDayClick(d.iso)}
                className="flex min-h-[26px] w-full flex-col items-center gap-0.5 p-0.5 hover:bg-sky-50"
              >
                {dayOpen.map((r) => (
                  <RosterBadge key={r.id} kind="open" shift={r.shift} team={r.team} />
                ))}
                {dayBookings.map((b) => (
                  <RosterBadge key={b.id} kind="booked" shift={b.shift} team={b.team} />
                ))}
              </button>
            </td>
          )
        })}
      </tr>
    </>
  )
}
