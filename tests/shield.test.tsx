import { expect, test } from 'claude-code/testing'

import { maskText } from '../hooks/band/shield'

const REPLY = [
  '담당자는 kim@example.com 이고 연락처는 010-1234-5678 입니다.',
  '사무실은 02-123-4567, 지점은 031-1234-5678 이에요.',
  '',
  '```js',
  "const to = 'lee.min+test@mail.example.co.kr' // 02-000-0000",
  '```',
  '버전 1.2.3, 주문번호 1234-5678-9012 와 날짜 2026-11-05 는 그대로.',
].join('\n')

const MESSAGE = {
  plugin: 'khangte-dashboard-mods', component: 'AssistantMessage', requestId: 'm1',
  props: { text: REPLY, isFirstOfReply: true },
} as const
const BAND = {
  plugin: 'khangte-dashboard-mods', component: 'AbovePrompt', requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 } },
} as const

test('masks emails and phone numbers, code blocks too, and nothing else', () => {
  const out = maskText(REPLY)
  expect(out).toContain('●●@가림')
  expect(out).toContain('●●● 가림')
  expect(out).not.toMatch(/kim@example|lee\.min|010-1234|02-123-4567|031-1234|02-000-0000/)
  expect(out.match(/●●@가림/g)).toHaveLength(2)
  expect(out.match(/●●● 가림/g)).toHaveLength(4)
  expect(out).toContain('버전 1.2.3, 주문번호 1234-5678-9012 와 날짜 2026-11-05 는 그대로.')
  expect(out).toContain("const to = '●●@가림' // ●●● 가림") // inside the code fence
})

/** In-memory state, so a press and the redraw after it can be followed. */
const wire = (on: any) => {
  const mem = new Map<string, { value: unknown; version: number }>()
  on('clock.now', () => ({ value: new Date(2026, 10, 5, 12).getTime() }))
  on('state.get', (_: unknown, e: { key: string }) => ({ value: mem.get(e.key) ?? { value: undefined, version: 0 } }))
  on('state.set', (_: unknown, e: { key: string; value: unknown }) => {
    const version = (mem.get(e.key)?.version ?? 0) + 1
    mem.set(e.key, { value: e.value, version })
    return { value: { isSet: true, version } }
  })
  return mem
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`reply is drawn masked, the button reveals and masks again, the original stays (${surface})`, async ($, on) => {
    wire(on)
    on('ui.render', ($, e) => {
      // stands for the engine: draws the text it is handed
      const { Text } = $.ui.resolve(e)
      return <Text>{String((e.props as { text: string }).text)}</Text>
    })

    const drawn = async () => {
      const ui = await $.ui.mount({ ...MESSAGE, surface })
      const text = (await ui.find({ type: 'Text' }))?.text ?? ''
      await ui.unmount()
      return text
    }
    expect(await drawn()).toContain('●●@가림') // starts masked
    expect(await drawn()).not.toContain('kim@example.com')

    // the bar's button: label says on, pressing reveals
    const bar = await $.ui.mount({ ...BAND, surface })
    expect((await bar.find({ key: 'toggle-shield' }))?.text).toBe('👁 보이기')
    await bar.press({ key: 'toggle-shield' })
    await bar.unmount()
    expect(await drawn()).toBe(REPLY) // shown as written

    const bar2 = await $.ui.mount({ ...BAND, surface })
    expect((await bar2.find({ key: 'toggle-shield' }))?.text).toBe('🙈 가리기')
    await bar2.press({ key: 'toggle-shield' })
    await bar2.unmount()
    expect(await drawn()).toContain('●●● 가림') // masked again
    expect(REPLY).toContain('kim@example.com') // the source text is never touched
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`the 가림 row is one line of text; its switch and the 📋 오늘의 작업 opener sit in the bottom row (${surface})`, async ($, on) => {
    wire(on)
    const ran: string[] = []
    on('command.run', (_: unknown, e: { command: string }) => (ran.push(e.command), { text: '' }))
    const opened: string[] = []
    on('ui.open', (_: unknown, e: { id: string }) => (opened.push(e.id), { value: { isPlaced: true } }))
    const ui = await $.ui.mount({ ...BAND, surface })
    const boxes = await ui.findAll({ type: 'Box' })
    const shieldRow = boxes.find(b => b.key === 'shield')!
    expect(shieldRow.props.minHeight).toBeUndefined() // no two-line row for a button any more
    expect(JSON.stringify(shieldRow.children)).not.toContain('"Button"')
    expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('켜짐')
    await ui.press({ key: 'open-tasks' })
    expect(opened).toEqual(['today-tasks']) // opens 🗓 오늘 할 일 directly
    expect(ran).toEqual([]) // no /todo run
    await ui.unmount()
  })
}

for (const surface of ['desktop', 'terminal'] as const) {
  test(`band rows take one line; only button rows take two on desktop (${surface})`, async ($, on) => {
    wire(on)
    const ui = await $.ui.mount({ ...BAND, surface })
    const slots = (await ui.findAll({ type: 'Box' })).filter(b => b.key?.startsWith('slot-'))
    expect(slots.length).toBeGreaterThanOrEqual(4) // 퇴근, 사용량, 컴퓨터 상태, 가림 at least
    expect(slots.filter(s => s.key !== 'slot-chips').every(s => s.props.minHeight === undefined)).toBe(true)
    const svgs = await ui.findAll({ type: 'Svg' })
    expect(svgs.filter(s => s.props.alt !== ' ').every(s => Number(s.props.height) <= 18)).toBe(true) // no picture taller than a line
    // a 22px strut in every band row on desktop: a little air, the same for each row
    expect(svgs.filter(s => s.props.alt === ' ').map(s => s.props.height)).toEqual(surface === 'desktop' ? slots.map(() => 22) : [])
    const gear = (await ui.findAll({ type: 'Box' })).find(b => b.key === 'gear-row')!
    expect(gear.props.minHeight).toBe(surface === 'desktop' ? 2 : undefined) // the button row matches
    await ui.unmount()
  })
}
