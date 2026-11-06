import type { Plan, PlanItem } from '../../types'

// One blue family, tuned for the dark app and a black terminal: light text on the app's own background.
// deep = titles and strong text, mid = secondary text, blue = accents and fills, pale = tracks and borders.
export const C = { deep: '#dbeafe', blue: '#60a5fa', mid: '#93c5fd', sky: '#bfdbfe', pale: '#1e3a8a', ice: '#0b1226', white: '#ffffff' }

/** The two models the buttons switch between, by the id `/model` takes. */
export const MODELS = [
  { id: 'claude-opus-5-5', alias: 'opus', label: 'Opus' },
  { id: 'claude-sonnet-5-5', alias: 'sonnet', label: 'Sonnet' },
] as const

const STATUSES = ['pending', 'in_progress', 'completed'] as const
const asStatus = (s: unknown): PlanItem['status'] => (STATUSES.includes(s as never) ? (s as PlanItem['status']) : 'pending')

/**
 * Follows Claude's own checklist from the calls that keep it: the desktop's task list
 * (`items`, `advance`, `done`/`start`, and `wrap_up` checking everything off) and the CLI's `TodoWrite`.
 * Returns undefined for any other call, so the plan stays as it was.
 */
export const planAfter = (plan: Plan | null, tool: string, args: Record<string, unknown>): Plan | null | undefined => {
  const name = tool.split('__').at(-1)
  if (name === 'TodoWrite' && Array.isArray(args.todos)) {
    return { items: args.todos.map(t => ({ content: String((t as { content?: unknown }).content ?? ''), status: asStatus((t as { status?: unknown }).status) })) }
  }
  if (name === 'wrap_up') return plan && { items: plan.items.map(i => ({ ...i, status: 'completed' })) }
  if (name !== 'update_plan') return undefined
  if (Array.isArray(args.items)) {
    return { items: args.items.map(t => ({ content: String((t as { content?: unknown }).content ?? ''), status: asStatus((t as { status?: unknown }).status) })) }
  }
  if (!plan) return undefined
  let items = plan.items.map(i => ({ ...i }))
  if (args.advance === true) {
    const at = items.findIndex(i => i.status === 'in_progress')
    if (at >= 0) items[at]!.status = 'completed'
    const next = items.findIndex((i, k) => k > at && i.status === 'pending')
    if (next >= 0) items[next]!.status = 'in_progress'
  }
  if (Array.isArray(args.done)) for (const n of args.done) if (typeof n === 'number' && items[n - 1]) items[n - 1]!.status = 'completed'
  if (typeof args.start === 'number' && items[args.start - 1]) {
    items = items.map(i => (i.status === 'in_progress' ? { ...i, status: 'pending' } : i))
    items[args.start - 1]!.status = 'in_progress'
  }
  return { items }
}

/** `3/5`, the share done, and the step under way (or the last one once all are done). */
export const planView = (plan: Plan | null) => {
  if (!plan || plan.items.length === 0) return undefined
  const done = plan.items.filter(i => i.status === 'completed').length
  const now = plan.items.find(i => i.status === 'in_progress') ?? (done === plan.items.length ? undefined : plan.items.find(i => i.status === 'pending'))
  return { done, total: plan.items.length, ratio: done / plan.items.length, now: now?.content }
}

/** A ring's colour by how full it is: blue, then yellow from 40%, orange from 60%, red from 80%. */
export const ringColor = (pct: number) => (pct >= 80 ? '#ef4444' : pct >= 60 ? '#fb923c' : pct >= 40 ? '#facc15' : C.blue)

/** A ring gauge: `pct` of the circle in blue on a pale track, the number in the middle; `–` when unread. */
export const ringSvg = (pct: number | undefined, size = 72) => {
  const r = size / 2 - 6
  const circ = 2 * Math.PI * r
  const p = pct === undefined ? 0 : Math.min(100, Math.max(0, pct))
  const color = ringColor(p)
  const label = pct === undefined ? '–' : `${Math.round(p)}%`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${C.pale}" stroke-width="7"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" ` +
    `stroke-dasharray="${((circ * p) / 100).toFixed(2)} ${circ.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-family="ui-monospace,monospace" ` +
    `font-size="15" font-weight="700" fill="${C.deep}">${label}</text></svg>`
  )
}

/** The terminal's ring: a quarter-filled glyph and the number. */
export const ringText = (pct: number | undefined) =>
  pct === undefined ? '○ –' : `${['○', '◔', '◑', '◕', '●'][Math.min(4, Math.round(pct / 25))]} ${Math.round(pct)}%`

/** A thin progress bar. */
export const thinBarSvg = (ratio: number, width: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">` +
  `<rect x="0" y="2" width="${width}" height="6" rx="3" fill="${C.pale}"/>` +
  `<rect x="0" y="2" width="${Math.round(width * Math.min(1, Math.max(0, ratio)))}" height="6" rx="3" fill="${C.blue}"/></svg>`

/** The effort buttons: the level `/effort` takes, and the button's word. */
export const EFFORTS = [
  { level: 'low', label: 'low' },
  { level: 'medium', label: 'mid' },
  { level: 'high', label: 'high' },
] as const
