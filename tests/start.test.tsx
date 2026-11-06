import { expect, mock, test } from 'claude-code/testing'

test('session start registers every command of all three parts', async ($, on) => {
  mock.store(on)
  const names: string[] = []
  on('command.register', (_: unknown, e: { name: string }) => (names.push(e.name), { value: { command: e.name } }))
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('state.set', () => ({ value: { isSet: true, version: 1 } }))
  on('clock.now', () => ({ value: new Date(2026, 10, 6, 10).getTime() }))
  on('clock.every', () => ({ value: () => {} }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '{}', stderr: '' } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  expect(names.sort()).toEqual(['control', 'memo', 'mods-settings', 'pomodoro', 'todo', 'todo-name', 'workhours'])
})
