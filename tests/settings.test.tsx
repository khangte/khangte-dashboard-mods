import { expect, test } from 'claude-code/testing'

import { BANDS, DEFAULT_SETTINGS, normalize, shift, toggle, visible } from '../hooks/band/layout'

const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'mods-settings',
  props: { title: '⚙ 모즈 설정', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const
const NOW = new Date(2026, 10, 5, 12, 0, 0).getTime()
const DEFAULT_ORDER = ['todo', 'leave', 'usage', 'sys', 'shield', 'chips', 'plan']

test('layout: defaults all on in one column, saved order kept, bad or old values fall back, new ids join at the end', () => {
  expect(Object.values(DEFAULT_SETTINGS.enabled).every(Boolean)).toBe(true)
  expect(DEFAULT_SETTINGS.order).toEqual(DEFAULT_ORDER)
  expect(Object.keys(DEFAULT_SETTINGS.enabled)).toEqual([...DEFAULT_ORDER, 'spinner', 'tasks', 'control'])

  const saved = normalize({ version: 3, enabled: { sys: false, leave: 'no', dog: false }, order: ['chips', 'chips', 'nope', 7, 'dog', 'sys'] })
  expect(saved.enabled.sys).toBe(false)
  expect(saved.enabled.leave).toBe(true)
  expect('dog' in saved.enabled).toBe(false) // the retired dog band is forgotten
  // duplicates and unknown ids dropped; a band the file never had (a new mod) joins beside its registry neighbour
  expect(saved.order).toEqual(['todo', 'leave', 'usage', 'chips', 'plan', 'sys', 'shield'])
  // an order saved before the box gauge existed: the gauge goes on top, the rest keeps its order
  expect(normalize({ version: 3, order: ['leave', 'chips', 'usage', 'sys', 'shield', 'plan'] }).order)
    .toEqual(['todo', 'leave', 'chips', 'usage', 'sys', 'shield', 'plan'])
  expect(normalize(null)).toEqual(DEFAULT_SETTINGS)

  // the 3x3 layout saved before: its cells give way to the default order, its switches stay
  const old = normalize({ version: 2, enabled: { sys: false }, cell: { chips: 0, dog: 3 } })
  expect(old.order).toEqual(DEFAULT_ORDER)
  expect(old.enabled.sys).toBe(false)
  expect(BANDS.length).toBe(7)
})

test('layout: shift moves one place, stays put at the ends; visible skips switched-off bands', () => {
  expect(shift(DEFAULT_SETTINGS, 'leave', -1).order.slice(0, 2)).toEqual(['leave', 'todo'])
  expect(shift(DEFAULT_SETTINGS, 'todo', -1)).toBe(DEFAULT_SETTINGS) // already on top
  expect(shift(DEFAULT_SETTINGS, 'plan', 1)).toBe(DEFAULT_SETTINGS) // already at the bottom
  expect(shift(DEFAULT_SETTINGS, 'usage', 1).order).toEqual(['todo', 'leave', 'sys', 'usage', 'shield', 'chips', 'plan'])
  expect(visible(toggle(DEFAULT_SETTINGS, 'sys'))).toEqual(['todo', 'leave', 'usage', 'shield', 'chips', 'plan'])
})

/** An in-memory $.state and $.store for a test. */
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
  return { mem, kept }
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`panel: switches and ▲▼ apply at once and are saved; no reset button (${surface})`, async ($, on) => {
    const { kept } = wire(on)
    const saved = () => kept.get('mods-settings') as { enabled: Record<string, boolean>; order: string[] }
    // the host redraws on every state write; a fresh mount stands for that redraw here
    const panel = () => $.ui.mount({ ...PANE, surface })

    let ui = await panel()
    expect(await ui.findAll({ type: 'Button', text: /^켜짐$/ })).toHaveLength(10) // seven bands, the spinner, the tasks pane and the control centre (no memo switch)
    expect(await ui.find({ key: 'cell-0' })).toBeUndefined() // no 3x3 board any more
    const names = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    expect(names.some(t => t.endsWith('⚡ 빠른 요청 단추'))).toBe(true) // the names match the panes and buttons
    expect(names).toContain('🗓 오늘 할 일')
    expect(names).toContain('🎛 Claude 도구')
    expect(names.some(t => /다음 할 일 단추 \(|오늘의 작업 \(/.test(t))).toBe(false)
    await ui.press({ key: 'sw-sys' })
    expect(saved().enabled.sys).toBe(false)
    await ui.unmount()

    ui = await panel()
    await ui.press({ key: 'up-chips' })
    expect(saved().order).toEqual(['todo', 'leave', 'usage', 'sys', 'chips', 'shield', 'plan'])
    await ui.unmount()

    ui = await panel()
    await ui.press({ key: 'down-leave' })
    expect(saved().order.slice(0, 3)).toEqual(['todo', 'usage', 'leave'])
    await ui.press({ key: 'sw-spinner' })
    expect(saved().enabled.spinner).toBe(false)
    await ui.unmount()

    ui = await panel()
    expect((await ui.find({ type: 'Text', text: /^1\./ }))?.text).toBe('1. ☑ 오늘 할 일 게이지 (/todo)')
    expect(await ui.find({ key: 'reset' })).toBeUndefined() // 처음 배치로 되돌리기 is gone
    expect((await ui.findAll({ type: 'Button' })).map(b => b.text)).not.toContain('처음 배치로 되돌리기')
    await ui.unmount()
  })

  test(`bar: one column in the saved order, a switched-off band gone, ⚙ beside the last (${surface})`, async ($, on) => {
    wire(on, { 'mods-settings': { version: 3, enabled: { sys: false }, order: ['chips', 'leave', 'usage', 'sys', 'shield'] } })
    on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
    on('command.register', () => ({ value: { command: 'x' } }))
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
    on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
    on('fs.exists', () => ({ value: true }))
    on('fs.read', () => ({ value: '- [ ] a\n- [x] b' }))
    await $.session.start({ cwd: '/', surface, isInteractive: true }) // loads the saved settings

    const ui = await $.ui.mount({ ...BAND, surface })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const at = (re: RegExp) => all.findIndex(t => re.test(t))
    expect(at(/CPU/)).toBe(-1) // the computer row is off
    expect(at(/다음 할 일/)).toBeLessThan(at(/퇴근/))
    expect(at(/퇴근/)).toBeLessThan(at(/SESSION/))
    const buttons = (await ui.findAll({ type: 'Button' })).map(b => b.key)
    expect(buttons.at(-4)).toBe('toggle-shield') // the bottom row: 가림 switch…
    expect(buttons.at(-3)).toBe('open-tasks') // …📋 오늘의 작업
    expect(buttons.at(-2)).toBe('open-control') // …🎛 제어센터
    expect(buttons).not.toContain('open-memo') // the 📝 메모 button is gone
    expect(buttons.at(-1)).toBe('open-settings') // …and ⚙, bottom right
    await ui.unmount()
  })
}
