// Pure data: defaults, reducers, formatting and layout math. Nothing here touches `$`, so every
// behaviour is testable directly (the test kit cannot raise a subagent's tool call or a
// permission check inside a call; these functions are what the hooks apply).
import type {
  AgentCard,
  Architect,
  Bucket,
  Check,
  ConsultEngine,
  ConsultEngineState,
  ConsultLock,
  ConsultRun,
  ConsultState,
  Feed,
  Gate,
  GemLimit,
  Layout,
  LogLine,
  Loop,
  Main,
  Moment,
  Receipt,
  Roster,
  Tally,
  ToolNote,
  Turn,
  Usage,
  View,
} from '../types'

export const SCHEMA_VERSION = 2

// ---------------------------------------------------------------- defaults

export const DEFAULT_MAIN: Main = { model: '', effort: '', mode: '', steps: 0, isRunning: false, speed: null }
export const DEFAULT_USAGE: Usage = {
  pct: null,
  tokens: null,
  window: 0,
  compactWindow: null,
  compactFor: 0,
  compactMisses: 0,
  costUsd: null,
  limits: [],
  compactions: 0,
  lastCompactAt: null,
  isCompactEstimate: false,
  isCompactHooked: false,
  hasFill: false,
}
export const DEFAULT_ARCHITECT: Architect = { consults: [], ids: [], seen: [], lastAdvice: '' }
const ZERO: Tally = { rule: 0, ask: 0, cleared: 0, deny: 0 }
export const DEFAULT_GATE: Gate = { recent: [], totals: { file: ZERO, shell: ZERO, other: ZERO } }
export const DEFAULT_TURN: Turn = { edits: 0, errorStreak: 0, errors: 0, isReviewing: false, startedAt: 0, costAtStart: null }
export const DEFAULT_VIEW: View = { expanded: null, gateOpen: null, layout: null }
export const DEFAULT_ROSTER: Roster = { architectTypes: [] }

export const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A stored object merged over its defaults, so a value saved under an older shape still reads. */
export const normalize = <T extends object>(def: T, stored: unknown): T =>
  isObject(stored) ? ({ ...def, ...stored } as T) : def

/** A stored list, or empty when what is stored is not a list. */
export const listOf = <T>(stored: unknown): T[] => (Array.isArray(stored) ? (stored as T[]) : [])

export const normalizeGate = (stored: unknown): Gate => {
  const g = normalize(DEFAULT_GATE, stored)
  const totals = normalize(DEFAULT_GATE.totals, g.totals)
  return {
    recent: listOf<Check>(g.recent),
    totals: { file: normalize(ZERO, totals.file), shell: normalize(ZERO, totals.shell), other: normalize(ZERO, totals.other) },
  }
}

export const normalizeCard = (stored: unknown): AgentCard =>
  normalize<AgentCard>(
    {
      id: '',
      type: 'agent',
      model: '',
      description: '',
      status: 'running',
      spawnedAt: 0,
      endedAt: null,
      ctx: 0,
      out: 0,
      steps: 0,
      lastStop: null,
      tools: [],
      answer: '',
      worker: '',
      jobdir: '',
      workerCost: null,
    },
    stored,
  )

export const normalizeLog = (stored: unknown): LogLine[] =>
  listOf<Record<string, unknown>>(stored).map(l => ({
    at: typeof l.at === 'number' ? l.at : 0,
    who: String(l.who ?? ''),
    text: String(l.text ?? ''),
    agentId: typeof l.agentId === 'string' ? l.agentId : null,
    kind: l.kind === 'error' || l.kind === 'consult' || l.kind === 'done' ? l.kind : 'info',
  }))

// ---------------------------------------------------------------- config

export type Panel = 'main' | 'architect' | 'consult' | 'gate' | 'agents' | 'loops' | 'receipt' | 'log'
const PANELS: readonly Panel[] = ['main', 'architect', 'consult', 'gate', 'agents', 'loops', 'receipt', 'log']

export type Config = {
  architect: RegExp
  architectLabel: string
  gateLabel: string
  panels: Panel[]
  motion: boolean
  moments: boolean
  matchDescriptions: boolean
  maxCards: number
  paneColumns: number
  layout: Layout
  palette: Palette
  openOnStart: boolean
  statusLine: boolean
  feedCommand: string[]
  /** Tokens the context gauge measures against when fewer than the host's window; 0 = the host's window. */
  ctxBudget: number
  /** Directory holding external consult run files; '' = ~/.claude/state/consult-runs. */
  consultDir: string
}

const safeRegExp = (source: string, fallback: string) => {
  try {
    return new RegExp(source || fallback, 'i')
  } catch {
    return new RegExp(fallback, 'i')
  }
}

export const parseFeedCommand = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    if (!parsed.every((x): x is string => typeof x === 'string') || parsed[0] === '') return []
    return parsed
  } catch {
    return []
  }
}

/** The plugin's `/config` values, read leniently: anything malformed falls back to the default. */
export const parseConfig = (o: Readonly<Record<string, unknown>>): Config => {
  const str = (k: string, d: string) => (typeof o[k] === 'string' && o[k] !== '' ? (o[k] as string) : d)
  const bool = (k: string, d: boolean) => (typeof o[k] === 'boolean' ? (o[k] as boolean) : d)
  const panels = str('panels', PANELS.join(','))
    .split(',')
    .map(s => s.trim())
    .filter((p): p is Panel => (PANELS as readonly string[]).includes(p))
  const layout = str('layout', 'auto')
  const max = typeof o.maxCards === 'number' ? Math.round(o.maxCards) : 3
  const cols = typeof o.paneColumns === 'number' && Number.isFinite(o.paneColumns) ? Math.round(o.paneColumns) : 66
  return {
    architect: safeRegExp(str('architectPattern', ''), 'advisor|architect'),
    architectLabel: str('architectLabel', 'ARCHITECT'),
    gateLabel: str('gateLabel', 'GATE'),
    panels: panels.length > 0 ? [...new Set(panels)] : [...PANELS],
    motion: str('motion', 'while-active') !== 'off',
    moments: bool('moments', true),
    matchDescriptions: bool('matchDescriptions', false),
    maxCards: Math.min(6, Math.max(1, max)),
    // The body clamps its drawing at 40 columns, so a narrower dock would only clip it.
    paneColumns: Math.max(40, cols),
    layout: layout === 'compact' || layout === 'wide' || layout === 'mini' ? layout : 'auto',
    palette: str('palette', 'theme') === 'pastel' ? 'pastel' : 'theme',
    openOnStart: bool('openOnStart', true),
    statusLine: bool('statusLine', true),
    feedCommand: parseFeedCommand(o.feedCommand),
    ctxBudget: typeof o.ctxBudget === 'number' && Number.isFinite(o.ctxBudget) && o.ctxBudget > 0 ? Math.round(o.ctxBudget) : 0,
    consultDir: typeof o.consultDir === 'string' ? o.consultDir.trim() : '',
  }
}

// ---------------------------------------------------------------- palette

export type Palette = 'theme' | 'pastel'
export type Colors = Record<'main' | 'agent' | 'gate' | 'cleared' | 'arch' | 'amber' | 'warn' | 'dim' | 'faint' | 'text', string>

/**
 * `theme` names the person's own theme colours (they follow light, dark and colour-blind themes);
 * `pastel` is fixed hex tuned for dark terminals.
 */
export const PALETTES: Record<Palette, Colors> = {
  theme: {
    main: 'claude',
    agent: 'suggestion',
    gate: 'success',
    cleared: 'permission',
    arch: 'merged',
    amber: 'warning',
    warn: 'error',
    dim: 'inactive',
    faint: 'subtle',
    text: 'text',
  },
  pastel: {
    main: '#7dd3fc',
    agent: '#93c5fd',
    gate: '#86efac',
    cleared: '#5eead4',
    arch: '#c4b5fd',
    amber: '#fcd34d',
    warn: '#fca5a5',
    dim: '#6b7280',
    faint: '#3f4654',
    text: '#e5e7eb',
  },
}

/** SVG cannot name theme keys: mid-tone colours that read on light and dark backgrounds. */
export const SVG_COLORS = { running: '#3b82f6', done: '#16a34a', failed: '#dc2626', other: '#8b5cf6', label: '#6b7280' }

// ---------------------------------------------------------------- formatting

/** `claude-opus-5-5` → `Opus 5.5`; anything else is shown as given. */
/**
 * A model id as people say it, from any provider's spelling: `claude-opus-5-5[1m]` → `Opus 5.5 1M`,
 * `us.anthropic.claude-sonnet-4-5-20250929-v1:0` → `Sonnet 4.5`, `claude-3-5-haiku-20241022` →
 * `Haiku 3.5`. Anything else is shown as given, cut to 22 characters.
 */
export const prettyModel = (id: string) => {
  if (!id) return '—'
  const cap = (f: string) => f.charAt(0).toUpperCase() + f.slice(1)
  const big = /\[1m\]|-1m\b/i.test(id) ? ' 1M' : ''
  const now = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?![\d])/i.exec(id)
  if (now?.[1] && !/^\d/.test(now[1])) return `${cap(now[1].toLowerCase())} ${now[2]}${now[3] ? `.${now[3]}` : ''}${big}`
  const old = /claude-(\d+)(?:-(\d))?-([a-z]+)/i.exec(id)
  if (old?.[3]) return `${cap(old[3].toLowerCase())} ${old[1]}${old[2] ? `.${old[2]}` : ''}${big}`
  return shorten(id, 22)
}

export const shorten = (s: string, n: number) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return n <= 0 ? '' : one.length > n ? `${one.slice(0, Math.max(0, n - 1)).trimEnd()}…` : one
}

// ---------------------------------------------------------------- delegated workers

/**
 * A job runner's backend label as a short model name for a narrow card: `agy:gemini-4-hydrogen-high` →
 * `Hydrogen`, `agy:claude-sonnet-5-5-high` → `Sonnet 5.5`, `azure:gpt-6.1-sol` → `GPT 6.1`,
 * `paid-flash` → `DS Flash`, `opencode:opencode/qwen3-coder-free` → `qwen3-coder`. '' for ''.
 */
export const shortWorker = (backend: string): string => {
  const b = backend.trim()
  if (!b) return ''
  const model = b.includes(':') ? b.slice(b.indexOf(':') + 1) : b
  const id = (model.split('/').pop() ?? model).toLowerCase()
  if (id === 'paid-flash' || /deepseek/.test(id)) return 'DS Flash'
  if (/claude-/.test(id)) return prettyModel(id)
  // A Gemini with a codename goes by it (`gemini-4-hydrogen-high` → `Hydrogen`, `gemini-4-argon-high` → `Argon`).
  const code = /^gemini-[\d.]+-([a-z]+)(?:-(?:low|medium|high|xhigh|max))?$/.exec(id)
  if (code?.[1] && !/^(pro|flash|lite|low|medium|high|xhigh|max)$/.test(code[1])) return code[1].charAt(0).toUpperCase() + code[1].slice(1)
  const gem = /^gemini-(\d+(?:\.\d+)?)/.exec(id)
  if (gem?.[1]) return `Gemini ${gem[1]}`
  const gpt = /^gpt-(\d+(?:\.\d+)?)/.exec(id)
  if (gpt?.[1]) return `GPT ${gpt[1]}`
  return shorten(id.replace(/[:-]free$/, ''), 12)
}

/** The last `key: value` of `key` in a job runner's printed block, '' when none. */
const lastField = (text: string, key: string) => {
  let found = ''
  for (const m of text.matchAll(new RegExp(`^(?: *\\d+[\\t→])?${key}: *(\\S.*)$`, 'gm'))) found = (m[1] ?? '').trim()
  return found
}

/**
 * What a job runner's output says about the worker: its `backend:` (the model that did the work) and
 * its `jobdir:` (where the running job keeps its state). Either is '' when the text does not say.
 */
export const parseJobText = (text: unknown): { backend: string; jobdir: string } => {
  const t = typeof text === 'string' ? text : ''
  const backend = lastField(t, 'backend')
  return { backend: /^[\w.:/@-]{2,80}$/.test(backend) ? backend : '', jobdir: lastField(t, 'jobdir') }
}

/** USD per CNY for a job runner's CNY estimate (DeepSeek bills in CNY). An estimate, as the runner's own figure is. */
export const CNY_USD = 0.14

/**
 * A job's cost in USD from its report's `cost_cny_est=`: `0 (agy subscription quota)` → 0,
 * `0.392 (assumed price …)` → CNY × CNY_USD, `USD 0.0123 (Azure credit …)` → 0.0123. null when unsaid or `?`.
 */
export const parseJobCost = (text: unknown): number | null => {
  const t = typeof text === 'string' ? text : ''
  let found: number | null = null
  for (const m of t.matchAll(/cost_cny_est[=:] *(USD +)?(\d+(?:\.\d+)?)/g)) {
    const n = Number(m[2])
    if (Number.isFinite(n)) found = m[1] ? n : n * CNY_USD
  }
  return found
}

/** A card after one of its tool calls printed job runner output: the newest worker, job dir and cost win. */
export const noteJob = (c: AgentCard, text: unknown): AgentCard => {
  const j = parseJobText(text)
  const cost = j.backend ? parseJobCost(text) : null
  if (!j.backend && !j.jobdir) return c
  return { ...c, worker: j.backend || c.worker, jobdir: j.jobdir || c.jobdir, workerCost: cost ?? c.workerCost }
}

/** A worker's cost as a card shows it: `free`, `$0.05`, `<$0.01`; '' while unknown. */
export const fmtWorkerCost = (n: number | null) => (n === null ? '' : n === 0 ? 'free' : n < 0.005 ? '<$0.01' : fmtUsd(n))

/**
 * What the workers of the cards spawned since `since` cost, in USD: null when no card there knows its
 * worker's cost, so a turn without job runners shows nothing.
 */
export const jobsCost = (cards: AgentCard[], since: number): number | null => {
  const known = cards.filter(c => c.spawnedAt >= since && c.workerCost !== null)
  return known.length === 0 ? null : known.reduce((s, c) => s + (c.workerCost ?? 0), 0)
}

/**
 * The argv that prints a job's worker: a finished job's `backend` from its `state.json` (the model whose
 * work was kept), else the `trying` file (the attempt now running), else `backend`. Prints nothing when none says.
 */
export const workerProbe = (python: string, jobdir: string): string[] => [
  python,
  '-c',
  'import json,os,sys\nd=sys.argv[1]\ntry:\n s=json.load(open(os.path.join(d,"state.json")))\nexcept Exception:\n s={}\n'
    + 'if s.get("backend") and s.get("status") not in ("running","parked",None):\n print(s["backend"])\nelse:\n'
    + ' try:\n  print(open(os.path.join(d,"trying")).read().strip())\n except Exception:\n  print(s.get("backend") or "")',
  jobdir,
]

export const kTokens = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

/** A running clock as the live cards draw it: m:ss, or XhYY past an hour. */
export const fmtTimer = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}

export const fmtClock = (ms: number) => (ms > 0 ? new Date(ms).toTimeString().slice(0, 8) : '--:--:--')

/** `1 error`, `2 errors`. */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export const fmtUsd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

export const fmtCny = (n: number) => `¥${Number(n.toFixed(2)) + 0}`

/** Parse external feed stdout JSON; returns null if invalid JSON or not an object. */
export const parseFeed = (stdout: string, at = 0): Feed | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!isObject(raw)) return null
  const task = typeof raw.task === 'string' ? raw.task.trim() : ''
  const cwd = typeof raw.cwd === 'string' ? raw.cwd.trim() : ''
  const branch = typeof raw.branch === 'string' ? raw.branch.trim() : ''
  const dsCny = typeof raw.ds_cny === 'number' && Number.isFinite(raw.ds_cny) ? raw.ds_cny : null
  const gem: GemLimit[] = []
  if (Array.isArray(raw.gem)) {
    for (const item of raw.gem) {
      if (!isObject(item)) continue
      if (typeof item.label !== 'string' || item.label.trim() === '') continue
      if (typeof item.pct !== 'number' || !Number.isFinite(item.pct)) continue
      const parsedAt = typeof item.resets_at === 'string' ? Date.parse(item.resets_at) : NaN
      gem.push({
        label: item.label.trim(),
        pct: Math.max(0, Math.min(100, item.pct)),
        resetsAt: Number.isFinite(parsedAt) ? parsedAt : null,
      })
      if (gem.length >= 2) break
    }
  }
  return { task, cwd, branch, dsCny, gem, at }
}

/** Stored feed state normalized safely over defaults, or null if not yet read. */
export const normalizeFeed = (stored: unknown): Feed | null => {
  if (!isObject(stored)) return null
  const gem = listOf<unknown>(stored.gem)
    .filter((g): g is Record<string, unknown> => isObject(g) && typeof g.label === 'string' && g.label.trim() !== '' && typeof g.pct === 'number' && Number.isFinite(g.pct))
    .slice(0, 2)
    .map(g => ({
      label: (g.label as string).trim(),
      pct: Math.max(0, Math.min(100, g.pct as number)),
      resetsAt: typeof g.resetsAt === 'number' && Number.isFinite(g.resetsAt) ? g.resetsAt : null,
    }))
  return {
    task: typeof stored.task === 'string' ? stored.task.trim() : '',
    cwd: typeof stored.cwd === 'string' ? stored.cwd.trim() : '',
    branch: typeof stored.branch === 'string' ? stored.branch.trim() : '',
    dsCny: typeof stored.dsCny === 'number' && Number.isFinite(stored.dsCny) ? stored.dsCny : null,
    gem,
    at: typeof stored.at === 'number' && Number.isFinite(stored.at) ? stored.at : 0,
  }
}

/**
 * How soon a request began to answer: from when it was sent to its first piece of response; null when
 * none came. No output rate: the reported tokens include thinking, which may arrive unstreamed before
 * that first piece, so tokens over the visible stream read in the thousands per second.
 */
export const stepSpeed = (sentAt: number, firstAt: number | null) => (firstAt === null ? null : { ttftMs: Math.max(0, firstAt - sentAt) })

/** `ttft 0.8s`. */
export const fmtSpeed = (s: { ttftMs: number }) => `ttft ${(s.ttftMs / 1000).toFixed(1)}s`

/** The compaction window a context breakdown reports: its `rawMaxTokens` when auto-compaction is on and that is smaller than the model's `window`; else null. */
export const compactWindowOf = (b: { rawMaxTokens: number; isAutoCompactEnabled: boolean } | null | undefined, window: number): number | null =>
  b && b.isAutoCompactEnabled && b.rawMaxTokens > 0 && b.rawMaxTokens < window ? b.rawMaxTokens : null

/**
 * What the context gauge measures: the compaction window when one is set smaller than the model's,
 * else the model's window, and the fill of it from the real `tokens` reading. No gauge (null) without one.
 */
export const contextFill = (u: Pick<Usage, 'tokens' | 'window' | 'compactWindow'>, budget = 0): { pct: number | null; window: number } => {
  const host = u.compactWindow !== null && u.compactWindow > 0 && u.compactWindow < u.window ? u.compactWindow : u.window
  // A budget (option ctxBudget) smaller than the host's window is the one the person works to.
  const window = budget > 0 && (host <= 0 || budget < host) ? budget : host
  return { window, pct: u.tokens !== null && window > 0 ? (u.tokens * 100) / window : null }
}

/** Reads of the compaction window that may miss (no session bound yet) before a model window stops asking. */
export const COMPACT_TRIES = 3

/**
 * A measurement of model window `window`: whether it reads the compaction window (not read for this
 * window yet, fewer than COMPACT_TRIES misses), and the usage with that read claimed. A new window
 * starts its misses afresh.
 */
export const claimCompactRead = (u: Usage, window: number): { usage: Usage; isClaimed: boolean } => {
  const misses = u.window === window ? u.compactMisses : 0
  const isClaimed = window > 0 && u.compactFor !== window && misses < COMPACT_TRIES
  return { usage: { ...u, compactFor: isClaimed ? window : u.compactFor, compactMisses: misses }, isClaimed }
}

/**
 * The usage after a compaction-window read for model window `window`. Dropped when a newer claim took
 * its place (a model switch); a read that failed or came back with no breakdown is a miss, asked
 * again at the next measurement.
 */
export const afterCompactRead = (
  u: Usage,
  window: number,
  b: { rawMaxTokens: number; isAutoCompactEnabled: boolean } | null | undefined,
): Usage =>
  u.compactFor !== window
    ? u
    : b
      ? { ...u, compactWindow: compactWindowOf(b, window), compactMisses: 0 }
      : { ...u, compactWindow: null, compactFor: 0, compactMisses: u.compactMisses + 1 }

/** A new main-loop model may compact in another window (`modelSettings`): read afresh at the next measurement. */
export const forgetCompactRead = (u: Usage): Usage => ({ ...u, compactWindow: null, compactFor: 0, compactMisses: 0 })

/**
 * A main-loop request about to go out, and whether `$.session.usage()` reports a fill for it. Claude Code
 * reports none until the first response after a new session, a /clear or a compaction. So no fill after a
 * response came back means the context was compacted (a /clear resets `hasFill` before this). It counts as an
 * estimate, and only until session.compact reaches Flightdeck, whose count is the real one.
 */
export const afterFillRead = (u: Usage, hasFill: boolean, now: number): { usage: Usage; isCompaction: boolean } => {
  if (hasFill) return { usage: u.hasFill ? u : { ...u, hasFill: true }, isCompaction: false }
  if (!u.hasFill) return { usage: u, isCompaction: false }
  if (u.isCompactHooked) return { usage: { ...u, hasFill: false }, isCompaction: false }
  return {
    usage: { ...u, hasFill: false, compactions: u.compactions + 1, lastCompactAt: now, isCompactEstimate: true },
    isCompaction: true,
  }
}

/** A main-loop response came back: the context has a fill until the next compaction. */
export const afterResponse = (u: Usage): Usage => (u.hasFill ? u : { ...u, hasFill: true })

/**
 * session.compact reached Flightdeck, so the guard isn't in the way and every compaction will reach it.
 * An estimate made before it was something else (a rewind to the first prompt reads the same): dropped.
 */
export const afterCompactHooked = (u: Usage): Usage =>
  u.isCompactHooked ? u : { ...u, isCompactHooked: true, ...(u.isCompactEstimate ? { compactions: 0, lastCompactAt: null, isCompactEstimate: false } : {}) }

/** The compaction count as the pane marks it: `⟲2`, or `⟲~2` when estimated; empty before the first. */
export const compactMark = (u: Pick<Usage, 'compactions' | 'isCompactEstimate'>) =>
  u.compactions > 0 ? `⟲${u.isCompactEstimate ? '~' : ''}${u.compactions}` : ''

/** A gauge of `width` cells: ▰ filled, ▱ empty. */
export const gauge = (pct: number, width: number) => {
  const full = Math.max(0, Math.min(width, Math.round((pct / 100) * width)))
  return { on: '▰'.repeat(full), off: '▱'.repeat(width - full) }
}

/** A rate-limit reading as the pane keeps it, its ISO reset time turned into ms since the epoch. */
export const limitOf = (r: { kind: string; percentUsed: number; resetsAt?: string }) => {
  const at = r.resetsAt ? Date.parse(r.resetsAt) : NaN
  return { kind: r.kind, pct: r.percentUsed, resetsAt: Number.isFinite(at) ? at : null }
}

/** Time left until a window resets, its two largest units: `25m`, `3h10m`, `4d2h`; empty when unknown or past. */
export const fmtResetIn = (resetsAt: number | null | undefined, now: number) => {
  if (resetsAt === null || resetsAt === undefined || resetsAt <= now) return ''
  const m = Math.max(1, Math.floor((resetsAt - now) / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  if (d > 0) return `${d}d${h}h`
  return h > 0 ? `${h}h${String(m % 60).padStart(2, '0')}m` : `${m}m`
}

/** A feed quota's name cut to the 3 cells of the main card's meters: `gem` → `gem`, `gem pro` → `pro`, `agy claude weekly` → `cl`. */
export const feedLabel = (label: string) => {
  const s = label.trim().toLowerCase()
  if (/claude/.test(s)) return 'cl'
  const gem = /^gem(?:ini)?\s+(\S+)/.exec(s)
  if (gem?.[1]) return gem[1].slice(0, 3)
  if (/^gem/.test(s)) return 'gem'
  return s.slice(0, 3)
}

/** A rate-limit window's short name: `five_hour` → `5h`, `seven_day_opus` → `7d opus`. */
export const limitLabel = (kind: string) =>
  kind
    .replace(/five[_ -]?hours?/i, '5h')
    .replace(/seven[_ -]?days?/i, '7d')
    .replace(/[_-]+/g, ' ')
    .trim()

// ---------------------------------------------------------------- redaction

const SECRETS: [RegExp, string][] = [
  [/(authorization\s*[:=]\s*)(bearer\s+|basic\s+)?\S+/gi, '$1$2•••'],
  [/\b(bearer)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, '$1 •••'],
  [/\b(sk|pk|rk|ghp|gho|ghs|github_pat|xox[abprs])[-_][A-Za-z0-9_-]{8,}/g, '•••'],
  [/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd|pwd)\s*[=:]\s*)("[^"]*"|'[^']*'|\S+)/gi, '$1•••'],
  [/(--(?:token|password|api-key|secret)[= ])\S+/gi, '$1•••'],
  [/(\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)=)\S+/g, '$1•••'],
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:)[^\s@]+@/gi, '$1•••@'],
]

/** What the gate drill-down may store: credentials masked before anything is written to state. */
export const redact = (s: string) => SECRETS.reduce((t, [re, to]) => t.replace(re, to), s)

// ---------------------------------------------------------------- tools and gate

const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
export const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

export const bucketOf = (tool: string): Bucket =>
  FILE_TOOLS.has(tool) ? 'file' : SHELL_TOOLS.has(tool) ? 'shell' : 'other'

/** One line saying what a call was about: its command, path or pattern; redacted. */
export const describeInput = (tool: string, input: unknown) => {
  const i = isObject(input) ? input : {}
  const path = typeof i.file_path === 'string' ? i.file_path.split(/[\\/]/).slice(-2).join('/') : ''
  const what =
    typeof i.command === 'string'
      ? i.command
      : path || (typeof i.pattern === 'string' ? i.pattern : typeof i.url === 'string' ? i.url : typeof i.description === 'string' ? i.description : '')
  return redact(what ? `${tool} → ${what}` : tool)
}

/** Keeps the last `max` checks, but never drops a pending ask: its settle must still find it. */
export const trimRecent = (list: Check[], max: number): Check[] => {
  let extra = list.length - max
  if (extra <= 0) return list
  const out: Check[] = []
  for (const c of list) {
    if (extra > 0 && c.verdict !== 'ask') {
      extra -= 1
      continue
    }
    out.push(c)
  }
  return out.slice(-max * 2)
}

export const recordCheck = (g: Gate, c: Check): Gate => {
  const t = g.totals[c.bucket]
  return {
    recent: trimRecent([...g.recent, c], 80),
    totals: { ...g.totals, [c.bucket]: { ...t, [c.verdict]: t[c.verdict] + 1 } },
  }
}

/** An `ask` settled by the call that followed it: it ran (cleared) or was refused (deny). */
export const settleCheck = (g: Gate, id: string, didRun: boolean): Gate => {
  const c = g.recent.find(r => r.id === id && r.verdict === 'ask')
  if (!c) return g
  const verdict = didRun ? 'cleared' : 'deny'
  const t = g.totals[c.bucket]
  return {
    recent: g.recent.map(r => (r === c ? { ...r, verdict } : r)),
    totals: { ...g.totals, [c.bucket]: { ...t, ask: Math.max(0, t.ask - 1), [verdict]: t[verdict] + 1 } },
  }
}

export const gateSummary = (g: Gate) => {
  const all = (['file', 'shell', 'other'] as const).reduce(
    (s, k) => ({
      rule: s.rule + g.totals[k].rule,
      ask: s.ask + g.totals[k].ask,
      cleared: s.cleared + g.totals[k].cleared,
      deny: s.deny + g.totals[k].deny,
    }),
    { ...ZERO },
  )
  return { ...all, total: all.rule + all.ask + all.cleared + all.deny }
}

// ---------------------------------------------------------------- turn and architect

/**
 * The turn after one tool call. Errors count in the main loop only (a subagent's failure is its
 * own); edits count from every loop, so delegated work still reaches "before done".
 */
export const afterCall = (t: Turn, c: { inSubagent: boolean; hasFailed: boolean; isEdit: boolean }): Turn => ({
  ...t,
  errorStreak: c.inSubagent ? t.errorStreak : c.hasFailed ? t.errorStreak + 1 : 0,
  errors: t.errors + (!c.inSubagent && c.hasFailed ? 1 : 0),
  edits: t.edits + (c.isEdit ? 1 : 0),
})

/** Which of the architect's three moments a consult falls at: an inference over this turn so far. */
export const momentOf = (t: Pick<Turn, 'edits' | 'errorStreak'>): Moment =>
  t.errorStreak >= 2 ? 'error repeats' : t.edits === 0 ? 'before a plan' : 'before done'

export const startConsult = (a: Architect, c: { id: string; at: number; moment: Moment; via: string }): Architect =>
  a.consults.some(x => x.id === c.id) ? a : { ...a, consults: [...a.consults, { ...c, endAt: null }].slice(-40) }

/** Ends the open consult (the latest without an end), or the one named. */
export const endConsult = (a: Architect, at: number, advice: string | null, id?: string): Architect => {
  const open = [...a.consults].reverse().find(c => c.endAt === null && (id === undefined || c.id === id))
  return {
    ...a,
    consults: a.consults.map(c => (c === open ? { ...c, endAt: at } : c)),
    lastAdvice: advice ?? a.lastAdvice,
  }
}

export const isAdvising = (a: Architect) => a.consults.some(c => c.endAt === null)

/** A one-row timeline of consults across `width` cells: ◆ a consult, ━ while it ran. */
export const consultTimeline = (a: Architect, now: number, width: number) => {
  if (a.consults.length === 0 || width < 4) return '─'.repeat(Math.max(0, width))
  const first = a.consults[0]?.at ?? now
  const span = Math.max(1, now - first)
  const cells = Array.from({ length: width }, () => '─')
  for (const c of a.consults) {
    const from = Math.min(width - 1, Math.floor(((c.at - first) / span) * (width - 1)))
    const to = Math.min(width - 1, Math.floor((((c.endAt ?? now) - first) / span) * (width - 1)))
    for (let i = from + 1; i <= to; i += 1) cells[i] = '━'
    cells[from] = '◆'
  }
  return cells.join('')
}

export const receiptOf = (t: Turn, o: { durationMs: number; agentsSince: number; costNow: number | null; reason: string }): Receipt => ({
  durationMs: o.durationMs,
  agents: o.agentsSince,
  edits: t.edits,
  errors: t.errors,
  costDelta: o.costNow !== null && t.costAtStart !== null && o.costNow - t.costAtStart >= 0.005 ? o.costNow - t.costAtStart : null,
  reason: o.reason,
  since: t.startedAt,
})

// ---------------------------------------------------------------- agents and loops

type StepUsage = { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number } | null

/** A card after one of its model requests: its context is the latest step's whole input; output adds up. */
export const applyStep = (c: AgentCard, s: { model: string; usage: StepUsage; stopReason: string | null }): AgentCard => {
  const u = s.usage ?? {}
  const ctx = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
  return {
    ...c,
    model: c.model || s.model,
    steps: c.steps + 1,
    ctx: ctx > 0 ? ctx : c.ctx,
    out: c.out + (u.output_tokens ?? 0),
    lastStop: s.stopReason,
  }
}

export const noteTool = (c: AgentCard, n: ToolNote): AgentCard => ({ ...c, tools: [...c.tools, n].slice(-3) })

/** A surface module's fault key, `desktop:rail.tsx`, from `hooks/rail.tsx` or `hooks\rail.tsx` alike. */
export const faultKey = (surface: string, module: string) => `${surface}:${module.split(/[\\/]/).pop()}`

/** The first Claude Code release whose `Text` takes `mono`, the surface's monospaced face. */
export const MONO_SINCE = [2, 1, 299] as const

/**
 * Whether the engine a session runs on draws `Text`'s `mono`: its release (`base`, else `version`) is
 * 2.1.299 or later. False when there is no version or it is not spelled as one: the line is then drawn
 * without the face, which only a graphical surface would miss.
 */
export const knowsMono = (v: { version?: string; base?: string } | null | undefined): boolean => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v?.base ?? v?.version ?? '')
  if (!m) return false
  for (let i = 0; i < MONO_SINCE.length; i += 1) {
    const part = Number(m[i + 1])
    if (part !== MONO_SINCE[i]) return part > MONO_SINCE[i]!
  }
  return true
}

/** A card whose agent was resumed after it finished (SendMessage): running again, its clock from its first spawn. */
export const resumeCard = (c: AgentCard): AgentCard => ({ ...c, status: 'running', endedAt: null })

/**
 * A spawned card joins the list. An id already there is that agent resumed: its card runs again
 * where it stands, with its tallies and the new task and model, so no two cards share keys.
 */
export const addCard = (cards: AgentCard[], card: AgentCard): AgentCard[] =>
  cards.some(c => c.id === card.id)
    ? cards.map(c => (c.id === card.id ? resumeCard({ ...c, description: card.description || c.description, model: card.model || c.model }) : c))
    : [...cards, card].slice(-24)

export const stepLoop = (loops: Loop[], id: string, at: number): Loop[] => {
  const found = loops.find(l => l.id === id)
  const next = found
    ? loops.map(l => (l === found ? { ...l, steps: l.steps + 1, lastAt: at } : l))
    : [...loops, { id, steps: 1, firstAt: at, lastAt: at, isDone: false }]
  return next.slice(-60)
}

export const LOOP_ACTIVE_MS = 15_000
export const isLoopActive = (l: Loop, now: number) => !l.isDone && now - l.lastAt < LOOP_ACTIVE_MS

/** Swimlane geometry: each agent's bar on one shared axis from the first spawn to now. */
export const lanes = (cards: AgentCard[], now: number, width: number) => {
  const start = Math.min(...cards.map(c => c.spawnedAt).filter(n => n > 0), now)
  const span = Math.max(1, now - start)
  return cards.map(c => {
    const from = Math.floor(((Math.max(c.spawnedAt, start) - start) / span) * width)
    const to = Math.max(from + 1, Math.ceil((((c.endedAt ?? now) - start) / span) * width))
    return { id: c.id, before: Math.min(from, width), bar: Math.min(to, width) - Math.min(from, width), after: width - Math.min(to, width) }
  })
}

// ---------------------------------------------------------------- layout

/** How many log lines fit: what the other panels leave, never fewer than 4 nor more than 8. */
export const logRows = (bodyRows: number, used: number) => Math.max(4, Math.min(8, bodyRows - used - 3))

/** Legend items that fit on one row of `width` cells, in order; the rest are dropped. */
export const fitLegend = <T extends { label: string }>(items: T[], width: number) => {
  const out: T[] = []
  let used = 0
  for (const it of items) {
    const w = it.label.length + 4
    if (used + w > width) break
    out.push(it)
    used += w
  }
  return out
}

/** The cells a string takes in a terminal: one per character. */
export const cellWidth = (s: string) => [...s].length

/**
 * How many pieces of a line fit in `room` cells, in order from the start: each piece is `lead` extra cells
 * then `width`, and pieces sit `gap` cells apart. The rest are left out, as the legend's items are.
 */
export const piecesThatFit = (pieces: readonly { width: number; lead?: number }[], room: number, gap: number) => {
  let used = 0
  for (let i = 0; i < pieces.length; i += 1) {
    const p = pieces[i]!
    const next = used + (i > 0 ? gap : 0) + (p.lead ?? 0) + p.width
    if (next > room) return i
    used = next
  }
  return pieces.length
}

/**
 * How many marks (■ ✗ ● ○ ✓) a row of `cells` columns holds. A terminal draws each mark in one
 * cell; a graphical surface draws them wider (■ measured about 1.4 cells on the desktop app), so
 * there a row holds fewer and its newest marks still show.
 */
export const marksIn = (cells: number, isTerminal: boolean) => (isTerminal ? cells : Math.floor(cells / 1.5))

/** A card's title row: the task in the agent's own words, the type only when there is none. */
export const cardTitle = (c: AgentCard) => c.description || c.type

/** A title split over two rows at a word boundary: `first` cells on row one, `rest` on row two. */
export const titleLines = (title: string, first: number, rest: number): [string, string] => {
  const t = title.replace(/\s+/g, ' ').trim()
  if (t.length <= first) return [t, '']
  const cut = t.lastIndexOf(' ', first)
  const at = cut > 0 ? cut : first
  return [t.slice(0, at).trim(), shorten(t.slice(at), rest)]
}

/**
 * What a turn's opening text was, for the log: the person's words, or for a turn the engine
 * opened with a tagged message (a subagent's hand-back, a task notification), that message's kind.
 */
export const promptLine = (text: string): { who: string; text: string } => {
  const tag = /^\s*<([a-z][\w-]*)/i.exec(text)?.[1]
  if (!tag) return { who: 'you', text: shorten(text, 70) }
  const from = /\bfrom="([^"]+)"/.exec(text)?.[1]
  return { who: 'engine', text: shorten(`${tag.replace(/[-_]/g, ' ')}${from ? ` from ${from.slice(0, 8)}` : ''}`, 70) }
}

/**
 * A subagent's hand-back message: who sent it and the first line of what it said. The report
 * follows a framing header in the message; without one, the first line after the opening tag.
 */
export const handbackOf = (text: string): { from: string; body: string } | null => {
  const from = /^\s*<agent-message\s+from="([^"]+)"/.exec(text)?.[1]
  if (!from) return null
  const afterHeader = text.split(/The report follows:\s*\n/)[1]
  const rest = afterHeader ?? text.replace(/^\s*<agent-message[^>]*>/, '')
  const body =
    rest
      .split('\n')
      .map(l => l.trim())
      .find(l => l && !l.startsWith('[') && !l.startsWith('<') && !l.startsWith('</')) ?? ''
  return body ? { from, body } : null
}

/** The advice line a pane shows for a report: its first real line, markdown markers stripped, cut to 160. */
export const adviceLine = (report: string) => {
  const first = report.split('\n').map(l => l.trim()).find(l => l && !l.startsWith('[') && !l.startsWith('<')) ?? ''
  return shorten(first.replace(/\*\*|__/g, '').replace(/^[#>*\s-]+/, ''), 160)
}

export const elapsedOf = (c: AgentCard, now: number) => (c.endedAt ?? now) - c.spawnedAt

// ---------------------------------------------------------------- consult ring

export const CONSULT_HIDE_AFTER_MS = 10 * 60_000

/**
 * The argv that prints `{ run, locks }` from `dir` (or `~/.claude/state/consult-runs` when empty) and
 * `~/.claude/state/consult-locks.json`. Marks `run.stale = true` when `endedAt` is null and `os.kill(pid, 0)` fails.
 */
export const consultProbe = (python: string, dir: string): string[] => [
  python,
  '-c',
  'import json,os,sys\nhome=os.path.expanduser("~")\nd=os.path.expanduser(sys.argv[1]) if len(sys.argv)>1 and sys.argv[1] else os.path.join(home,".claude","state","consult-runs")\nlp=os.path.join(home,".claude","state","consult-locks.json")\nrun=None\ntry:\n files=[os.path.join(d,f) for f in os.listdir(d) if f.endswith(".json") and not f.startswith(".")]\n files=[f for f in files if os.path.isfile(f)]\n if files:\n  files.sort(key=lambda p:(os.stat(p).st_mtime_ns,os.path.basename(p)),reverse=True)\n  with open(files[0],"r",encoding="utf-8") as fh:\n   data=json.load(fh)\n  if isinstance(data,dict): run=data\nexcept Exception:\n run=None\nif isinstance(run,dict) and run.get("endedAt") is None:\n pid=run.get("pid")\n if isinstance(pid,int) and not isinstance(pid,bool) and pid>0:\n  try:\n   os.kill(pid,0)\n  except PermissionError:\n   pass\n  except OSError:\n   run["stale"]=True\n else:\n  run["stale"]=True\nlocks={}\ntry:\n with open(lp,"r",encoding="utf-8") as fh:\n  ld=json.load(fh)\n if isinstance(ld,dict): locks=ld\nexcept Exception:\n locks={}\nprint(json.dumps({"run":run,"locks":locks}))',
  dir,
]

const isEngineState = (v: unknown): v is ConsultEngineState =>
  v === 'queued' || v === 'running' || v === 'ok' || v === 'failed' || v === 'skipped'

const normalizeEngine = (raw: unknown): ConsultEngine | null => {
  if (!isObject(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return null
  return {
    name: raw.name.trim(),
    state: isEngineState(raw.state) ? raw.state : 'queued',
    startedAt: typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    endedAt: typeof raw.endedAt === 'number' && Number.isFinite(raw.endedAt) ? raw.endedAt : null,
    reason: typeof raw.reason === 'string' && raw.reason.trim() ? raw.reason.trim() : null,
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : null,
  }
}

const normalizeConsultRun = (raw: unknown): ConsultRun | null => {
  if (!isObject(raw) || !Array.isArray(raw.engines)) return null
  const engines = raw.engines.map(normalizeEngine).filter((e): e is ConsultEngine => e !== null)
  const endedAt = typeof raw.endedAt === 'number' && Number.isFinite(raw.endedAt) ? raw.endedAt : null
  return {
    v: typeof raw.v === 'number' && Number.isFinite(raw.v) ? raw.v : 1,
    id: typeof raw.id === 'string' ? raw.id : '',
    pid: typeof raw.pid === 'number' && Number.isFinite(raw.pid) ? raw.pid : 0,
    kind: typeof raw.kind === 'string' && raw.kind.trim() ? raw.kind.trim() : 'all',
    startedAt: typeof raw.startedAt === 'number' && Number.isFinite(raw.startedAt) ? raw.startedAt : 0,
    endedAt,
    question: typeof raw.question === 'string' ? raw.question.replace(/\s+/g, ' ').trim() : '',
    round: typeof raw.round === 'number' && Number.isFinite(raw.round) && raw.round >= 1 ? Math.round(raw.round) : 1,
    rounds: typeof raw.rounds === 'number' && Number.isFinite(raw.rounds) && raw.rounds >= 1 ? Math.round(raw.rounds) : 1,
    engines,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : null,
    stale: endedAt === null && raw.stale === true,
  }
}

const normalizeConsultLocks = (raw: unknown): Record<string, ConsultLock> => {
  const locks: Record<string, ConsultLock> = {}
  if (!isObject(raw)) return locks
  for (const [k, v] of Object.entries(raw)) {
    if (!isObject(v) || typeof v.until !== 'string') continue
    const ms = typeof v.untilMs === 'number' && Number.isFinite(v.untilMs) ? v.untilMs : Date.parse(v.until)
    locks[k] = {
      until: v.until,
      untilMs: Number.isFinite(ms) ? ms : null,
      reason: typeof v.reason === 'string' ? v.reason : '',
      at: typeof v.at === 'string' ? v.at : '',
    }
  }
  return locks
}

/** Parse `consultProbe` stdout JSON; returns null on malformed output. */
export const parseConsult = (stdout: string): ConsultState | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!isObject(raw) || (!('run' in raw) && !('locks' in raw))) return null
  if (raw.run !== undefined && raw.run !== null && !isObject(raw.run)) return null
  return {
    run: raw.run ? normalizeConsultRun(raw.run) : null,
    locks: normalizeConsultLocks(raw.locks),
  }
}

/** Stored consult state normalized safely over defaults, or null when unread. */
export const normalizeConsult = (stored: unknown): ConsultState | null => {
  if (!isObject(stored)) return null
  return {
    run: normalizeConsultRun(stored.run),
    locks: normalizeConsultLocks(stored.locks),
  }
}

export const isConsultShown = (c: ConsultState | null | undefined, now: number): boolean => {
  const run = c?.run
  if (!run) return false
  return run.endedAt === null || now - run.endedAt <= CONSULT_HIDE_AFTER_MS
}

export const isConsultLive = (c: ConsultState | null | undefined): boolean =>
  Boolean(c?.run && c.run.endedAt === null && !c.run.stale)

const KIND_LABELS: Record<string, string> = {
  all: 'consult',
  first: 'first-wins',
  debate: 'debate',
  round2: 'round 2',
}

export const consultKindLabel = (kind: string) => KIND_LABELS[kind] ?? (kind || 'consult')

/** Strip `:model` suffix / `/` variant and cap to `max` cells (default 12). */
export const shortConsultEngine = (name: string, max = 12): string => {
  const clean = name.trim()
  if (!clean) return '?'
  const noModel = clean.split(':')[0] ?? clean
  const base = noModel.split('/')[0] ?? noModel
  return shorten(base || clean, max)
}

export const consultGlyph = (state: ConsultEngineState): string =>
  state === 'ok' ? '●' : state === 'running' ? '◐' : state === 'failed' ? '✗' : state === 'skipped' ? '⊘' : '○'

export const activeConsultLocks = (
  locks: Record<string, ConsultLock>,
  now: number,
): { engine: string; hhmm: string; reason: string }[] => {
  const out: { engine: string; hhmm: string; reason: string }[] = []
  for (const [engine, lock] of Object.entries(locks)) {
    if (lock.untilMs === null || lock.untilMs <= now) continue
    out.push({
      engine: shortConsultEngine(engine),
      hhmm: new Date(lock.untilMs).toTimeString().slice(0, 5),
      reason: lock.reason,
    })
  }
  return out
}

// ---------------------------------------------------------------- ring geometry

export type RingCell = { x: number; y: number; glyph: string }
export type RingArcCell = RingCell & { lineGlyph: string; arrowGlyph: string; isArrow: boolean }
export type RingNodePos = {
  label: string
  width: number
  angle: number
  anchorX: number
  anchorY: number
  labelX: number
  labelY: number
  align: 'left' | 'right' | 'center'
}
export type RingBox = { x: number; y: number; width: number; height: number }
export type RingLayout = {
  cols: number
  rows: number
  cx: number
  cy: number
  rx: number
  ry: number
  centre: RingBox
  nodes: RingNodePos[]
  spokes: RingCell[][]
  arcs: RingArcCell[][]
}

type Pt = { x: number; y: number }

const bresenham = (x0: number, y0: number, x1: number, y1: number): Pt[] => {
  const pts: Pt[] = []
  let x = x0
  let y = y0
  const dx = Math.abs(x1 - x0)
  const sx = x0 < x1 ? 1 : -1
  const dy = -Math.abs(y1 - y0)
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    pts.push({ x, y })
    if (x === x1 && y === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
  return pts
}

const collapseCorners = (pts: Pt[], prot: Set<string>): Pt[] => {
  const out = [...pts]
  let changed = true
  while (changed) {
    changed = false
    for (let i = 1; i < out.length - 1; i += 1) {
      const a = out[i - 1]!
      const b = out[i]!
      const c = out[i + 1]!
      if (prot.has(`${b.x},${b.y}`)) continue
      if (
        Math.abs(a.x - c.x) === 1 &&
        Math.abs(a.y - c.y) === 1 &&
        Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1 &&
        Math.abs(c.x - b.x) + Math.abs(c.y - b.y) === 1
      ) {
        out.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return out
}

const symRound = (v: number) => (v >= 0 ? Math.round(v) : -Math.round(-v))

const stepGlyph = (dx: number, dy: number) => {
  if (dx === 0) return '│'
  if (dy === 0) return '─'
  return dx * dy > 0 ? '╲' : '╱'
}

const arrowGlyph = (dx: number, dy: number) => {
  if (dx === 0 && dy > 0) return '▼'
  if (dx === 0 && dy < 0) return '▲'
  if (dy === 0 && dx > 0) return '▶'
  if (dy === 0 && dx < 0) return '◀'
  if (dx > 0 && dy > 0) return '◢'
  if (dx < 0 && dy > 0) return '◣'
  if (dx > 0 && dy < 0) return '◥'
  if (dx < 0 && dy < 0) return '◤'
  return '●'
}

const arrowFromTangent = (vx: number, vy: number) => {
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI
  if (deg >= -22.5 && deg < 22.5) return '▶'
  if (deg >= 22.5 && deg < 67.5) return '◢'
  if (deg >= 67.5 && deg < 112.5) return '▼'
  if (deg >= 112.5 && deg < 157.5) return '◣'
  if (deg >= 157.5 || deg < -157.5) return '◀'
  if (deg >= -157.5 && deg < -112.5) return '◤'
  if (deg >= -112.5 && deg < -67.5) return '▲'
  return '◥'
}

/**
 * Computes balanced ellipse layout for `nodes` on a `cols x rows` cell grid:
 * `( MAIN )` centre box, clockwise spoke paths from each engine stopping 1 cell before `centre`,
 * and clockwise neighbour ring arcs.
 */
export const ringLayout = (nodes: readonly { label: string; width: number }[], cols: number, rows: number): RingLayout => {
  const n = nodes.length
  const x0 = Math.floor((cols - 8) / 2)
  const cy = Math.floor(rows / 2)
  const centre: RingBox = { x: x0 - 1, y: cy, width: 10, height: 1 }
  const cxLeft = x0 + 3
  const cxRight = x0 + 4
  const cx = Math.floor(cols / 2)
  const ry = Math.max(2, cy - 1)
  const rxMin = 6
  const rxTarget = Math.min(18, Math.round(ry * 3.0))
  let rxLimit = rxTarget
  for (let i = 0; i < n; i += 1) {
    const theta = (2 * Math.PI * i) / n
    const s = Math.sin(theta)
    const w = nodes[i]!.width
    if (s > 0.05) rxLimit = Math.min(rxLimit, (cols - cxRight - 2 - w) / s)
    else if (s < -0.05) rxLimit = Math.min(rxLimit, (cxLeft - 2 - w) / -s)
  }
  const rx = Math.max(rxMin, Math.min(rxTarget, Math.floor(rxLimit)))
  const inCentre = (x: number, y: number) => y === centre.y && x >= centre.x && x < centre.x + centre.width
  const ringX = (s: number) => (Math.abs(s) < 0.05 ? cx : s > 0 ? cxRight + Math.round(rx * s) : cxLeft - Math.round(rx * -s))

  const anchors = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / n
    const s = Math.sin(angle)
    const c = Math.cos(angle)
    return { ...node, angle, s, c, anchorX: ringX(s), anchorY: cy - symRound(ry * c) }
  })

  const arcs: RingArcCell[][] =
    n < 2
      ? nodes.map(() => [])
      : anchors.map((node, i) => {
          const t0 = (2 * Math.PI * i) / n
          const t1 = (2 * Math.PI * (i + 1)) / n
          const nextAnchor = anchors[(i + 1) % n]!
          const raw: Pt[] = [{ x: node.anchorX, y: node.anchorY }]
          const steps = 64
          for (let k = 1; k < steps; k += 1) {
            const t = t0 + ((t1 - t0) * k) / steps
            const x = ringX(Math.sin(t))
            const y = cy - symRound(ry * Math.cos(t))
            const prev = raw[raw.length - 1]!
            if (x !== prev.x || y !== prev.y) {
              if (Math.abs(x - prev.x) > 1 || Math.abs(y - prev.y) > 1) {
                const bridge = bresenham(prev.x, prev.y, x, y)
                for (let b = 1; b < bridge.length; b += 1) raw.push(bridge[b]!)
              } else {
                raw.push({ x, y })
              }
            }
          }
          const prev = raw[raw.length - 1]!
          if (prev.x !== nextAnchor.anchorX || prev.y !== nextAnchor.anchorY) {
            if (Math.abs(nextAnchor.anchorX - prev.x) > 1 || Math.abs(nextAnchor.anchorY - prev.y) > 1) {
              const bridge = bresenham(prev.x, prev.y, nextAnchor.anchorX, nextAnchor.anchorY)
              for (let b = 1; b < bridge.length; b += 1) raw.push(bridge[b]!)
            } else {
              raw.push({ x: nextAnchor.anchorX, y: nextAnchor.anchorY })
            }
          }
          const prot = new Set<string>([`${node.anchorX},${node.anchorY}`, `${nextAnchor.anchorX},${nextAnchor.anchorY}`])
          for (const pt of raw) if (pt.x === cxLeft - rx || pt.x === cxRight + rx) prot.add(`${pt.x},${pt.y}`)
          const clean = collapseCorners(raw, prot)
          if (clean.length > 1) clean.pop()
          const arrowIdx = Math.floor(clean.length / 2)
          const cells: RingArcCell[] = []
          for (let k = 0; k < clean.length; k += 1) {
            const p = clean[k]!
            const nxt = k < clean.length - 1 ? clean[k + 1]! : { x: nextAnchor.anchorX, y: nextAnchor.anchorY }
            const dx = Math.sign(nxt.x - p.x)
            const dy = Math.sign(nxt.y - p.y)
            const frac = clean.length > 1 ? k / (clean.length - 1) : 0.5
            const tk = t0 + (t1 - t0) * frac
            const aGlyph = arrowFromTangent(rx * Math.cos(tk), ry * Math.sin(tk) * 1.8)
            const lGlyph = stepGlyph(dx, dy)
            const isArrow = k === arrowIdx
            cells.push({ x: p.x, y: p.y, glyph: isArrow ? aGlyph : lGlyph, lineGlyph: lGlyph, arrowGlyph: aGlyph, isArrow })
          }
          return cells
        })

  const rowMinX = Array.from({ length: rows }, () => cxLeft)
  const rowMaxX = Array.from({ length: rows }, () => cxRight)
  for (const arc of arcs) {
    for (const pt of arc) {
      if (pt.y >= 0 && pt.y < rows) {
        rowMinX[pt.y] = Math.min(rowMinX[pt.y]!, pt.x)
        rowMaxX[pt.y] = Math.max(rowMaxX[pt.y]!, pt.x)
      }
    }
  }
  for (const nd of anchors) {
    if (nd.anchorY >= 0 && nd.anchorY < rows) {
      rowMinX[nd.anchorY] = Math.min(rowMinX[nd.anchorY]!, nd.anchorX)
      rowMaxX[nd.anchorY] = Math.max(rowMaxX[nd.anchorY]!, nd.anchorX)
    }
  }

  const placed: RingNodePos[] = anchors.map(nd => {
    let labelY = nd.anchorY
    let labelX = 0
    let align: RingNodePos['align'] = 'center'
    let label = nd.label
    let width = nd.width
    if (Math.abs(nd.s) < 0.05) {
      labelY = nd.c > 0 ? 0 : rows - 1
      if (width > cols) {
        label = shorten(label, cols)
        width = cellWidth(label)
      }
      labelX = Math.max(0, Math.min(cols - width, Math.round(cx - width / 2)))
      align = 'center'
    } else if (nd.s > 0) {
      const base = Math.max(nd.anchorX, rowMaxX[labelY] ?? nd.anchorX)
      const gap = base + 2 < cols ? 2 : 1
      const start = Math.min(cols - 1, base + gap)
      const room = Math.max(1, cols - start)
      if (width > room) {
        label = shorten(label, room)
        width = cellWidth(label)
      }
      labelX = start
      align = 'left'
    } else {
      const base = Math.min(nd.anchorX, rowMinX[labelY] ?? nd.anchorX)
      const gap = base - 2 >= 0 ? 2 : 1
      const end = Math.max(0, base - gap)
      const room = Math.max(1, end + 1)
      if (width > room) {
        label = shorten(label, room)
        width = cellWidth(label)
      }
      labelX = end - width + 1
      align = 'right'
    }
    return { label, width, angle: nd.angle, anchorX: nd.anchorX, anchorY: nd.anchorY, labelX, labelY, align }
  })

  const spokes: RingCell[][] = anchors.map(node => {
    const tx =
      Math.abs(node.s) < 0.05
        ? cx
        : Math.abs(node.c) < 0.45
          ? node.s > 0
            ? centre.x + centre.width - 1
            : centre.x
          : cx + symRound(3 * node.s)
    const raw = bresenham(node.anchorX, node.anchorY, tx, cy)
    const cut: Pt[] = []
    for (const p of raw) {
      if (inCentre(p.x, p.y)) break
      cut.push(p)
    }
    const cells: RingCell[] = []
    for (let k = 0; k < cut.length; k += 1) {
      const p = cut[k]!
      if (k === cut.length - 1) {
        let adx = 0
        let ady = 0
        if (Math.abs(node.s) < 0.15) {
          adx = 0
          ady = node.c > 0 ? 1 : -1
        } else if (p.y === cy) {
          adx = p.x < cx ? 1 : -1
          ady = 0
        } else {
          adx = p.x < cx ? 1 : -1
          ady = p.y < cy ? 1 : -1
        }
        cells.push({ x: p.x, y: p.y, glyph: arrowGlyph(adx, ady) })
      } else {
        const next = cut[k + 1]!
        cells.push({ x: p.x, y: p.y, glyph: stepGlyph(next.x - p.x, next.y - p.y) })
      }
    }
    return cells
  })

  return { cols, rows, cx, cy, rx, ry, centre, nodes: placed, spokes, arcs }
}

export type RingGridRun = { x: number; text: string; color: string; bold?: boolean; dim?: boolean }
export type RingAnimatedPath = { cells: RingCell[]; color: string; baseColor: string; stride: number; closed?: boolean }
export type RingSpinner = { x: number; y: number; color: string }
export type RingGrid = {
  width: number
  height: number
  active: boolean
  isDebate: boolean
  rows: RingGridRun[][]
  paths: RingAnimatedPath[]
  spinners: RingSpinner[]
  layout: RingLayout
}

type GridCell = { ch: string; color: string; bold?: boolean; dim?: boolean }

export const consultEngineDuration = (e: ConsultEngine, run: ConsultRun, now: number): string => {
  if (e.startedAt !== null && e.startedAt > 0) {
    if (e.endedAt !== null) return fmtDuration(e.endedAt - e.startedAt)
    if (e.state === 'running' && !run.stale && run.endedAt === null) return fmtDuration(now - e.startedAt)
  }
  return ''
}

/** Builds the coloured cell runs, animated paths and spinners for the consult/debate ring panel. */
export const buildConsultGrid = (run: ConsultRun, cols: number, colors: Colors, now: number): RingGrid => {
  const isDebate = run.round >= 2 || run.kind === 'round2'
  const height = run.engines.length <= 6 ? 11 : 13
  const maxSide = Math.max(8, Math.floor((cols - 16) / 2))
  const parts = run.engines.map(e => {
    const glyph = consultGlyph(e.state)
    const dur = consultEngineDuration(e, run, now)
    const nameMax = Math.min(12, Math.max(4, maxSide - 2 - (dur ? cellWidth(dur) + 1 : 0)))
    const name = shortConsultEngine(e.name, nameMax)
    const label = dur ? `${glyph} ${name} ${dur}` : `${glyph} ${name}`
    return { e, glyph, name, dur, label, width: cellWidth(label) }
  })
  const layout = ringLayout(
    parts.map(p => ({ label: p.label, width: p.width })),
    cols,
    height,
  )
  const buf: (GridCell | null)[][] = Array.from({ length: height }, () => Array.from({ length: cols }, () => null))
  const put = (x: number, y: number, ch: string, color: string, bold = false, dim = false) => {
    if (ch === ' ' || y < 0 || y >= height || x < 0 || x >= cols) return
    buf[y]![x] = { ch, color, bold, dim }
  }
  const putStr = (x: number, y: number, s: string, color: string, bold = false, dim = false) => {
    const chars = [...s]
    for (let i = 0; i < chars.length; i += 1) put(x + i, y, chars[i]!, color, bold, dim)
  }

  putStr(layout.centre.x + 1, layout.centre.y, '( MAIN )', colors.main, true)
  if (isDebate) {
    const tag = `⟳ R${run.round}/${run.rounds}`
    const tx = Math.max(0, Math.min(cols - cellWidth(tag), Math.round(layout.cx - cellWidth(tag) / 2)))
    putStr(tx, layout.centre.y + 1, tag, colors.arch)
  }

  const paths: RingAnimatedPath[] = []
  const isRunLive = run.endedAt === null && !run.stale

  if (!isDebate) {
    for (let i = 0; i < parts.length; i += 1) {
      const st = parts[i]!.e.state
      const spoke = layout.spokes[i] ?? []
      if (st === 'failed' || st === 'skipped' || spoke.length === 0) continue
      if (st === 'ok') {
        for (const c of spoke) put(c.x, c.y, c.glyph, colors.gate)
      } else if (st === 'queued') {
        for (let k = 0; k < spoke.length; k += 1) {
          const c = spoke[k]!
          put(c.x, c.y, k === spoke.length - 1 ? c.glyph : '·', colors.faint)
        }
      } else if (st === 'running') {
        for (const c of spoke) put(c.x, c.y, c.glyph, colors.agent)
        if (isRunLive) paths.push({ cells: spoke, color: colors.agent, baseColor: colors.dim, stride: Math.max(8, spoke.length + 3), closed: false })
      }
    }
  } else {
    const n = parts.length
    const partIdx = parts.map((p, i) => (p.e.state !== 'failed' && p.e.state !== 'skipped' ? i : -1)).filter(i => i >= 0)
    if (partIdx.length >= 2) {
      const anyRunning = isRunLive && parts.some(p => p.e.state === 'running')
      const allOk = partIdx.every(i => parts[i]!.e.state === 'ok')
      const staticColor = run.stale ? colors.amber : anyRunning ? colors.agent : allOk ? colors.gate : colors.faint
      const closedCells: RingCell[] = []
      for (let k = 0; k < partIdx.length; k += 1) {
        const from = partIdx[k]!
        const to = partIdx[(k + 1) % partIdx.length]!
        if (to === (from + 1) % n) {
          for (const c of layout.arcs[from] ?? []) {
            put(c.x, c.y, c.glyph, staticColor)
            closedCells.push({ x: c.x, y: c.y, glyph: c.glyph })
          }
        } else {
          const seg: RingArcCell[] = []
          for (let j = from; j !== to; j = (j + 1) % n) seg.push(...(layout.arcs[j] ?? []))
          const mid = Math.floor(seg.length / 2)
          for (let m = 0; m < seg.length; m += 1) {
            const c = seg[m]!
            const g = m === mid ? c.arrowGlyph : c.lineGlyph
            put(c.x, c.y, g, staticColor)
            closedCells.push({ x: c.x, y: c.y, glyph: g })
          }
        }
      }
      if (anyRunning && closedCells.length > 0) {
        paths.push({ cells: closedCells, color: colors.agent, baseColor: colors.dim, stride: 12, closed: true })
      }
    }
  }

  const spinners: RingSpinner[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const p = parts[i]!
    const nd = layout.nodes[i]!
    const st = p.e.state
    const stateColor =
      st === 'ok' ? colors.gate : st === 'running' ? colors.agent : st === 'failed' ? colors.warn : st === 'skipped' ? colors.amber : colors.faint
    const nameColor =
      st === 'queued' ? colors.faint : st === 'failed' ? colors.warn : st === 'skipped' ? colors.amber : colors.text
    const chars = [...nd.label]
    const nameEnd = Math.min(chars.length, 2 + cellWidth(p.name))
    for (let k = 0; k < chars.length; k += 1) {
      const ch = chars[k]!
      if (k === 0) put(nd.labelX, nd.labelY, ch, stateColor, st === 'ok' || st === 'running', st === 'queued')
      else if (k < nameEnd) put(nd.labelX + k, nd.labelY, ch, nameColor, false, st === 'queued')
      else put(nd.labelX + k, nd.labelY, ch, colors.dim, false, st === 'queued')
    }
    if (st === 'running' && isRunLive) spinners.push({ x: nd.labelX, y: nd.labelY, color: colors.agent })
  }

  const rows: RingGridRun[][] = buf.map(row => {
    const runs: RingGridRun[] = []
    for (let x = 0; x < cols; x += 1) {
      const cell = row[x]
      if (!cell) continue
      const last = runs[runs.length - 1]
      if (
        last &&
        last.x + cellWidth(last.text) === x &&
        last.color === cell.color &&
        Boolean(last.bold) === Boolean(cell.bold) &&
        Boolean(last.dim) === Boolean(cell.dim)
      ) {
        last.text += cell.ch
      } else {
        runs.push({ x, text: cell.ch, color: cell.color, ...(cell.bold ? { bold: true } : {}), ...(cell.dim ? { dim: true } : {}) })
      }
    }
    return runs
  })

  return {
    width: cols,
    height,
    active: isRunLive && (paths.length > 0 || spinners.length > 0),
    isDebate,
    rows,
    paths,
    spinners,
    layout,
  }
}
