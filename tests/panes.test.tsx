import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const

test('the bottom-row buttons bring their pane to the front, even when it waits behind another tab', async ($, on) => {
  on('clock.now', () => ({ value: new Date(2026, 10, 6, 10).getTime() }))
  on('state.get', () => ({ value: { value: undefined, version: 0 } }))
  on('state.set', () => ({ value: { isSet: true, version: 1 } }))
  // three panes open; Claude 도구 is the one shown
  let open = [
    { id: 'today-tasks', title: '🗓 오늘 할 일', isShown: false, isFocused: false, isPlaced: true },
    { id: 'control-center', title: '🎛 Claude 도구', isShown: true, isFocused: false, isPlaced: true },
    { id: 'mods-settings', title: '⚙ 모즈 설정', isShown: false, isFocused: false, isPlaced: true },
  ]
  const log: string[] = []
  const filled: string[] = []
  const ran: string[] = []
  on('ui.panes', () => ({ value: open }))
  on('ui.close', (_: unknown, e: { id: string }) => (log.push(`close ${e.id}`), (open = open.filter(p => p.id !== e.id)), { value: undefined }))
  on('ui.open', (_: unknown, e: { id: string; title: string }) => {
    log.push(`open ${e.id}`)
    open = [...open.filter(p => p.id !== e.id).map(p => ({ ...p, isShown: false })), { id: e.id, title: e.title, isShown: true, isFocused: false, isPlaced: true }]
    return { value: { isPlaced: true } }
  })
  on('prompt.fill', (_: unknown, e: { text: string }) => (filled.push(e.text), { isFilled: true, cursor: 0 }))
  on('command.run', (_: unknown, e: { command: string }) => (ran.push(e.command), { text: '' }))

  const press = async (key: string) => {
    const bar = await $.ui.mount({ ...BAND, surface: 'desktop' })
    await bar.press({ key })
    await bar.unmount()
  }
  await press('open-tasks')
  expect(log).toEqual(['close today-tasks', 'open today-tasks']) // behind a tab: closed and opened in front
  expect(filled).toEqual([]) // no /todo typed into the box
  expect(ran).toEqual([]) // and no command run
  log.length = 0
  await press('open-settings')
  expect(log).toEqual(['close mods-settings', 'open mods-settings'])
  log.length = 0
  await press('open-settings') // already the one shown: just opened (retitled) in place
  expect(log).toEqual(['open mods-settings'])
  expect(open.find(p => p.isShown)?.id).toBe('mods-settings')
})
