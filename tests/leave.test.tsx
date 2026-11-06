import { expect, mock, test } from 'claude-code/testing'

import { leaveView, parseHours } from '../hooks/band/leave'

const H = { start: '09:00', end: '18:30' }
const at = (h: number, m: number, s = 0, day = 5) => new Date(2026, 10, day, h, m, s).getTime() // 2026-11-05 is a Thursday
const text = (ms: number, hours = H) => leaveView(ms, hours)

test('parse /workhours args', () => {
  expect(parseHours('09:00 18:30')).toEqual({ start: '09:00', end: '18:30' })
  expect(parseHours(' 9:05  17:00 ')).toEqual({ start: '09:05', end: '17:00' })
  for (const bad of ['', '09:00', '18:00 09:00', '25:00 26:00', '09:00 18:60', 'a b']) expect(parseHours(bad)).toBeUndefined()
})

test('counter: remaining to the second, bar and %, orange at 30m, tidy at 10m, cheer 3s, overtime, weekend', () => {
  expect(text(at(9, 0))).toMatchObject({ kind: 'work', text: '🏃 퇴근까지 9:30:00  ▱▱▱▱▱▱▱▱▱ 0%' })
  expect(text(at(14, 15, 20)).meter).toEqual({ clock: '4:14:40', full: 5, empty: 4, pct: 55 })
  const noon = text(at(14, 15, 20)) // 5h15m of 9h30m = 55%
  expect(noon.text).toBe('🏃 퇴근까지 4:14:40  ▰▰▰▰▰▱▱▱▱ 55%')
  expect(text(at(17, 59, 59)).kind).toBe('work') // 30:01 left
  expect(text(at(18, 0, 0)).kind).toBe('soon') // 30:00 left
  expect(text(at(17, 29, 59)).kind).toBe('work') // 1:00:01 left
  expect(text(at(18, 20, 0)).text).toContain('정리할 시간이에요 🧹') // 10:00 left
  expect(text(at(18, 20, 0)).kind).toBe('tidy')
  expect(text(at(18, 19, 59)).kind).toBe('soon')
  expect(text(at(18, 30, 0))).toEqual({ kind: 'cheer', text: '🎉 퇴근!' })
  expect(text(at(18, 30, 2)).kind).toBe('cheer')
  expect(text(at(18, 30, 3)).text).toBe('퇴근 시간 지났어요 🌙 +0:00')
  expect(text(at(18, 42, 30)).text).toBe('퇴근 시간 지났어요 🌙 +0:12')
  expect(text(at(8, 0)).text).toContain('0%') // before work: nothing elapsed yet
  expect(text(at(12, 0, 0, 7))).toEqual({ kind: 'rest', text: '오늘은 쉬는 날 ☀' }) // Saturday
  expect(text(at(12, 0, 0, 8)).kind).toBe('rest') // Sunday
})

test('/workhours saves, 1 minute later shows 🎉 퇴근!, and putting it back restores the default', async ($, on) => {
  const clock = mock.clock(on, { now: at(18, 0, 0) })
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  const savedValue = async () => kept.get('workhours')
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'workhours' } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '- [ ] a' }))
  let hours = { start: '09:00', end: '18:00' }
  on('state.get', (_, e) => ({ value: { value: e.key === 'hours' ? hours : null, version: 1 } }))
  on('state.set', (_, e) => (e.key === 'hours' && (hours = e.value as typeof hours), { value: { isSet: true, version: 1 } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{String(e.props.hasSurvey)}</Text>
  })

  // one minute after "now" (18:00:00): end = 18:01
  const r = await $.command.run({ command: 'workhours', args: '09:00 18:01' })
  expect(r.text).toBe('출근 09:00 · 퇴근 18:01')
  expect(await savedValue()).toBe('09:00 18:01')
  expect(leaveView(clock.now(), hours).kind).toBe('tidy') // 1 minute left: 정리할 시간
  await clock.advance(60_000)
  expect(leaveView(clock.now(), hours)).toEqual({ kind: 'cheer', text: '🎉 퇴근!' })
  await clock.advance(5_000)
  expect(leaveView(clock.now(), hours).kind).toBe('over')

  const back = await $.command.run({ command: 'workhours', args: '09:00 18:00' })
  expect(back.text).toBe('출근 09:00 · 퇴근 18:00')
  expect(await savedValue()).toBe('09:00 18:00')
  expect((await $.command.run({ command: 'workhours', args: '18:00 09:00' })).text).toContain('사용법')
  expect(await savedValue()).toBe('09:00 18:00') // a bad value saves nothing
})
