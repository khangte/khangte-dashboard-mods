import { expect, test } from 'claude-code/testing'

import { boxGaugeSvg, cellWidth, todayTodo } from '../hooks/band/register'

const NOW = new Date(2026, 10, 6, 14, 0, 0).getTime() // Fri 2026-11-06 14:00, local: mid-workday
const TODAY = '2026-11-06'
const band = (bodyColumns: number) => ({
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 20 } },
}) as const
// the /todo list as today-tasks keeps it
const TASKS = [
  { title: '견적서 검토', day: TODAY, due: '15:00', done: true },
  { title: '주간 보고', day: TODAY, due: '11:00', done: true },
  { title: '회의록', day: TODAY, done: true },
  { title: '거래처 회신', day: TODAY, due: '16:00', done: false },
  { title: '어제 못 한 일', day: '2026-11-05', done: false }, // overdue: still today's
  { title: '월말 결산', day: '2026-11-09', done: false }, // later: not today's
  { title: '지난주 일', day: '2026-11-04', done: true }, // done another day: not today's
]

test("today's /todo: done today over today's whole list; open ones in the 오늘 tab's order", () => {
  expect(todayTodo(TASKS, NOW)).toEqual({ done: 3, total: 5, open: ['어제 못 한 일', '거래처 회신'] })
  expect(todayTodo(null, NOW)).toEqual({ done: 0, total: 0, open: [] })
})

test('gauge drawing: slim boxes, the first ones filled, sharing a fixed width', () => {
  const svg = boxGaugeSvg(3, 5, 200)
  expect(svg).toContain('width="200" height="10"')
  expect(svg.match(/<rect /g)).toHaveLength(5)
  expect(svg.match(/fill="#2dd4bf"/g)).toHaveLength(3)
  const wide = Number(boxGaugeSvg(1, 3, 200).match(/width="([\d.]+)" height="10" rx/)?.[1])
  const narrow = Number(boxGaugeSvg(1, 8, 200).match(/width="([\d.]+)" height="10" rx/)?.[1])
  expect(wide).toBeGreaterThan(narrow) // more tasks, shorter boxes, same total
  expect(cellWidth('🏃 퇴근 ')).toBe(8) // emoji and Hangul take two cells
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`box gauge row is as long as the 퇴근 row; box count and size follow the list (${surface})`, async ($, on) => {
    let tasks: unknown = TASKS
    on('clock.now', () => ({ value: NOW }))
    on('state.get', (_, e) => ({
      value: {
        value: e.key === 'tasks' ? tasks : e.key === 'hours' ? { start: '09:00', end: '18:00' } : undefined,
        version: 1,
      },
    }))

    for (const cols of [120, 70]) {
      const ui = await $.ui.mount({ ...band(cols), surface })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      expect(texts).toContain('3/5')
      const leaveText = texts.find(t => t.includes('남음 · '))!
      expect(leaveText).toBeDefined()
      if (surface === 'desktop') {
        const gauge = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('오늘 할 일'))!
        const dog = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('퇴근까지'))!
        expect(gauge.props.height).toBe(10) // slim
        const todoCells = cellWidth('☑ 오늘 할 일 ') + Number(gauge.props.width) / 8 + cellWidth('3/5')
        const leaveCells = cellWidth('🏃 퇴근 ') + 4 + Number(dog.props.width) / 8 + cellWidth(leaveText)
        expect(Math.abs(todoCells - leaveCells)).toBeLessThanOrEqual(1) // the same length, give or take rounding
      } else {
        const gauge = texts.find(t => /^█/.test(t) && !t.includes('🏠'))!
        expect(gauge.split(' ')).toHaveLength(5) // five boxes
        const track = texts.find(t => t.startsWith('🏠'))!
        const todoCells = cellWidth('☑ 오늘 할 일 ') + cellWidth(gauge) + cellWidth('3/5')
        const leaveCells = cellWidth('🏃 퇴근 ') + cellWidth(track) + cellWidth(leaveText)
        expect(Math.abs(todoCells - leaveCells)).toBeLessThanOrEqual(4) // block runs divide unevenly
      }
      await ui.unmount()
    }

    // more tasks: more boxes in the same length
    tasks = [...TASKS, { title: '하나 더', day: TODAY, done: false }, { title: '또 하나', day: TODAY, done: false }]
    let ui = await $.ui.mount({ ...band(120), surface })
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('3/7')
    if (surface === 'desktop') {
      const gauge = (await ui.findAll({ type: 'Svg' })).find(s => String(s.props.alt).startsWith('오늘 할 일'))!
      expect(String(gauge.props.source).match(/<rect /g)).toHaveLength(7)
    }
    await ui.unmount()

    tasks = [] // nothing for today: hidden
    ui = await $.ui.mount({ ...band(120), surface })
    expect((await ui.findAll({ type: 'Box' })).some(b => b.key === 'todo')).toBe(false)
    await ui.unmount()
  })
}
