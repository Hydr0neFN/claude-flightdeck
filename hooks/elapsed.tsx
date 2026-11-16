// A running agent's clock, ticking on the surface's frame clock so the pane need not redraw.
// `since` and `now` come from the hooks module's $.clock; between redraws it adds its own ticks.
import type { ClientModule } from 'claude-code'

/** `span`: the work tree's compact form (`16m`, `1m12s`, `1h05m`), as `fmtSpan` in core.ts. */
type Props = { since: number; now: number; endAt: number | null; color: string; span?: boolean }
type Ref = { base: number; ticks: number; lastNow: number; isRunning: boolean }
type State = { ref: Ref }

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

const fmtSpan = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  if (m === 0) return `${s}s`
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  return s % 60 === 0 ? `${m}m` : `${m}m${String(s % 60).padStart(2, '0')}s`
}

const Elapsed: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const ref = surface.state?.ref ?? { base: 0, ticks: 0, lastNow: -1, isRunning: true }
  if (props.now !== ref.lastNow) {
    // A fresh reading from the hooks module: restart the local count from it.
    ref.lastNow = props.now
    ref.base = (props.endAt ?? props.now) - props.since
    ref.ticks = 0
  }
  ref.isRunning = props.endAt === null
  if (surface.state === undefined) {
    surface.setState({ ref })
    surface.every(1000, () => {
      if (ref.isRunning) {
        ref.ticks += 1
        surface.setState({ ref })
      }
    })
  }
  return <Text color={props.color}>{(props.span ? fmtSpan : fmt)(ref.base + ref.ticks * 1000)}</Text>
}

export default Elapsed
