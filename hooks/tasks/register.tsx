import { showPane } from '../panes'
import type { Settings } from '../../types'
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Minutes, Pomo, Tab, Task } from '../../types'

import {
  DEFAULT_MINUTES, TOMATO_SIZE, advance, clock, freshPomo, parseMinutes, pause, progress, remaining, reset, rollDay, skip, start, tomatoSvg,
} from './pomodoro'

import { TABS, cleanTasks, dayOf, listFor, pairs, parseTodo, tabOf, thinBar, todayProgress, whenOf } from './tasks'
import { DEFAULT_SETTINGS } from '../band/layout'
import { C, usePalette } from '../band/control'

const tasks = atom({ plugin: 'khangte-dashboard-mods', key: 'tasks' } as const, [])
const tab = atom({ plugin: 'khangte-dashboard-mods', key: 'tab' } as const, '오늘')
const name = atom({ plugin: 'khangte-dashboard-mods', key: 'name' } as const, '') // set with /todo-name; a shared copy carries no one's name
// The 다음 할 일 buttons above the prompt read this list (usage-band draws them).
const pomo = atom({ plugin: 'khangte-dashboard-mods', key: 'pomo' } as const, freshPomo(''))
const minutes = atom({ plugin: 'khangte-dashboard-mods', key: 'minutes' } as const, DEFAULT_MINUTES)
const tick = atom({ plugin: 'khangte-dashboard-mods', key: 'taskTick' } as const, 0)
// Owned by usage-band's ⚙ 모즈 설정; read here only for this mod's on/off switch.
const settings = atom({ plugin: 'khangte-dashboard-mods', key: 'settings' } as const, DEFAULT_SETTINGS as Settings)

export const PANE = 'today-tasks'
export const TITLE = '🗓 오늘 할 일'

async function save($: EngineInterface, list: Task[]) {
  await update($, tasks, () => list)
  await $.store.set('tasks', list) // kept by the host across conversations
}

/** Writes the timer, and today's 🍅 count to the store so it outlasts the conversation. */
async function setPomo($: EngineInterface, fn: (p: Pomo, now: number, m: Minutes) => Pomo) {
  const now = await $.clock.now()
  const m = await read($, minutes)
  let out = freshPomo(dayOf(now), m)
  await update($, pomo, p => (out = fn(rollDay(p, dayOf(now)), now, m)))
  await $.store.set('pomo-done', { day: out.day, done: out.done })
  return out
}

/** Once a second: roll a running timer over finished phases, tell the person, redraw. */
async function pomoTick($: EngineInterface) {
  const now = await $.clock.now()
  const p = await read($, pomo)
  if (p.status !== 'running' && p.day === dayOf(now)) return
  const m = await read($, minutes)
  const { events } = advance(rollDay(p, dayOf(now)), now, m)
  if (events.length > 0 || p.day !== dayOf(now)) await setPomo($, (q, n, mm) => advance(q, n, mm).pomo)
  for (const ev of events) announce($, ev === 'focus-done' ? `🔴 집중 ${m.focus}분 끝! ${m.rest}분 쉬어요` : `🟢 휴식 끝! 다시 ${m.focus}분 집중해요`)
  await update($, tick, () => now)
}

/** A timer notice: a toast on every surface, and the terminal's own notification where it has one. */
function announce($: EngineInterface, text: string) {
  $.ui.toast(text, { timeoutMs: 6000 })
  void $.ui.notify(text, { title: '🍅 집중 타이머' }).catch(() => undefined)
}

/** ▶ / ⏸: starts or resumes with a notice, or pauses. */
async function togglePomo($: EngineInterface) {
  const was = await read($, pomo)
  const p = await setPomo($, (q, n) => (q.status === 'running' ? pause(q, n) : start(q, n)))
  if (p.status !== 'running') return
  const [mark, what] = p.mode === 'focus' ? ['🟢', '집중'] : ['🔴', '휴식']
  announce($, was.status === 'paused' ? `${mark} ${what} 다시 시작 · ${clock(p.leftMs)} 남음` : `${mark} ${what} ${clock(p.leftMs)} 시작!`)
}

/** ↺: back to a stopped focus; a timer that was going says it stopped. */
async function resetPomo($: EngineInterface) {
  const was = await read($, pomo)
  await setPomo($, (p, _, mm) => reset(p, mm))
  if (was.status !== 'idle') announce($, '⏹ 집중 타이머를 멈췄어요')
}

/** Saves new focus and rest minutes: `/pomodoro` and the pane's fields both come here. */
async function setMinutes($: EngineInterface, m: Minutes) {
  await update($, minutes, () => m)
  await $.store.set('pomo-minutes', `${m.focus} ${m.rest}`)
  // A stopped timer takes the new length at once; a running one keeps its phase and uses it from the next.
  await setPomo($, (p, _, mm) => (p.status === 'idle' ? { ...p, leftMs: (p.mode === 'focus' ? mm.focus : mm.rest) * 60_000 } : p))
}

/** What is typed in a minutes field, kept here and not in the state: the pane redraws every second. */
const drafts: { focus?: string; rest?: string } = {}

/** One field's 적용 (its Enter): that length alone; a bad number changes nothing. */
async function applyMinute($: EngineInterface, k: 'focus' | 'rest', v: string) {
  delete drafts[k]
  const n = Number(v.trim())
  if (!Number.isInteger(n) || n < 1 || n > 180) return $.ui.toast('1~180 사이의 분을 적어 주세요')
  const cur = await read($, minutes)
  await setMinutes($, { ...cur, [k]: n })
  $.ui.toast(`${k === 'focus' ? '집중' : '휴식'} 시간을 ${n}분으로 바꿨어요`)
}

async function openPane($: EngineInterface) {
  await showPane($, PANE, TITLE)
}

export const register: Register = on => {

  on('command.run', { command: 'todo' }, async ($, e) => {
    if (e.args.trim() === '') {
      await openPane($)
      return { text: `${TITLE} 패널을 열었어요.` }
    }
    const now = await $.clock.now()
    const p = parseTodo(e.args, now)
    if ('error' in p) return { text: p.error }
    const list = await read($, tasks)
    const task: Task = { id: `${now}-${list.length}`, ...p, done: false }
    await save($, [...list, task])
    await update($, tab, () => tabOf(task, dayOf(now)))
    await openPane($)
    return { text: `추가했어요: ${task.title} · ${whenOf(task, dayOf(now))} · #${task.tag}` }
  })

  on('command.run', { command: 'pomodoro' }, async ($, e) => {
    const m = e.args.trim() === '' ? await read($, minutes) : parseMinutes(e.args)
    if (!m) return { text: '사용법: /pomodoro 25 5 (집중 분, 휴식 분, 1~180)' }
    await setMinutes($, m)
    return { text: `포모도로: 집중 ${m.focus}분 · 휴식 ${m.rest}분` }
  })

  on('command.run', { command: 'todo-name' }, async ($, e) => {
    const who = e.args.trim()
    if (who === '') return { text: `지금 이름: ${await read($, name)} (바꾸려면 /todo-name 이름)` }
    await update($, name, () => who)
    await $.store.set('name', who)
    return { text: `인사말 이름을 ${who}(으)로 바꿨어요.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await usePalette($)
    const { Box, Button, Text } = $.ui.resolve(e)
    const TEXT = C.deep // titles, the timer
    const SUB = C.mid // secondary lines
    const ACCENT = C.blue // counts, highlights
    const LINE = C.pale // borders
    if (((await read($, settings)) as Settings | null)?.enabled?.tasks === false) {
      return <Text dimColor>오늘 할 일이 ⚙ 모즈 설정에서 꺼져 있어요.</Text>
    }

    const list = await read($, tasks)
    const current = await read($, tab)
    const who = await read($, name)
    const today = dayOf(await $.clock.now())
    const isTerminal = e.surface === 'terminal'
    // Desktop buttons stand taller than a line: rows that hold them get two lines.
    const line = isTerminal ? {} : { minHeight: 2 }
    const gap = isTerminal ? 0 : 1
    const cardWidth = Math.max(16, Math.floor((e.props.bodyColumns - 3) / 2))
    const todayLeft = listFor(list, '오늘', today).length
    const shown = listFor(list, current, today)
    // The to-do progress that used to walk a dog above the prompt now lives here.
    const prog = todayProgress(list, today)
    const progWidth = Math.max(80, Math.min(260, (e.props.bodyColumns - 16) * 8))
    const progFill = Math.round(prog.ratio * 20)
    await read($, tick) // redraw once a second while the timer runs
    const nowMs = await $.clock.now()
    const m = await read($, minutes)
    const tp = rollDay(await read($, pomo), today)
    const isRest = tp.mode === 'rest'
    const ripe = isRest ? 1 : progress(tp, nowMs, m)
    const r = $.ui.resolve(e)
    const tomato =
      e.surface !== 'terminal' && 'Svg' in r ? (
        <r.Svg source={tomatoSvg(ripe, isRest)} alt={isRest ? '쉬는 토마토 - ‿ -' : '집중하는 토마토 • ‿ •'} width={TOMATO_SIZE.width} height={TOMATO_SIZE.height} />
      ) : (
        <Text color={TEXT}>{isRest ? '🍅 - ‿ -' : '🍅 • ‿ •'}</Text>
      )
    const phase = isRest ? `휴식 ${m.rest}분` : `집중 ${m.focus}분`
    const tomatoes = tp.done === 0 ? '아직 없음' : '🍅'.repeat(Math.min(tp.done, 12)) + (tp.done > 12 ? ` ×${tp.done}` : '')
    // A thin rule across the pane between its three parts: the timer, the to-dos, the ready-made requests.
    const divider = (key: string) => (
      <Text key={key} color={LINE} wrap="truncate">{'─'.repeat(Math.max(10, e.props.bodyColumns - 2))}</Text>
    )
    const timer = (
      <Box key="pomo" flexDirection="column" alignItems="center" rowGap={gap}>
        {tomato}
        <Text size="title" weight="bold" tabular color={TEXT}>{clock(remaining(tp, nowMs))}</Text>
        <Text color={SUB}>{`${phase} · 완료 ${tomatoes}${tp.status === 'paused' ? ' · 일시정지' : ''}`}</Text>
        <Box {...line} flexDirection="row" columnGap={1} alignItems="center" flexWrap="wrap" justifyContent="center">
          <Button
            key="pomo-toggle"
            variant={tp.status === 'running' ? 'secondary' : 'primary'}
            onPress={() => togglePomo($)}
          >
            {tp.status === 'running' ? '⏸ 일시정지' : '▶ 시작'}
          </Button>
          <Button key="pomo-skip" onPress={() => setPomo($, (p, n, mm) => skip(p, n, mm))}>⏭ 건너뛰기</Button>
          <Button key="pomo-reset" onPress={() => resetPomo($)}>↺ 처음으로</Button>
        </Box>
        {'Input' in r ? (
          <Box key="pomo-minutes" flexDirection="row" columnGap={2} alignItems="center" flexWrap="wrap" justifyContent="center">
            {(['focus', 'rest'] as const).map(k => (
              <r.Input
                key={`pomo-${k}`}
                label={k === 'focus' ? '집중(분)' : '휴식(분)'}
                placeholder="1~180"
                submitLabel="적용"
                value={drafts[k] ?? String(m[k])}
                onInput={v => {
                  drafts[k] = v
                }}
                onSubmit={v => void applyMinute($, k, v)}
              />
            ))}
          </Box>
        ) : null}
      </Box>
    )

    const card = (t: Task) => {
      const c = t.done ? C.done : C.card[t.tag]
      return (
        <Box
          key={`card-${t.id}`}
          width={cardWidth}
          minHeight={isTerminal ? 5 : 7}
          flexDirection="column"
          justifyContent="space-between"
          borderStyle="round"
          borderColor={t.done ? C.doneBorder : LINE}
          backgroundColor={c.bg}
          paddingX={1}
        >
          <Box flexDirection="row" columnGap={1} alignItems="center">
            <Text backgroundColor={c.chipBg} color={c.chipFg} weight="bold">{` ${t.tag} `}</Text>
            <Text color={c.fg} size="footnote">{whenOf(t, today)}</Text>
          </Box>
          <Text color={c.fg} weight="bold" strikethrough={t.done} wrap="wrap">{t.title}</Text>
          <Box {...line} flexDirection="row" justifyContent="space-between" alignItems="center">
            <Button
              key={`del-${t.id}`}
              plain
              onPress={async () => {
                const l = await read($, tasks)
                await save($, l.filter(x => x.id !== t.id))
              }}
            >
              ✕
            </Button>
            <Button
              key={`done-${t.id}`}
              plain
              onPress={async () => {
                const l = await read($, tasks)
                await save($, l.map(x => (x.id === t.id ? { ...x, done: !x.done } : x)))
              }}
            >
              {t.done ? '●' : '○'}
            </Button>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" rowGap={gap} paddingX={1} paddingY={1}>
        <Text size="title" weight="bold" color={TEXT}>{who ? `좋은 아침, ${who}님` : '좋은 아침이에요'}</Text>
        <Text color={ACCENT}>{`오늘 끝낼 일 ${todayLeft}개`}</Text>
        {divider('line-0')}
        <Text weight="bold" color={TEXT}>🍅 집중 타이머</Text>
        {timer}
        {divider('line-1')}
        <Text weight="bold" color={TEXT}>☑ 할 일 목록</Text>
        {prog.total > 0 ? (
          <Box key="progress" flexDirection="row" alignItems="center" columnGap={1}>
            {e.surface !== 'terminal' && 'Svg' in r ? (
              <r.Svg source={thinBar(prog.ratio, progWidth, LINE, ACCENT)} alt={`오늘 진행 ${prog.done}/${prog.total}`} width={progWidth} height={10} />
            ) : (
              <Text color={ACCENT}>{'▰'.repeat(progFill) + '▱'.repeat(20 - progFill)}</Text>
            )}
            <Text color={SUB} tabular>{`${prog.done}/${prog.total} 완료 · ${Math.round(prog.ratio * 100)}%`}</Text>
          </Box>
        ) : null}

        <Box {...line} flexDirection="row" alignItems="center" justifyContent="space-between">
          <Box flexDirection="row" columnGap={1} alignItems="center">
            {TABS.map((label: Tab) => (
              <Button
                key={`tab-${label}`}
                variant={label === current ? 'primary' : 'secondary'}
                onPress={() => update($, tab, () => label)}
              >
                {`${label} ${listFor(list, label, today).length}`}
              </Button>
            ))}
          </Box>
          <Button key="add" onPress={() => void $.prompt.fill({ text: '/todo ' })}>
            ＋
          </Button>
        </Box>

        {shown.length === 0 ? (
          <Text color={SUB}>
            {current === '완료' ? '아직 끝낸 일이 없어요.' : '할 일이 없어요. ＋를 누르거나 /todo로 추가하세요. 예: "/todo 견적서 검토 15:00"'}
          </Text>
        ) : (
          <Box flexDirection="column" rowGap={1}>
            {pairs(shown).map((row, i) => (
              <Box key={`row-${i}`} flexDirection="row" columnGap={1}>
                {row.map(card)}
              </Box>
            ))}
          </Box>
        )}

      </Box>
    )
  })
}

/** 🗓 오늘 할 일's session start. Run from the band's hook of the same event: a plugin gets one hook per event */
export async function tasksSessionStart($: EngineInterface, e: any, next: (e: any) => any) {
  const result = await next(e)
  const saved = cleanTasks(await $.store.get('tasks'))
  await update($, tasks, () => saved)
  const who = await $.store.get('name')
  if (typeof who === 'string' && who.trim() !== '') await update($, name, () => who)
  await $.command.register({
    name: 'todo',
    description: '🗓 오늘 할 일: 할 일 추가 (비우면 패널 열기)',
    argumentHint: '견적서 검토 15:00 #급함',
  })
  const savedMin = parseMinutes(String((await $.store.get('pomo-minutes')) ?? ''))
  if (savedMin) await update($, minutes, () => savedMin)
  const savedDone = (await $.store.get('pomo-done')) as { day?: unknown; done?: unknown } | undefined
  const today = dayOf(await $.clock.now())
  const doneToday = savedDone?.day === today && typeof savedDone.done === 'number' ? savedDone.done : 0
  await update($, pomo, p => (p.day === '' ? { ...freshPomo(today, savedMin ?? DEFAULT_MINUTES), done: doneToday } : rollDay(p, today)))
  await $.command.register({ name: 'pomodoro', description: '포모도로 집중·휴식 분 바꾸기', argumentHint: '25 5' })
  $.clock.every(1000, () => void pomoTick($))
  await $.command.register({ name: 'todo-name', description: '🗓 오늘 할 일 인사말 이름 바꾸기', argumentHint: '이름' })
  return result
}
