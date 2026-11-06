import { expect, mock, test } from 'claude-code/testing'

import type { Pomo } from '../types'

import {
  DEFAULT_MINUTES, advance, clock, freshPomo, parseMinutes, pause, progress, remaining, reset, rollDay, skip, start, tomatoSvg,
} from '../hooks/tasks/pomodoro'

const DAY = '2026-11-06'
const T0 = new Date(2026, 10, 6, 9, 0, 0).getTime()
const M = DEFAULT_MINUTES
const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'today-tasks',
  props: { title: '오늘의 작업', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

test('timer: start, count down, pause, skip, reset, finished phases roll over, new day zeroes', () => {
  const p0 = freshPomo(DAY)
  expect(clock(remaining(p0, T0))).toBe('25:00')
  const p1 = start(p0, T0)
  expect(clock(remaining(p1, T0 + 1_000))).toBe('24:59')
  expect(progress(p1, T0 + 12.5 * 60_000, M)).toBe(0.5)
  const p2 = pause(p1, T0 + 60_000)
  expect(clock(remaining(p2, T0 + 10 * 60_000))).toBe('24:00') // frozen while paused
  expect(start(p2, T0 + 10 * 60_000).endsAt).toBe(T0 + 10 * 60_000 + 24 * 60_000)

  const s = skip(p1, T0, M)
  expect([s.mode, s.status, clock(s.leftMs)]).toEqual(['rest', 'running', '05:00'])
  expect(skip(p0, T0, M).status).toBe('idle')
  expect(reset({ ...s, done: 3 }, M)).toEqual({ ...freshPomo(DAY), done: 3 })

  const { pomo, events } = advance(p1, T0 + 25 * 60_000, M)
  expect(events).toEqual(['focus-done'])
  expect([pomo.mode, pomo.done, pomo.endsAt]).toEqual(['rest', 1, T0 + 30 * 60_000])
  const later = advance(p1, T0 + 31 * 60_000, M)
  expect(later.events).toEqual(['focus-done', 'rest-done'])
  expect([later.pomo.mode, later.pomo.done]).toEqual(['focus', 1])

  expect(rollDay({ ...p1, done: 4 }, '2026-11-07')).toMatchObject({ done: 0, day: '2026-11-07' })
  expect(parseMinutes('1 1')).toEqual({ focus: 1, rest: 1 })
  expect(parseMinutes('25')).toEqual({ focus: 25, rest: 5 })
  expect(parseMinutes('0 5')).toBeUndefined()
})

test('tomato: reddens from the bottom, eyes close while resting', () => {
  const reds = (svg: string) => (svg.match(/#e53935/g) ?? []).length
  expect(reds(tomatoSvg(0, false))).toBe(0)
  expect(reds(tomatoSvg(0.5, false))).toBeGreaterThan(0)
  expect(reds(tomatoSvg(1, false))).toBeGreaterThan(reds(tomatoSvg(0.5, false)))
  // the lowest body row turns red first
  expect(tomatoSvg(0.1, false)).toContain('y="60" width="5" height="5" fill="#e53935"')
  expect(tomatoSvg(0.1, false)).not.toContain('y="15" width="5" height="5" fill="#e53935"')
  const eyes = (svg: string) => (svg.match(/fill="#1b1b1b"/g) ?? []).length
  expect(eyes(tomatoSvg(1, false)) - eyes(tomatoSvg(1, true))).toBe(4) // • • become - -
  expect(tomatoSvg(1, false)).toContain('#43a047') // green leaves
})

/** In-memory state and store; the clock is the kit's. */
const wire = (on: any) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  const kept = new Map<string, unknown>()
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
  return { mem, kept }
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`a 1-minute run: focus ripens, ends with a notice, rests, comes back to focus; back to 25 (${surface})`, async ($, on) => {
    const time = mock.clock(on, { now: T0 })
    const { mem, kept } = wire(on)
    const toasts: string[] = []
    const notes: string[] = []
    on('ui.toast', (_: unknown, e: { text: string }) => (toasts.push(e.text), { value: undefined }))
    on('ui.notify', (_: unknown, e: { text: string }) => (notes.push(e.text), { value: { isSent: true, channel: 'auto' } }))
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const pomo = () => mem.get('pomo')?.value as Pomo
    const pane = async () => {
      const ui = await $.ui.mount({ ...PANE, surface })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      return { ui, texts }
    }

    expect((await $.command.run({ command: 'pomodoro', args: '1 1' })).text).toBe('포모도로: 집중 1분 · 휴식 1분')
    let { ui, texts } = await pane()
    expect(texts).toContain('01:00')
    expect(texts.some(t => t.startsWith('집중 1분 · 완료 아직 없음'))).toBe(true)
    expect((await ui.find({ key: 'pomo-toggle' }))?.text).toBe('▶ 시작') // stopped: one button that starts
    expect(await ui.find({ key: 'pomo-start' })).toBeUndefined()
    expect(await ui.find({ key: 'pomo-pause' })).toBeUndefined()
    await ui.press({ key: 'pomo-toggle' })
    await ui.unmount()

    await time.advance(30_000)
    ;({ ui, texts } = await pane())
    expect(texts).toContain('00:30')
    if (surface === 'desktop') {
      const svg = String((await ui.find({ type: 'Svg' }))?.props.source)
      expect(svg).toContain('#e53935') // half ripe
      expect(svg).toContain('#c5e1a5')
    }
    await ui.unmount()

    await time.advance(31_000) // past the minute
    expect(pomo()).toMatchObject({ mode: 'rest', status: 'running', done: 1 })
    expect(toasts).toEqual(['🟢 집중 01:00 시작!', '🔴 집중 1분 끝! 1분 쉬어요']) // started, then ended
    expect(notes).toEqual(['🟢 집중 01:00 시작!', '🔴 집중 1분 끝! 1분 쉬어요'])
    expect(kept.get('pomo-done')).toEqual({ day: DAY, done: 1 })
    ;({ ui, texts } = await pane())
    expect(texts.some(t => t.startsWith('휴식 1분 · 완료 🍅'))).toBe(true)
    if (surface === 'terminal') expect(texts).toContain('🍅 - ‿ -')
    await ui.unmount()

    await time.advance(60_000) // the rest ends: back to focus on its own
    expect(pomo()).toMatchObject({ mode: 'focus', status: 'running', done: 1 })
    expect(toasts.at(-1)).toBe('🟢 휴식 끝! 다시 1분 집중해요')

    // pause holds the time; ↺ goes back to a stopped focus; then restore 25 / 5
    ;({ ui } = await pane())
    expect((await ui.find({ key: 'pomo-toggle' }))?.text).toBe('⏸ 일시정지') // running: the same button pauses
    await ui.press({ key: 'pomo-toggle' })
    await ui.unmount()
    const held = remaining(pomo(), 0)
    await time.advance(20_000)
    expect(remaining(pomo(), 0)).toBe(held)
    ;({ ui } = await pane())
    expect((await ui.find({ key: 'pomo-toggle' }))?.text).toBe('▶ 시작') // paused: it offers to start again
    await ui.press({ key: 'pomo-toggle' })
    await ui.unmount()
    expect(pomo()).toMatchObject({ status: 'running', leftMs: held }) // carries on from where it stopped
    ;({ ui } = await pane())
    await ui.press({ key: 'pomo-toggle' })
    await ui.unmount()
    ;({ ui } = await pane())
    await ui.press({ key: 'pomo-reset' })
    await ui.unmount()
    expect((await $.command.run({ command: 'pomodoro', args: '25 5' })).text).toBe('포모도로: 집중 25분 · 휴식 5분')
    expect(kept.get('pomo-minutes')).toBe('25 5')
    ;({ ui, texts } = await pane())
    expect(texts).toContain('25:00')
    expect(texts.some(t => t.startsWith('집중 25분 · 완료 🍅'))).toBe(true) // today's tomato kept
    await ui.unmount()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`minute fields set focus and rest; a bad number changes nothing (${surface})`, async ($, on) => {
    mock.clock(on, { now: T0 })
    const { mem, kept } = wire(on)
    const toasts: string[] = []
    on('ui.toast', (_: unknown, e: { text: string }) => (toasts.push(e.text), { value: undefined }))
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.input({ key: 'pomo-focus', text: '40' }) // its own 적용: focus alone
    expect(kept.get('pomo-minutes')).toBe('40 5')
    await ui.input({ key: 'pomo-rest', text: '0' }) // out of range: nothing changes
    expect(kept.get('pomo-minutes')).toBe('40 5')
    await ui.input({ key: 'pomo-rest', text: '10' })
    expect(mem.get('minutes')?.value).toEqual({ focus: 40, rest: 10 })
    expect(toasts).toEqual(['집중 시간을 40분으로 바꿨어요', '1~180 사이의 분을 적어 주세요', '휴식 시간을 10분으로 바꿨어요'])
    expect(await ui.find({ key: 'pomo-apply' })).toBeUndefined() // no shared button
    await ui.unmount()
    const again = await $.ui.mount({ ...PANE, surface })
    expect((await again.findAll({ type: 'Text' })).map(t => t.text)).toContain('40:00') // the stopped timer took it
    await again.unmount()
  })
}

