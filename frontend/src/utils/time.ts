// Date/time helpers. User-facing controls are UK local time (Europe/London); the API speaks UTC instants.
const TZ = 'Europe/London'

const partsFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})

function offsetMinutes(ms: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(ms).map((x) => [x.type, x.value]))
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

/** UK wall-clock date ('YYYY-MM-DD') + time ('HH:mm') -> UTC epoch ms (handles BST/GMT). */
export function ukWallToUtcMs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  let ms = guess - offsetMinutes(guess) * 60000
  const off2 = offsetMinutes(ms)
  ms = guess - off2 * 60000
  return ms
}

export const ukWallToUtcIso = (date: string, time: string) =>
  new Date(ukWallToUtcMs(date, time)).toISOString().replace('.000Z', 'Z')

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', ...o })
const fTime = fmt({ hour: '2-digit', minute: '2-digit' })
const fDate = fmt({ day: '2-digit', month: 'short', year: 'numeric' })
const fDay = fmt({ weekday: 'short', day: '2-digit', month: 'short' })
const fDateTime = fmt({ day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const ms = (v: string | number) => (typeof v === 'number' ? v : Date.parse(v))
export const ukTime = (v: string | number) => fTime.format(ms(v))
export const ukDate = (v: string | number) => fDate.format(ms(v))
export const ukDay = (v: string | number) => fDay.format(ms(v))
export const ukDateTime = (v: string | number) => `${fDateTime.format(ms(v))} ${ukZone(v)}`
/** 'DD Mon, HH:mm' in UK local time, no zone suffix. */
export const ukStamp = (v: string | number) => fDateTime.format(ms(v))
export const ukZone = (v: string | number) => (offsetMinutes(ms(v)) === 0 ? 'GMT' : 'BST')

/** Shift a 'YYYY-MM-DD' date by whole days (calendar arithmetic, no timezone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function diffDays(a: string, b: string): number {
  const t = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((t(a) - t(b)) / 86400000)
}
