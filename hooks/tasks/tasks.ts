import type { Tab, Tag, Task } from '../../types'

export const TAGS: readonly Tag[] = ['급함', '업무', '중요']
export const TABS: readonly Tab[] = ['오늘', '예정', '완료']

const pad = (n: number) => String(n).padStart(2, '0')

/** The local calendar day of `ms`, `YYYY-MM-DD`. */
export const dayOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const shiftDay = (ms: number, days: number) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + days)
  return dayOf(d.getTime())
}

export type Parsed = { title: string; tag: Tag; due?: string; day: string } | { error: string }

/**
 * `/todo 견적서 검토 15:00` -> a task due today at 15:00.
 * Also takes a day (`내일`, `모레`, `11/10`) and a tag (`#급함`, `#업무`, `#중요`) anywhere; untagged is 업무.
 */
export const parseTodo = (args: string, nowMs: number): Parsed => {
  let due: string | undefined
  let day = dayOf(nowMs)
  let tag: Tag = '업무'
  const words: string[] = []
  for (const w of args.trim().split(/\s+/).filter(Boolean)) {
    const time = w.match(/^(\d{1,2}):(\d{2})$/)
    const date = w.match(/^(\d{1,2})\/(\d{1,2})$/)
    const named = TAGS.find(t => w === `#${t}`)
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60) due = `${pad(Number(time[1]))}:${time[2]}`
    else if (w === '오늘') day = dayOf(nowMs)
    else if (w === '내일') day = shiftDay(nowMs, 1)
    else if (w === '모레') day = shiftDay(nowMs, 2)
    else if (date && Number(date[1]) >= 1 && Number(date[1]) <= 12 && Number(date[2]) >= 1 && Number(date[2]) <= 31)
      day = `${new Date(nowMs).getFullYear()}-${pad(Number(date[1]))}-${pad(Number(date[2]))}`
    else if (named) tag = named
    else words.push(w)
  }
  const title = words.join(' ')
  if (title === '') return { error: '할 일 이름이 없어요. 예: "/todo 견적서 검토 15:00"' }
  return due === undefined ? { title, tag, day } : { title, tag, due, day }
}

/** Where a task shows: done ones in 완료, later days in 예정, today's and overdue ones in 오늘. */
export const tabOf = (t: Task, today: string): Tab => (t.done ? '완료' : t.day > today ? '예정' : '오늘')

/** A tab's cards: by day, then by time (no time last), then in the order they were added. */
export const listFor = (tasks: readonly Task[], tab: Tab, today: string) =>
  tasks
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => tabOf(t, today) === tab)
    .sort((a, b) => a.t.day.localeCompare(b.t.day) || (a.t.due ?? '99').localeCompare(b.t.due ?? '99') || a.i - b.i)
    .map(({ t }) => t)

/** Today's progress: what was done today over that plus what is still open for today (overdue included). */
export const todayProgress = (tasks: readonly Task[], today: string) => {
  const open = listFor(tasks, '오늘', today).length
  const done = tasks.filter(t => t.done && t.day === today).length
  const total = open + done
  return { done, total, ratio: total === 0 ? 0 : done / total }
}

/** A thin rounded bar, for the pane's progress line. */
export const thinBar = (ratio: number, width: number, track: string, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="10" viewBox="0 0 ${width} 10">` +
  `<rect x="0" y="2" width="${width}" height="6" rx="3" fill="${track}"/>` +
  `<rect x="0" y="2" width="${Math.round(width * Math.min(1, Math.max(0, ratio)))}" height="6" rx="3" fill="${fill}"/></svg>`

/** The ready-made requests the bar's 다음 할 일 buttons put in the prompt box: trimmed, no blanks or repeats, at most 8. */
export const MAX_QUICK = 8
export const cleanQuick = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw
        .filter((q): q is string => typeof q === 'string')
        .map(q => q.trim())
        .filter((q, i, all) => q !== '' && all.indexOf(q) === i)
        .slice(0, MAX_QUICK)
    : []

/** Pairs, for the two-up card grid. */
export const pairs = <T,>(list: readonly T[]): T[][] =>
  list.reduce<T[][]>((rows, x, i) => (i % 2 === 0 ? [...rows, [x]] : [...rows.slice(0, -1), [...rows.at(-1)!, x]]), [])

/** What a saved list looks like after a read: only well-formed tasks survive. */
export const cleanTasks = (raw: unknown): Task[] =>
  Array.isArray(raw)
    ? raw.filter(
        (t): t is Task =>
          typeof t === 'object' && t !== null &&
          typeof t.id === 'string' && typeof t.title === 'string' && typeof t.day === 'string' &&
          typeof t.done === 'boolean' && TAGS.includes(t.tag) && (t.due === undefined || typeof t.due === 'string'),
      )
    : []

/** The card's date line: `⏰ 15:00`, with the day when it is not today. */
export const whenOf = (t: Task, today: string) => {
  const day = t.day === today ? '' : `${Number(t.day.slice(5, 7))}/${Number(t.day.slice(8, 10))} `
  return t.due === undefined && day === '' ? '마감 없음' : `⏰ ${day}${t.due ?? ''}`.trim()
}
