import { expect, mock, test } from 'claude-code/testing'

import { chips, dogSvg, fit, left, parseSys, weather } from '../hooks/band/register'

const NOW = Date.parse('2026-11-05T10:00:00Z')
const USAGE = {
  session: 54, sessionReset: '2026-11-05T12:00:00Z',
  week: 88, weekReset: '2026-11-09T03:00:00Z',
  context: 14,
}
const band = (bodyColumns: number) => ({
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns, scroll: { offset: 0, bodyRows: 10 } },
}) as const

// Cells the drawn row takes, counted from what it shows (emoji as 2 cells, an Svg by its px).
const width = (texts: string[], svgPx: number[]) =>
  texts.join('').replace(/[⏱📅]/gu, '  ').length + svgPx.reduce((a, b) => a + b / 8, 0)

test('helpers', () => {
  expect(left('2026-11-05T12:00:00Z', NOW)).toBe('2h00')
  expect(left('2026-11-09T03:00:00Z', NOW)).toBe('3d17h')
  expect(left(undefined, NOW)).toBe('–')
  expect([weather(10), weather(50), weather(70), weather(85), weather()]).toEqual(['☀', '☁', '☂', '⚡', '–'])
  expect(fit(300, 15)).toEqual({ bar: 15, showReset: true })
  expect(fit(90, 15).showReset).toBe(true)
  expect(fit(70, 15).showReset).toBe(false)
})

for (const surface of ['terminal', 'desktop'] as const) {
  test(`one row at every width on ${surface}`, async ($, on) => {
    on('state.get', (_, e) => ({ value: { value: e.key === 'usage' ? USAGE : null, version: 1 } }))
    on('clock.now', () => ({ value: NOW }))

    let lastBar = Infinity
    for (const columns of [200, 120, 90, 75, 64]) {
      const ui = await $.ui.mount({ ...band(columns), surface })
      const texts = (await ui.findAll({ type: 'Text' })).filter(t => t.children.every(c => typeof c === 'string')).map(t => t.text)
      texts.splice(texts.findIndex(t => t.startsWith('🖥'))) // the system row is below; this test counts the usage row
      texts.splice(0, texts.findIndex(t => t.startsWith('⏱'))) // and the 퇴근 row above
      const svgs = (await ui.findAll({ type: 'Svg' })).filter(s => s.props.alt !== ' ').slice(1, 4) // [0] is the dog's; row struts left out
      const all = texts.join('')
      const bar = surface === 'desktop' ? (svgs[0]?.props.width as number) : (all.match(/[█░]+/)?.[0].length ?? 0)

      expect(all).toContain('SESSION [')
      if (surface === 'terminal') expect(all).toMatch(/[█░]/) // text bars, not pictures
      expect(all).toContain('CONTEXT [')
      expect(all).toContain('54%')
      expect(all).toContain('☀')
      expect(bar).toBeLessThanOrEqual(lastBar) // bars shrink first
      lastBar = bar
      if (surface === 'desktop') {
        expect(svgs).toHaveLength(3)
        expect(new Set(svgs.map(s => s.props.width)).size).toBe(1) // same width for all three
        expect(svgs[0]?.props.height).toBe(18) // no taller than a line of text
        expect(bar).toBeLessThanOrEqual(120)
        expect(String(svgs[1]?.props.source)).toContain('#fb923c') // WEEK 88% → orange
        expect(width(texts.filter(t => !/[█░]/.test(t)), svgs.map(s => s.props.width as number))).toBeLessThanOrEqual(columns)
      } else {
        expect(width(texts.filter(t => !/^[█░]+$/.test(t)), [])).toBeLessThanOrEqual(columns)
      }
      expect(all.includes('↻')).toBe(columns >= 90) // then the ↻ times go
      await ui.unmount()
    }
  })
}

test('unread values show –', async ($, on) => {
  on('state.get', (_, e) => ({ value: { value: e.key === 'usage' ? { context: 40 } : null, version: 1 } }))
  on('clock.now', () => ({ value: NOW }))
  const ui = await $.ui.mount({ ...band(200), surface: 'desktop' })
  const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
  expect(all).toContain(' –')
  expect(all).toContain('↻–')
  expect(all).toContain('40%')
  await ui.unmount()
})

test('system values parse, and unreadable ones stay empty', () => {
  expect(parseSys('{"cpu":23,"total":16493912,"free":2530188,"bat":82}')).toEqual({
    cpu: 23, ram: 85, ramUsedGb: 13.3, ramTotalGb: 16, battery: 82,
  })
  expect(parseSys('{"cpu":null,"total":16000000,"free":4000000,"bat":null}').battery).toBeUndefined() // desktop PC: no battery
  expect(parseSys('not json')).toEqual({})
})

test('system row shows, one row each at narrow width', async ($, on) => {
  on('state.get', (_, e) => ({
    value: { value: e.key === 'sys' ? { cpu: 23, ram: 70, ramUsedGb: 11.2, ramTotalGb: 16, battery: 82 } : e.key === 'usage' ? USAGE : null, version: 1 },
  }))
  on('clock.now', () => ({ value: NOW }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...band(64), surface })
    const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('|')
    expect(all).toContain('CPU [')
    expect(all).toContain('23%')
    expect(all).toContain('11.2/16GB')
    expect(all).toContain('82%')
    await ui.unmount()
  }
})

test('polls every 5 seconds without a model call', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'workhours' } }))
  let runs = 0
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('state.set', () => ({ value: { isSet: true, version: 1 } }))
  on('clock.now', () => ({ value: NOW }))
  const every: Array<[number, () => void]> = []
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('process.run', () => (runs++, { value: { exitCode: 0, stdout: '{"cpu":1}', stderr: '' } }))
  on('clock.every', (_, e) => (every.push([e.ms, e.fn]), { value: () => {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(every.some(([ms]) => ms === 5000)).toBe(true)
  for (let i = 0; i < 50; i++) await Promise.resolve() // let the unawaited first poll finish before the test ends
  expect(runs).toBeGreaterThan(0)
})

const DOG_PX = ['#B07A42', '#6E4123', '#1B1B1B', '#E2C08E']
const rectsOf = (svg: string) => [...svg.matchAll(/<rect x="(-?\d+)" y="(\d+)" width="(\d+)" height="2" fill="(#\w+)"/g)]
const dogOnly = (svg: string) => rectsOf(svg).filter(m => !['#EF4444', '#aab3c5', '#fb923c'].includes(m[4]!)) // not the track

test('the dog is the user pixel map at 30x18, only the two leg rows move', () => {
  const a = dogOnly(dogSvg(0, 200, 0))
  const b = dogOnly(dogSvg(0, 200, 1))
  const key = (rs: typeof a, isLeg: boolean) =>
    rs.filter(m => (Number(m[2]) >= 14) === isLeg).map(m => `${m[1]},${m[2]},${m[3]},${m[4]}`).sort().join(';')
  expect(key(a, false)).toBe(key(b, false)) // body identical
  expect(key(a, true)).not.toBe(key(b, true)) // legs differ
  expect([...new Set(a.map(m => m[4]))].sort()).toEqual([...DOG_PX].sort())
  expect(a.filter(m => m[2] === '0').map(m => m.slice(1, 4).join())).toEqual(['16,0,10']) // row 0: 5 dots from dot 8
  expect(Math.max(...a.map(m => Number(m[1]) + Number(m[3])))).toBe(30)
  expect(Math.max(...a.map(m => Number(m[2]) + 2))).toBe(18) // 0..18 = 18px tall
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`퇴근 gauge: the dog walks as the workday goes, orange near the end, waits at the flag after (${surface})`, async ($, on) => {
    let now = new Date(2026, 10, 5, 9, 0, 0).getTime() // Thursday, local time
    on('clock.now', () => ({ value: now }))
    on('state.get', (_, e) => ({
      value: { value: e.key === 'hours' ? { start: '09:00', end: '18:00' } : e.key === 'frame' ? 1 : null, version: 1 },
    }))
    const look = async (h: number, m: number) => {
      now = new Date(2026, 10, 5, h, m, 0).getTime()
      const ui = await $.ui.mount({ ...band(120), surface })
      const all = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('')
      const svg = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('퇴근까지'))
      const source = String(svg?.props.source ?? '')
      await ui.unmount()
      const x = Math.min(...dogOnly(source).map(m => Number(m[1])))
      const steps = all.match(/🏠(─*)🐕/u)?.[1]?.length ?? -1
      return { all, x, source, steps, alt: String(svg?.props.alt ?? '') }
    }

    const morning = await look(10, 0)
    const noon = await look(13, 30)
    const late = await look(17, 52) // 8 minutes left
    const after = await look(19, 0)
    expect(noon.all).toContain('4:30:00 남음 · 50%')
    expect(late.all).toContain('정리할 시간이에요')
    expect(after.all).toContain('퇴근 시간 지났어요')
    expect(morning.all).not.toMatch(/[▰▱]/) // the old gauge is gone
    if (surface === 'desktop') {
      expect(noon.alt).toBe('퇴근까지 50%')
      expect(noon.x).toBeGreaterThan(morning.x) // walked right
      expect(late.x).toBeGreaterThan(noon.x)
      expect(late.source).toContain('fill="#fb923c"') // orange trail in the last half hour
      expect(noon.source).toContain('fill="#EF4444"') // the usual red trail
      expect(after.source).toBe(dogSvg(after.x, 240, 0, '#EF4444')) // at the flag, legs still
      expect(noon.source).toBe(dogSvg(noon.x, 240, 1, '#EF4444')) // mid-walk frame
    } else {
      expect(noon.steps).toBeGreaterThan(morning.steps)
    }
  })
}

const QUICK = ['/ponytail-audit', '방금 고친 것 검토해 줘', 'F5 PDF 여백 확인 및 최종 점검까지 모두 끝내기']

test('chips: one per request set in the pane, in its order, the text kept as written', () => {
  const c = chips(QUICK)
  expect(c.map(x => x.text)).toEqual(['▶ /ponytail-audit', '▶ 방금 고친 것 검토해 줘', '▶ F5 PDF 여백 확인 및 최종 점검까지…'])
  expect(c.every(x => x.text.length <= 25)).toBe(true)
  expect(c.map(x => x.prompt)).toEqual(QUICK) // filled exactly as written, long ones whole
  expect(chips([])).toEqual([])
  expect(chips(null)).toEqual([])
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`chips come from the pane's list, not the to-dos; pressing only fills the prompt box (${surface})`, async ($, on) => {
    on('clock.now', () => ({ value: NOW }))
    let quick: string[] = QUICK
    const tasks = [{ title: '할 일 카드', day: '2026-11-05', done: false }]
    on('state.get', (_, e) => ({
      value: { value: e.key === 'quick' ? quick : e.key === 'tasks' ? tasks : undefined, version: 1 },
    }))
    const filled: string[] = []
    let submitted = 0
    on('prompt.fill', (_, e) => (filled.push(e.text), { isFilled: true, cursor: e.text.length }))
    on('prompt.submit', (_, e) => (submitted++, { text: e.text }))

    let ui = await $.ui.mount({ ...band(120), surface })
    const labels = (await ui.findAll({ type: 'Button' })).map(b => b.text).filter(t => t.startsWith('▶'))
    expect(labels).toEqual(['▶ /ponytail-audit', '▶ 방금 고친 것 검토해 줘', '▶ F5 PDF 여백 확인 및 최종 점검까지…'])
    expect(labels).not.toContain('▶ 할 일 카드') // the to-do cards no longer feed the chips
    await ui.press({ key: 'go0' })
    expect(filled).toEqual(['/ponytail-audit'])
    expect(submitted).toBe(0) // never sent
    await ui.unmount()

    quick = [] // nothing set: the row hides
    ui = await $.ui.mount({ ...band(120), surface })
    expect((await ui.findAll({ type: 'Box' })).some(b => b.key === 'next')).toBe(false)
    await ui.unmount()
  })
}
