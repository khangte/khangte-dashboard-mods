import type { Minutes, Pomo } from '../../types'

export const DEFAULT_MINUTES: Minutes = { focus: 25, rest: 5 }

const durOf = (p: Pomo, m: Minutes) => (p.mode === 'focus' ? m.focus : m.rest) * 60_000

export const freshPomo = (day: string, m: Minutes = DEFAULT_MINUTES): Pomo => ({
  mode: 'focus',
  status: 'idle',
  endsAt: 0,
  leftMs: m.focus * 60_000,
  done: 0,
  day,
})

/** Time left in the phase: counting down while running, frozen while paused or idle. */
export const remaining = (p: Pomo, now: number) => (p.status === 'running' ? Math.max(0, p.endsAt - now) : p.leftMs)

/** How far the phase has gone, 0..1. */
export const progress = (p: Pomo, now: number, m: Minutes) => Math.min(1, Math.max(0, 1 - remaining(p, now) / durOf(p, m)))

/** `24:59`: whole seconds, rounded up so a fresh 25:00 shows 25:00 until a second has gone. */
export const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const start = (p: Pomo, now: number): Pomo =>
  p.status === 'running' ? p : { ...p, status: 'running', endsAt: now + p.leftMs }

export const pause = (p: Pomo, now: number): Pomo =>
  p.status === 'running' ? { ...p, status: 'paused', leftMs: remaining(p, now) } : p

/** ⏭: to the other phase, full length; a running timer keeps running, a stopped one waits. */
export const skip = (p: Pomo, now: number, m: Minutes): Pomo => {
  const next: Pomo = { ...p, mode: p.mode === 'focus' ? 'rest' : 'focus', status: p.status === 'running' ? 'running' : 'idle' }
  const leftMs = durOf(next, m)
  return { ...next, leftMs, endsAt: now + leftMs }
}

/** ↺: back to a fresh focus phase, stopped; today's count stays. */
export const reset = (p: Pomo, m: Minutes): Pomo => ({ ...freshPomo(p.day, m), done: p.done })

export type PomoEvent = 'focus-done' | 'rest-done'

/**
 * Moves a running timer past every phase that has ended by `now`: a finished focus counts a 🍅 and
 * starts the rest, a finished rest starts the next focus, each from the moment the last one ended.
 */
export const advance = (p: Pomo, now: number, m: Minutes): { pomo: Pomo; events: PomoEvent[] } => {
  let pomo = p
  const events: PomoEvent[] = []
  while (pomo.status === 'running' && now >= pomo.endsAt && events.length < 100) {
    const wasFocus = pomo.mode === 'focus'
    events.push(wasFocus ? 'focus-done' : 'rest-done')
    const next: Pomo = { ...pomo, mode: wasFocus ? 'rest' : 'focus', done: pomo.done + (wasFocus ? 1 : 0) }
    const leftMs = durOf(next, m)
    pomo = { ...next, leftMs, endsAt: pomo.endsAt + leftMs }
  }
  return { pomo, events }
}

/** A new calendar day starts the count at 0. */
export const rollDay = (p: Pomo, today: string): Pomo => (p.day === today ? p : { ...p, done: 0, day: today })

/** `/pomodoro 25 5`: focus and rest minutes, 1..180 each. */
export const parseMinutes = (args: string): Minutes | undefined => {
  const m = args.trim().match(/^(\d{1,3})(?:\s+(\d{1,3}))?$/)
  if (!m) return undefined
  const focus = Number(m[1])
  const rest = m[2] === undefined ? DEFAULT_MINUTES.rest : Number(m[2])
  return focus >= 1 && focus <= 180 && rest >= 1 && rest <= 180 ? { focus, rest } : undefined
}

// The tomato, 14 x 13 dots. G leaf, T body, E eye, M mouth, P blush, H shine; a dot is transparent.
const TOMATO = [
  '......GG......',
  '...GGGGGGGG...',
  '..TTGGTTGGTT..',
  '.TTTTTTTTTTTT.',
  'THTTTTTTTTTTTT',
  'TTTEETTTTEETTT',
  'TTTEETTTTEETTT',
  'TPPTTTTTTTTPPT',
  'TTTTMTTTTMTTTT',
  'TTTTTMMMMTTTTT',
  '.TTTTTTTTTTTT.',
  '..TTTTTTTTTT..',
  '....TTTTTT....',
]
const BODY_TOP = 2
const BODY_ROWS = TOMATO.length - BODY_TOP
export const DOT = 5

const RIPE = '#e53935'
const UNRIPE = '#c5e1a5'
const COLOR: Record<string, string> = { G: '#43a047', E: '#1b1b1b', M: '#1b1b1b', P: '#f48fb1', H: '#ffffff' }

/**
 * The tomato as SVG. `ripe` (0..1) reddens the body from the bottom up; `isResting` closes the eyes
 * to `- ‿ -` (only the eyes' lower row is drawn).
 */
export const tomatoSvg = (ripe: number, isResting: boolean) => {
  const redFrom = TOMATO.length - Math.round(Math.min(1, Math.max(0, ripe)) * BODY_ROWS)
  const rects = TOMATO.flatMap((row, r) =>
    [...row].map((ch, c) => {
      if (ch === '.') return ''
      const body = r >= redFrom ? RIPE : UNRIPE
      let fill = COLOR[ch] ?? body
      if (ch === 'E' && isResting && r === 5) fill = body // closed eyes: a single dash
      if ((ch === 'P' || ch === 'H') && r < redFrom) fill = body // blush and shine show once ripe there
      return `<rect x="${c * DOT}" y="${r * DOT}" width="${DOT}" height="${DOT}" fill="${fill}"/>`
    }),
  ).join('')
  const w = TOMATO[0]!.length * DOT
  const h = TOMATO.length * DOT
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects}</svg>`
}
export const TOMATO_SIZE = { width: TOMATO[0]!.length * DOT, height: TOMATO.length * DOT }
