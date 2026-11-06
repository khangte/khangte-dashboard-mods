/** What the band draws; a field the engine did not report is left out. */
export type Usage = {
  session?: number
  sessionReset?: string
  week?: number
  weekReset?: string
  context?: number
}

/** This computer's state; a value that could not be read is left out. */
export type Sys = { cpu?: number; ram?: number; ramUsedGb?: number; ramTotalGb?: number; battery?: number }

/** Checklist progress: `[x]` count over all `[ ]`/`[x]` items. */
/** A /todo task as today-tasks keeps it; only what the bands read. */
export type TodoTask = { title: string; day: string; due?: string; done: boolean }

/** Clock-in and clock-out times, `HH:MM`. */
export type Hours = { start: string; end: string }

/** Which items are on, and the top-to-bottom order of the bands. */
export type Settings = { version?: number; enabled: Record<string, boolean>; order: string[] }

/** Claude's own checklist for the work at hand, as its task-list calls left it. */
export type PlanItem = { content: string; status: 'pending' | 'in_progress' | 'completed' }
export type Plan = { items: PlanItem[] }

export type Tag = '급함' | '업무' | '중요'
export type Tab = '오늘' | '예정' | '완료'
/** One to-do: `day` is `YYYY-MM-DD`, `due` an optional `HH:MM` that day. */
export type Task = { id: string; title: string; tag: Tag; due?: string; day: string; done: boolean }

/** Focus and rest lengths, in minutes. */
export type Minutes = { focus: number; rest: number }
/** The tomato timer: which phase, whether it runs, when it ends (running) or how long is left (paused, idle). */
export type Pomo = { mode: 'focus' | 'rest'; status: 'idle' | 'running' | 'paused'; endsAt: number; leftMs: number; done: number; day: string }

/** This turn's counters: seconds worked, tool calls, and the phrase the turn starts on. */
export type Turn = { sec: number; tools: number; base: number }

declare module 'claude-code' {
  interface PluginState {
    'khangte-dashboard-mods': {
      // the band and its panes
      usage: Usage | null; sys: Sys | null; frame: number; hours: Hours; tick: number; settings: Settings; isShielded: boolean
      plan: Plan | null; effort: string; model: string; memo: string; quick: string[] | null; memoReady: boolean; memoBlink: number
      // 🗓 오늘 할 일
      tasks: Task[]; tab: Tab; name: string; pomo: Pomo; minutes: Minutes; taskTick: number
      // the spinner
      turn: Turn
    }
  }
}
