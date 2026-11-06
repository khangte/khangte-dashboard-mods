import { expect, test } from 'claude-code/testing'

import { EFFORTS, planAfter, planView, ringSvg, ringText } from '../hooks/band/control'

const UP = 'mcp__ccd_turn__update_plan'
const PLAN_ITEMS = [
  { content: '자료 읽기', status: 'in_progress' },
  { content: '초안 쓰기', status: 'pending' },
  { content: '검토', status: 'pending' },
  { content: '정리', status: 'pending' },
]
const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'control-center',
  props: { title: '🎛 제어센터', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const

test('checklist: follows the desktop task list, wrap_up, and the CLI TodoWrite; ignores other tools', () => {
  let p = planAfter(null, UP, { items: PLAN_ITEMS, scope: 'first_task' })!
  expect(planView(p)).toEqual({ done: 0, total: 4, ratio: 0, now: '자료 읽기' })
  p = planAfter(p, UP, { advance: true })!
  expect(planView(p)).toMatchObject({ done: 1, now: '초안 쓰기' })
  p = planAfter(p, UP, { done: [2], start: 4 })!
  expect(planView(p)).toMatchObject({ done: 2, now: '정리' })
  expect(planAfter(p, 'Bash', { command: 'ls' })).toBeUndefined()
  p = planAfter(p, 'mcp__ccd_turn__wrap_up', { recap: '...' })!
  expect(planView(p)).toEqual({ done: 4, total: 4, ratio: 1, now: undefined })
  const cli = planAfter(null, 'TodoWrite', { todos: [{ content: 'a', status: 'completed' }, { content: 'b', status: 'in_progress' }] })
  expect(planView(cli ?? null)).toMatchObject({ done: 1, total: 2, now: 'b' })
  expect(planView(null)).toBeUndefined()
})

test('rings, links', () => {
  expect(ringSvg(40)).toContain('>40%<')
  expect(ringSvg(undefined)).toContain('>–<')
  // blue under 40%, yellow from 40, orange from 60, red from 80
  expect(ringSvg(39)).toContain('stroke="#60a5fa"')
  expect(ringSvg(40)).toContain('stroke="#facc15"')
  expect(ringSvg(60)).toContain('stroke="#fb923c"')
  expect(ringSvg(80)).toContain('stroke="#ef4444"')
  expect(ringSvg(90)).toContain('stroke="#ef4444"')
  expect(ringSvg(undefined)).not.toMatch(/#facc15|#fb923c|#ef4444/)
  expect(ringSvg(40)).toContain('fill="#dbeafe"') // light number on the dark app
  expect([ringText(0), ringText(50), ringText(100), ringText(undefined)]).toEqual(['○ 0%', '◑ 50%', '● 100%', '○ –'])
  expect(EFFORTS.map(f => [f.label, f.level])).toEqual([['low', 'low'], ['mid', 'medium'], ['high', 'high']])
})

/** In-memory state and store. */
const wire = (on: any, seed: Record<string, unknown> = {}) => {
  const mem = new Map<string, { value: unknown; version: number }>(
    Object.entries(seed).map(([k, v]) => [k, { value: v, version: 1 }]),
  )
  const kept = new Map<string, unknown>()
  on('clock.now', () => ({ value: Date.parse('2026-11-06T01:00:00Z') }))
  on('state.get', (_: unknown, e: { key: string }) => ({ value: mem.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (kept.set(e.key, e.value), { value: undefined }))
  return { mem, kept }
}

const SEED = {
  usage: { context: 33, session: 43, sessionReset: '2026-11-06T02:49:00Z', week: 14, weekReset: '2026-11-11T06:00:00Z' },
  model: 'claude-opus-5-5',
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`control centre: three rings, the checklist bar, a Model row and an Effort row under it (${surface})`, async ($, on) => {
    const { mem, kept } = wire(on, SEED)
    const ran: string[] = []
    const filled: string[] = []
    on('command.run', (_: unknown, e: { command: string; args: string }) =>
      e.command === 'model' || e.command === 'effort' ? (ran.push(e.args), { text: `Set ${e.command} to ${e.args}` }) : { text: '' },
    )
    on('prompt.fill', (_: unknown, e: { text: string }) => (filled.push(e.text), { isFilled: true, cursor: e.text.length }))
    on('tool.call', () => ({ result: {} }))
    const opened: string[] = []
    on('ui.open', (_: unknown, e: { id: string }) => (opened.push(e.id), { value: { isPlaced: true } }))

    // Claude makes a checklist and moves one step on
    await $.tool.call({ tool: UP, items: PLAN_ITEMS, scope: 'first_task' })
    await $.tool.call({ tool: UP, advance: true })
    expect(mem.get('plan')?.value).toMatchObject({ items: [{ status: 'completed' }, { status: 'in_progress' }, {}, {}] })


    const ui = await $.ui.mount({ ...PANE, surface })
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    for (const label of ['컨텍스트', '5시간 한도', '주간 한도']) expect(texts).toContain(label)
    expect(texts).not.toContain('이번 작업') // the checklist bar is above the prompt only
    expect(texts).toContain('↻1h49')
    if (surface === 'desktop') {
      const svgs = await ui.findAll({ type: 'Svg' })
      expect(svgs.map(s => s.props.alt)).toEqual(['컨텍스트 33%', '5시간 한도 43%', '주간 한도 14%'])
    } else {
      expect(texts).toContain('◑ 43%')
    }
    expect(texts.join('')).not.toMatch(/\$|원|USD|cost/i) // no money anywhere
    expect(await ui.find({ type: 'Link' })).toBeUndefined() // no music link any more
    expect(texts.join('')).not.toContain('control-music')
    expect(texts).not.toContain('대화 기억')
    // Model on one line, Effort on the next
    expect(texts).toContain('Model ')
    expect(texts).toContain('Effort')
    expect(texts.indexOf('Model ')).toBeLessThan(texts.indexOf('Effort'))
    const keys = (await ui.findAll({ type: 'Button' })).map(b => b.key)
    expect(keys).toEqual(expect.arrayContaining(['effort-low', 'effort-medium', 'effort-high']))
    expect(keys.indexOf('model-claude-sonnet-5-5')).toBeLessThan(keys.indexOf('effort-low'))
    expect((await ui.find({ key: 'effort-medium' }))?.text).toBe('mid')
    await ui.press({ key: 'effort-high' })
    expect(ran).toEqual(['high']) // /effort high, run straight away
    ran.length = 0

    expect((await ui.find({ key: 'model-claude-opus-5-5' }))?.props.variant).toBe('primary') // the current one
    await ui.press({ key: 'model-claude-sonnet-5-5' })
    expect(ran).toEqual(['sonnet']) // /model sonnet, switched directly, nothing typed
    expect(filled).toEqual([])
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface }) // the chosen ones are lit
    expect((await again.find({ key: 'model-claude-sonnet-5-5' }))?.props.variant).toBe('primary')
    expect((await again.find({ key: 'effort-high' }))?.props.variant).toBe('primary')
    await again.unmount()

    // the bar's 🎛 button opens it
    const bar = await $.ui.mount({ ...BAND, surface })
    await bar.press({ key: 'open-control' })
    expect(opened).toEqual(['control-center'])
    await bar.unmount()
  })
}

test('a command that fails after running fills nothing into the prompt box', async ($, on) => {
  wire(on, SEED)
  const filled: string[] = []
  on('command.run', () => {
    throw new Error('refused')
  })
  on('prompt.fill', (_: unknown, e: { text: string }) => (filled.push(e.text), { isFilled: true, cursor: e.text.length }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'model-claude-sonnet-5-5' })
  await ui.press({ key: 'effort-low' })
  expect(filled).toEqual([])
  await ui.unmount()
})
