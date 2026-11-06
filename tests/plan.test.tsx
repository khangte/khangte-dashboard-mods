import { expect, test } from 'claude-code/testing'

const UP = 'mcp__ccd_turn__update_plan'
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: true, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const
const ITEMS = ['자료 모으기', '표 만들기', '그래프 그리기', '요약 쓰기', '검토하기'].map((content, i) => ({
  content,
  status: i === 0 ? 'in_progress' : 'pending',
}))

const wire = (on: any) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  on('clock.now', () => ({ value: new Date(2026, 10, 6, 10).getTime() }))
  on('state.get', (_: unknown, e: { key: string }) => ({ value: mem.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('turn.complete', () => ({ text: '' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1 }, rateLimits: [] } }))
  on('store.get', () => ({ value: undefined }))
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`work bar: hidden with no checklist, fills a step at a time, names the step, hides again on a new request (${surface})`, async ($, on) => {
    wire(on)
    const look = async () => {
      const ui = await $.ui.mount({ ...BAND, surface })
      const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
      const bar = surface === 'desktop' ? (await ui.findAll({ type: 'Svg' })).map(s => String(s.props.alt)).find(a => a.startsWith('이번 작업')) : texts.join('').match(/▰*▱*/g)?.join('')
      await ui.unmount()
      return { texts, bar: String(bar ?? ''), hasBand: texts.some(t => t.includes('이번 작업')) }
    }

    expect((await look()).hasBand).toBe(false) // a short chat: no checklist, no bar

    await $.prompt.submit({ text: '보고서 써 줘' }) // the request that starts the work
    await $.tool.call({ tool: UP, items: ITEMS, scope: 'first_task' })
    let v = await look()
    expect(v.hasBand).toBe(true)
    expect(v.texts).toContain('0/5 · 자료 모으기 중')

    await $.tool.call({ tool: UP, advance: true })
    await $.tool.call({ tool: UP, advance: true })
    await $.tool.call({ tool: UP, advance: true })
    v = await look()
    expect(v.texts).toContain('3/5 · 요약 쓰기 중')
    if (surface === 'desktop') expect(v.bar).toBe('이번 작업 3/5')
    else expect(v.texts.join('')).toContain('▰'.repeat(12) + '▱'.repeat(8)) // 3/5 of 20

    await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: 'done' })
    expect((await look()).texts).toContain('5/5 · 완료 ✓')

    await $.prompt.submit({ text: '/todo 견적서 15:00' }) // a slash command keeps it
    expect((await look()).hasBand).toBe(true)
    await $.prompt.submit({ text: '그 김에 이것도' }) // sent while Claude works: it joins the work, the bar stays
    expect((await look()).hasBand).toBe(true)
    await $.turn.complete({ turnId: 't1', reason: 'completed', answer: '' } as never) // the answer is in
    await $.prompt.submit({ text: '/todo-name kang' }) // a slash command while idle starts no turn…
    await $.prompt.submit({ text: '고마워' }) // …so this is still the new request: hidden until a new checklist
    expect((await look()).hasBand).toBe(false)
  })
}
