import type { Settings } from '../../types'
import { DEFAULT_SETTINGS } from '../band/layout'
import { freshPomo } from '../tasks/pomodoro'
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Owned by usage-band's settings panel; read here only for the spinner's on/off switch.
const settings = atom({ plugin: 'khangte-dashboard-mods', key: 'settings' } as const, DEFAULT_SETTINGS as Settings)
// Owned by today-tasks; read here only to show its countdown.
const pomo = atom({ plugin: 'khangte-dashboard-mods', key: 'pomo' } as const, freshPomo(''))
const turn = atom({ plugin: 'khangte-dashboard-mods', key: 'turn' } as const, { sec: 0, tools: 0, base: 0 })

export const PHRASES = [
  '완벽보다 완료',
  '작은 한 걸음도 진도',
  '오늘 끝낸 한 줄이 내일의 여유',
  '시작이 절반, 나머지는 꾸준함',
  '느려도 멈추지 않으면 도착',
  '어제보다 한 줄 더',
  '막히면 쪼개고, 쪼개면 풀린다',
  '지금 하는 일이 쌓여 실력이 된다',
  '하나씩 지우다 보면 끝이 보인다',
  '오늘의 수고가 내일의 든든함',
] as const

/** A new phrase every 3 seconds, cycling through all ten, so none repeats back to back. */
export const phraseAt = (base: number, sec: number) => PHRASES[(base + Math.floor(sec / 3)) % PHRASES.length]!

export const REST_AFTER = 30

/** ` · 🍅 24:59` while the tomato timer runs or is paused; nothing when it is stopped or absent. */
export const pomoSuffix = (p: { status: string; endsAt: number; leftMs: number } | null | undefined, now: number) => {
  if (!p || (p.status !== 'running' && p.status !== 'paused')) return ''
  // same rounding as today-tasks' own clock, so both show the same second
  const s = Math.ceil((p.status === 'running' ? Math.max(0, p.endsAt - now) : p.leftMs) / 1000)
  return ` · 🍅 ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const line = (t: { sec: number; tools: number; base: number }) =>
  `${phraseAt(t.base, t.sec)} · 도구 ${t.tools}번` // seconds still drive the rotation and the rest notice, but are not shown

let timer: { cancel: () => void } | undefined

export const register: Register = on => {
  let startedAt = 0
  let lastBase = -1
  let isRested = false

  on('turn.start', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result // main loop only

    timer?.cancel()
    startedAt = await $.clock.now()
    isRested = false
    // A new base never equals the last turn's, so the first phrase differs from the last one shown.
    lastBase = (lastBase + 1 + (startedAt % (PHRASES.length - 1)) + PHRASES.length) % PHRASES.length
    const base = lastBase
    await update($, turn, () => ({ sec: 0, tools: 0, base }))

    timer = $.clock.every(1000, async () => {
      const sec = Math.floor(((await $.clock.now()) - startedAt) / 1000)
      await update($, turn, t => ({ ...t, sec }))
      if (sec > REST_AFTER && !isRested) {
        isRested = true
        $.ui.toast('☕ 잠깐 숨 고르고 오세요')
      }
    })
    return result
  })



  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (((await read($, settings)) as Settings | null)?.enabled?.spinner === false) return next(e)
    const t = await read($, turn)
    // The line replaces the engine's word; its own elapsed time and tokens stay beside it.
    const tomato = pomoSuffix(await read($, pomo), await $.clock.now())
    return next({ ...e, props: { ...e.props, word: line(t) + tomato, message: null, suffix: '' } })
  })
}

/** Counts the turn's tool calls. Run from the band's hook of the same event: a plugin gets one hook per event */
export async function spinnerToolCall($: EngineInterface, e: any, next: (e: any) => any) {
  await update($, turn, t => ({ ...t, tools: t.tools + 1 }))
  return next(e)
}

/** Stops the spinner's clock. Run from the band's hook of the same event: a plugin gets one hook per event */
export async function spinnerTurnComplete($: EngineInterface, e: any, next: (e: any) => any) {
  timer?.cancel()
  timer = undefined
  return next(e)
}
