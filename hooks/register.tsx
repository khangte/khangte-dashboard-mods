import type { Register } from 'claude-code'

import { register as band } from './band/register'
import { register as spinner } from './spinner/register'
import { register as tasks } from './tasks/register'

// One plugin, three parts: the band and its panes, 🗓 오늘 할 일, and the spinner. The band's session.start, tool.call and turn.complete also run the other parts' (one hook per event).
export const register: Register = (on, options) => {
  band(on, options)
  tasks(on, options)
  spinner(on, options)
}
