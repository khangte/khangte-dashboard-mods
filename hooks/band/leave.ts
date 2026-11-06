import type { Hours } from '../../types'

export const DEFAULT_HOURS: Hours = { start: '09:00', end: '18:00' }

const pad = (n: number) => String(n).padStart(2, '0')
const secOf = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  return h * 3600 + m * 60
}

/** `09:00 18:30` -> hours; undefined when malformed or the end is not after the start. */
export const parseHours = (args: string): Hours | undefined => {
  const m = args.trim().match(/^(\d{1,2}):(\d{2})\s+(\d{1,2}):(\d{2})$/)
  if (!m) return undefined
  const [h1, m1, h2, m2] = m.slice(1).map(Number) as [number, number, number, number]
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return undefined
  const hours = { start: `${pad(h1)}:${pad(m1)}`, end: `${pad(h2)}:${pad(m2)}` }
  return secOf(hours.end) > secOf(hours.start) ? hours : undefined
}

export type LeaveView = {
  kind: 'rest' | 'work' | 'soon' | 'tidy' | 'cheer' | 'over'
  text: string
  /** While the day runs: the parts the band draws in its own colours. */
  meter?: { clock: string; full: number; empty: number; pct: number }
}

const BAR = 9

/** What the counter says at `nowMs` (local time) for these hours. */
export const leaveView = (nowMs: number, hours: Hours): LeaveView => {
  const d = new Date(nowMs)
  if (d.getDay() === 0 || d.getDay() === 6) return { kind: 'rest', text: '오늘은 쉬는 날 ☀' }

  const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
  const start = secOf(hours.start)
  const end = secOf(hours.end)

  if (sec >= end) {
    const over = sec - end
    if (over < 3) return { kind: 'cheer', text: '🎉 퇴근!' }
    const min = Math.floor(over / 60)
    return { kind: 'over', text: `퇴근 시간 지났어요 🌙 +${Math.floor(min / 60)}:${pad(min % 60)}` }
  }

  const left = end - sec
  const pct = Math.round(Math.min(1, Math.max(0, (sec - start) / (end - start))) * 100)
  const full = Math.round((pct / 100) * BAR)
  const clock = `${Math.floor(left / 3600)}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`
  const base = `🏃 퇴근까지 ${clock}  ${'▰'.repeat(full)}${'▱'.repeat(BAR - full)} ${pct}%`
  const meter = { clock, full, empty: BAR - full, pct }
  if (left <= 600) return { kind: 'tidy', text: `${base} 정리할 시간이에요 🧹`, meter }
  return { kind: left <= 1800 ? 'soon' : 'work', text: base, meter }
}
