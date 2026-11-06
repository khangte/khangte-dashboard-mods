import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'control-center',
  props: { title: '🎛 제어센터', isFocused: true, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const
const END = { answer: '다 했어요', durationMs: 1000, isAborted: false, turnId: 't1', reason: 'answer' } as const

/** In-memory state and store, the kit's clock, and the engine's other answers. */
const wire = (on: any, store: Record<string, unknown> = {}) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  const kept = new Map<string, unknown>(Object.entries(store))
  const filled: string[] = []
  let canFill = true
  let sent = 0
  on('state.get', (_: unknown, e: { key: string }) => ({ value: mem.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (kept.set(e.key, e.value), { value: undefined }))
  on('prompt.fill', (_: unknown, e: { text: string }) =>
    canFill ? (filled.push(e.text), { isFilled: true, cursor: e.text.length }) : { isFilled: false, cursor: 0 },
  )
  on('prompt.submit', (_: unknown, e: { text: string }) => (sent++, { text: e.text }))
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('command.register', (_: unknown, e: { name: string }) => ({ value: { command: e.name } }))
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: '' } }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: '- [ ] a' }))
  on('ui.toast', () => ({ value: undefined }))
  return { mem, kept, filled, sent: () => sent, refuseFill: () => (canFill = false) }
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`memo: typed while working, kept in the store, pulses when the answer ends, fills without sending (${surface})`, async ($, on) => {
    const time = mock.clock(on, { now: new Date(2026, 10, 6, 10).getTime() })
    const w = wire(on, { memo: '어제 적어 둔 메모' })
    await $.session.start({ cwd: '/', surface, isInteractive: true })

    // a note saved in an earlier conversation is back
    let ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'memo-input' }))?.props.value).toBe('어제 적어 둔 메모')
    // typing is saved to the store as it is typed, but not to the state: no redraw under the fingers
    const before = w.mem.get('memo')?.version
    await ui.input({ key: 'memo-input', text: '표를 그래프로도 그려 줘', kind: 'change' })
    expect(w.kept.get('memo')).toBe('표를 그래프로도 그려 줘')
    expect(w.mem.get('memo')?.version).toBe(before)
    // and the quick-request field keeps what is half typed across a redraw
    await ui.input({ key: 'quick-add', text: '/ponytail', kind: 'change' })
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'memo-input' }))?.props.value).toBe('표를 그래프로도 그려 줘')
    expect((await ui.find({ key: 'quick-add' }))?.props.value).toBe('/ponytail')
    await ui.input({ key: 'quick-add', text: '/ponytail-audit' }) // Enter: added, field cleared
    await ui.unmount()
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'quick-add' }))?.props.value).toBe('')
    await ui.unmount()

    // Claude is still working: nothing pulses yet
    ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'memo-fill' }))?.text).toBe('입력창에 채우기')
    await ui.unmount()

    // a subagent finishing is not the answer
    await $.turn.complete({ ...END, agentId: 'a1' })
    expect(w.mem.get('memoReady')?.value ?? false).toBe(false)

    // the answer ends: the button lights up and pulses
    await $.turn.complete(END)
    const seen = new Set<unknown>()
    for (let i = 0; i < 3; i++) {
      await time.advance(500)
      ui = await $.ui.mount({ ...PANE, surface })
      const b = await ui.find({ key: 'memo-fill' })
      expect(b?.text).toBe('✨ 입력창에 채우기')
      seen.add(b?.props.variant)
      await ui.unmount()
    }
    expect([...seen].sort()).toEqual(['primary', 'secondary']) // it blinks
    const bar = await $.ui.mount({ ...BAND, surface })
    expect(await bar.find({ key: 'open-memo' })).toBeUndefined() // no 📝 메모 button above the prompt any more
    await bar.unmount()

    // a refused fill keeps the note
    w.refuseFill()
    ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'memo-fill' })
    expect(w.kept.get('memo')).toBe('표를 그래프로도 그려 줘')
    await ui.unmount()
  })

  test(`memo: pressing fills the prompt box only; the note is used up; nothing is sent (${surface})`, async ($, on) => {
    mock.clock(on, { now: new Date(2026, 10, 6, 10).getTime() })
    const w = wire(on, { memo: '견적서 다시 검토해 줘' })
    await $.session.start({ cwd: '/', surface, isInteractive: true })
    await $.turn.complete(END)

    const filler = await $.ui.mount({ ...PANE, surface })
    await filler.press({ key: 'memo-fill' }) // the control centre's button fills it
    await filler.unmount()
    expect(w.filled).toEqual(['견적서 다시 검토해 줘'])
    expect(w.sent()).toBe(0)
    expect(w.kept.get('memo')).toBe('')
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'memo-fill' }))?.text).toBe('입력창에 채우기')
    await ui.unmount()
  })
}
