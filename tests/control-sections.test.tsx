import { expect, test } from 'claude-code/testing'

import { cleanQuick } from '../hooks/band/register'

const PANE = {
  plugin: 'khangte-dashboard-mods', component: 'Pane', requestId: 'control-center',
  props: { title: '🎛 제어센터', isFocused: true, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const

/** In-memory state and store; `others` stands for another mod's state (today-tasks). */
const wire = (on: any, others: Record<string, unknown> = {}) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  const kept = new Map<string, unknown>()
  on('clock.now', () => ({ value: new Date(2026, 10, 6, 10).getTime() }))
  on('state.get', (_: unknown, e: { plugin: string; key: string }) =>
    // one plugin now: what a test seeds stands until the mod writes its own
    mem.has(e.key) || !(e.key in others)
      ? { value: mem.get(e.key) ?? { value: undefined, version: 0 } }
      : { value: { value: others[e.key], version: 1 } },
  )
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  on('store.get', (_: unknown, e: { key: string }) => ({ value: kept.get(e.key) }))
  on('store.set', (_: unknown, e: { key: string; value: unknown }) => (kept.set(e.key, e.value), { value: undefined }))
  return { kept }
}

test('request list cleaning: trimmed, no blanks or repeats, at most 8', () => {
  expect(cleanQuick(['  a ', '', 'a', 'b', 3])).toEqual(['a', 'b'])
  expect(cleanQuick(Array.from({ length: 10 }, (_, i) => `q${i}`))).toHaveLength(8)
  expect(cleanQuick(undefined)).toEqual([])
})

for (const surface of ['desktop', 'terminal'] as const) {
  test(`🎛 Claude 도구: 📊 사용량 · 🤖 모델 · ⚡ 빠른 요청 · 📝 다음 요청 메모, set off by rules (${surface})`, async ($, on) => {
    // a list set earlier in 오늘의 작업 carries over until it is edited here
    const { kept } = wire(on, { quick: ['/ponytail-audit'] })
    const pane = () => $.ui.mount({ ...PANE, surface })

    let ui = await pane()
    const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
    const rules = texts.map((t, i) => (/^─{10,}$/.test(t) ? i : -1)).filter(i => i >= 0)
    expect(rules).toHaveLength(3)
    const at = (s: string) => texts.findIndex(t => t.startsWith(s))
    expect(at('이번 작업')).toBe(-1) // it stays above the prompt only
    expect(texts).toContain('🎛 Claude 도구')
    expect(texts).toContain('여기 적은 요청이 입력창 위 ⚡ 단추가 돼요. 누르면 입력창에 채워지고, 보내는 건 직접 해야 돼요.')
    expect((await ui.find({ key: 'quick-add' }))?.props.placeholder).toBe('새 요청을 적고 Enter (예: 이번 수정건 재검토해)')
    const order = [at('📊 사용량'), at('컨텍스트'), rules[0]!, at('🤖 모델'), at('Model'), rules[1]!, at('⚡ 빠른 요청'), rules[2]!, at('📝 다음 요청 메모')]
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order) // 📊 사용량 | 🤖 모델 | ⚡ 빠른 요청 | 📝 다음 요청 메모
    expect(texts).toContain('1. /ponytail-audit')
    expect(await ui.find({ key: 'memo-input' })).toBeDefined()

    // editing here takes the list over and keeps it in this mod's store
    await ui.input({ key: 'quick-add', text: '  방금 고친 것 검토해 줘  ' })
    expect(kept.get('quick')).toEqual(['/ponytail-audit', '방금 고친 것 검토해 줘'])
    await ui.input({ key: 'quick-add', text: '/ponytail-audit' }) // no repeats
    expect(kept.get('quick')).toEqual(['/ponytail-audit', '방금 고친 것 검토해 줘'])
    await ui.unmount()

    ui = await pane()
    await ui.press({ key: 'quick-up-1' })
    expect(kept.get('quick')).toEqual(['방금 고친 것 검토해 줘', '/ponytail-audit'])
    await ui.unmount()
    ui = await pane()
    await ui.press({ key: 'quick-del-0' })
    expect(kept.get('quick')).toEqual(['/ponytail-audit'])
    await ui.unmount()

    // the band's 다음 할 일 buttons follow the list kept here
    const bar = await $.ui.mount({ ...BAND, surface })
    expect((await bar.findAll({ type: 'Button' })).map(b => b.text).filter(t => t.startsWith('▶'))).toEqual(['▶ /ponytail-audit'])
    await bar.unmount()
  })
}
