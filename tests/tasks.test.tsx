import { expect, test } from 'claude-code/testing'

import type { Task } from '../types'

import { cleanTasks, dayOf, listFor, pairs, parseTodo, tabOf, todayProgress, whenOf } from '../hooks/tasks/tasks'

const NOW = new Date(2026, 10, 6, 9, 0, 0).getTime() // Fri 2026-11-06 09:00
const TODAY = '2026-11-06'
const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'today-tasks',
  props: { title: '오늘의 작업', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const SAMPLE: Task[] = [
  { id: 'a', title: '견적서 검토', tag: '급함', due: '15:00', day: TODAY, done: false },
  { id: 'b', title: '주간 보고 초안', tag: '업무', due: '11:00', day: TODAY, done: false },
  { id: 'c', title: '거래처 회신', tag: '중요', day: TODAY, done: false },
  { id: 'd', title: '회의록 정리', tag: '업무', due: '17:30', day: TODAY, done: false },
  { id: 'e', title: '월말 결산 준비', tag: '중요', due: '10:00', day: '2026-11-09', done: false },
  { id: 'f', title: '출장비 정산', tag: '업무', day: TODAY, done: true },
]

test('/todo text: name, time, day words and tags', () => {
  expect(parseTodo('견적서 검토 15:00', NOW)).toEqual({ title: '견적서 검토', tag: '업무', due: '15:00', day: TODAY })
  expect(parseTodo('#급함 거래처 전화 9:05', NOW)).toEqual({ title: '거래처 전화', tag: '급함', due: '09:05', day: TODAY })
  expect(parseTodo('보고서 제출 내일 #중요', NOW)).toEqual({ title: '보고서 제출', tag: '중요', day: '2026-11-07' })
  expect(parseTodo('결산 11/30 10:00', NOW)).toMatchObject({ day: '2026-11-30', due: '10:00' })
  expect(parseTodo('회의 25:00', NOW)).toMatchObject({ title: '회의 25:00' }) // not a time, kept in the name
  expect('error' in parseTodo('  15:00 ', NOW)).toBe(true)
})

test('tabs, order, pairs, card time line, and a saved list read back', () => {
  expect(SAMPLE.map(t => tabOf(t, TODAY))).toEqual(['오늘', '오늘', '오늘', '오늘', '예정', '완료'])
  expect(listFor(SAMPLE, '오늘', TODAY).map(t => t.id)).toEqual(['b', 'a', 'd', 'c']) // by time, no time last
  expect(pairs([1, 2, 3])).toEqual([[1, 2], [3]])
  expect(whenOf(SAMPLE[0]!, TODAY)).toBe('⏰ 15:00')
  expect(whenOf(SAMPLE[4]!, TODAY)).toBe('⏰ 11/9 10:00')
  expect(whenOf(SAMPLE[2]!, TODAY)).toBe('마감 없음')
  expect(dayOf(NOW)).toBe(TODAY)
  expect(cleanTasks([...SAMPLE, { id: 1 }, 'x', { ...SAMPLE[0], tag: '기타' }])).toEqual(SAMPLE)
  expect(cleanTasks(undefined)).toEqual([])
  expect(todayProgress(SAMPLE, TODAY)).toEqual({ done: 1, total: 5, ratio: 0.2 }) // 4 open today + 1 done today; 11/9's is not today's
  expect(todayProgress([], TODAY).total).toBe(0)
})

/** In-memory $.state and $.store, as the host keeps them. */
const wire = (on: any, seed: Record<string, unknown> = {}) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  const kept = new Map<string, unknown>(Object.entries(seed))
  on('clock.now', () => ({ value: NOW }))
  on('state.get', (_: unknown, e: { key: string }) => ({ value: mem.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (kept.set(e.key, e.value), { value: undefined }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  return kept
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`pane: greeting, count, tabs, two-up cards; ○ fills and moves to 완료; saved (${surface})`, async ($, on) => {
    const kept = wire(on, { tasks: SAMPLE })
    const opened: string[] = []
    const filled: string[] = []
    on('ui.open', (_: unknown, e: { id: string }) => (opened.push(e.id), { value: { isPlaced: true } }))
    on('prompt.fill', (_: unknown, e: { text: string }) => (filled.push(e.text), { isFilled: true, cursor: e.text.length }))
    await $.session.start({ cwd: '/', surface, isInteractive: true }) // reads the saved list

    const pane = () => $.ui.mount({ ...PANE, surface }) // a fresh mount stands for the host's redraw
    let ui = await pane()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(texts).toContain('좋은 아침이에요') // no name until /todo-name sets one
    expect(texts).toContain('오늘 끝낼 일 4개')
    expect(texts).toContain('1/5 완료 · 20%') // today's progress, the to-do dog's old job
    expect((await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('tab-'))).toEqual(['tab-오늘', 'tab-예정', 'tab-완료'])
    expect((await ui.find({ key: 'tab-오늘' }))?.text).toBe('오늘 4')
    // four cards, two to a row, each with its tag and time
    const rows = (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('row-'))
    expect(rows).toHaveLength(2)
    expect(texts).toContain(' 급함 ')
    expect(texts).toContain('⏰ 15:00')
    expect((await ui.find({ key: 'done-a' }))?.text).toBe('○')

    await ui.press({ key: 'done-a' })
    expect((kept.get('tasks') as Task[]).find(t => t.id === 'a')?.done).toBe(true)
    await ui.press({ key: 'add' })
    expect(filled).toEqual(['/todo '])
    // ✕ deletes a card for good
    expect(await ui.find({ key: 'del-b' })).toBeDefined()
    await ui.press({ key: 'del-b' })
    expect((kept.get('tasks') as Task[]).map(t => t.id)).not.toContain('b')
    await ui.unmount()

    ui = await pane()
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('오늘 끝낼 일 2개') // a done and b deleted
    await ui.press({ key: 'tab-완료' })
    await ui.unmount()

    ui = await pane()
    expect((await ui.find({ key: 'done-a' }))?.text).toBe('●') // filled, now under 완료
    expect(await ui.find({ key: 'done-f' })).toBeDefined()
    expect(await ui.find({ key: 'done-b' })).toBeUndefined()
    await ui.unmount()

    // /todo adds, saves and opens the pane; /todo-name changes the greeting
    const r = await $.command.run({ command: 'todo', args: '견적서 검토 15:00' })
    expect(r.text).toBe('추가했어요: 견적서 검토 · ⏰ 15:00 · #업무')
    expect((kept.get('tasks') as Task[]).at(-1)).toMatchObject({ title: '견적서 검토', due: '15:00', done: false })
    expect(opened.at(-1)).toBe('today-tasks')
    expect((await $.command.run({ command: 'todo', args: '#급함' })).text).toContain('할 일 이름이 없어요')
    await $.command.run({ command: 'todo-name', args: '홍길동' })
    ui = await pane()
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('좋은 아침, 홍길동님')
    await ui.unmount()
  })
}


test('🗓 오늘 할 일: greeting, then 🍅 집중 타이머, then ☑ 할 일 목록, set off by rules', async ($, on) => {
  wire(on)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const rules = texts.map((t, i) => (/^─{10,}$/.test(t) ? i : -1)).filter(i => i >= 0)
  expect(rules).toHaveLength(2)
  const at = (s: string) => texts.findIndex(t => t.startsWith(s))
  const order = [at('좋은 아침'), rules[0]!, at('🍅 집중 타이머'), at('25:00'), rules[1]!, at('☑ 할 일 목록')]
  expect(order.every(i => i >= 0)).toBe(true)
  expect([...order].sort((x, y) => x - y)).toEqual(order)
  expect(at('다음 할 일 단추')).toBe(-1)
  expect(await ui.find({ key: 'quick-add' })).toBeUndefined()
  await ui.unmount()
})
