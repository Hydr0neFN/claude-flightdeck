// Pure data: defaults, reducers, formatting and layout math. Nothing here touches `$`, so every
// behaviour is testable directly (the test kit cannot raise a subagent's tool call or a
// permission check inside a call; these functions are what the hooks apply).
import type {
  AgentCard,
  Architect,
  Bucket,
  Check,
  CheckpointStep,
  CheckpointTail,
  ConsultEngine,
  ConsultEngineState,
  ConsultLock,
  ConsultRun,
  ConsultState,
  Feed,
  Gate,
  GemLimit,
  Issued,
  IssuedKind,
  Job,
  JobTokens,
  Layout,
  LogLine,
  Loop,
  Main,
  MeshTask,
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
      parentId: '',
      task: '',
      ctx: 0,
      out: 0,
      steps: 0,
      lastStop: null,
      tools: [],
      answer: '',
      worker: '',
      jobdir: '',
      workerCost: null,
      checkpoint: '',
      check: null,
      lastAt: 0,
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

export type Panel = 'main' | 'work' | 'architect' | 'consult' | 'gate' | 'agents' | 'loops' | 'receipt' | 'log'
const PANELS: readonly Panel[] = ['main', 'work', 'architect', 'consult', 'gate', 'agents', 'loops', 'receipt', 'log']

/** The panels a session shows unless its options say otherwise. */
export const DEFAULT_PANELS = 'main,work,consult,architect,loops,receipt'

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
  /** Directory holding one folder per farmer job; '' = ~/.claude/state/ds-jobs. */
  jobsDir: string
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
  const panels = str('panels', DEFAULT_PANELS)
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
    jobsDir: typeof o.jobsDir === 'string' ? o.jobsDir.trim() : '',
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

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const EFFORT_SUFFIX = /-(low|medium|high|xhigh|max)$/

/**
 * A worker as a job line says it, naming the effort too: `agy:gemini-4-hydrogen-xhigh` →
 * `Hydrogen xhigh`, `agy:claude-sonnet-5-5-high` → `agy Sonnet high`, `azure:gpt-6.1-sol` → `sol`.
 * Anything else is `shortWorker`'s name.
 */
export const workerDisplay = (backend: string): string => {
  const b = backend.trim()
  if (!b) return ''
  const i = b.indexOf(':')
  const prov = i >= 0 ? b.slice(0, i).toLowerCase() : ''
  const model = i >= 0 ? b.slice(i + 1) : b
  const id = (model.split('/').pop() ?? model).toLowerCase()
  const effort = EFFORT_SUFFIX.exec(id)?.[1] ?? ''
  if (prov === 'agy') {
    const gem = /^gemini-[\d.]+-([a-z]+)(?:-(?:low|medium|high|xhigh|max))?$/.exec(id)
    if (gem?.[1] && !/^(pro|flash|lite|low|medium|high|xhigh|max)$/.test(gem[1])) return `${cap(gem[1])}${effort ? ` ${effort}` : ''}`
    const fam = /^claude-([a-z]+)-/.exec(id)?.[1]
    if (fam) return `agy ${cap(fam)}${effort ? ` ${effort}` : ''}`
    const num = /^gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1]
    if (num) return `agy Gemini ${num}${effort ? ` ${effort}` : ''}`
  }
  if (prov === 'azure') {
    const code = /-([a-z]+)$/.exec(id)?.[1]
    if (code && !/^(low|medium|high|xhigh|max|free)$/.test(code)) return code
  }
  return shortWorker(b)
}

/** An agy-job leaf's worker: the ended handoff's `backend:` first, else its model (with `--effort`), else `agy`. */
export const agyWorker = (backend: string, model: string, effort = ''): string => {
  if (backend.trim()) return workerDisplay(backend)
  const m = model.trim().toLowerCase()
  if (!m) return 'agy'
  const fam = /^(opus|sonnet|haiku|fable|gemini|gpt)$/.exec(m)
  if (fam?.[1]) return `agy ${cap(fam[1])}${effort.trim() ? ` ${effort.trim()}` : ''}`
  return workerDisplay(`agy:${m}`)
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

/** A handoff `ds:` line's `tokens=in=<n> cache=<n> out=<n> think=<n>`, or null when it names none. */
export const parseHandoffTokens = (text: unknown): JobTokens | null => {
  const t = typeof text === 'string' ? text : ''
  const m = /tokens=in=(\d+)\s+cache=(\d+)\s+out=(\d+)\s+think=(\d+)/.exec(t)
  if (!m) return null
  return { in: Number(m[1]), cache: Number(m[2]), out: Number(m[3]), think: Number(m[4]) }
}

/** A handoff `ds:` line's `wall=246s`, in seconds, or null. */
export const parseJobWall = (text: unknown): number | null => {
  const t = typeof text === 'string' ? text : ''
  const m = /\bwall=(\d+(?:\.\d+)?)\s*s?\b/.exec(t)
  return m?.[1] !== undefined && Number.isFinite(Number(m[1])) ? Number(m[1]) : null
}

/** The first count in a handoff's `files_changed:` value (`4`, `4 files`), or 0. */
export const parseFilesChanged = (text: unknown): number => {
  const t = typeof text === 'string' ? text : ''
  const m = /\d+/.exec(t)
  return m ? Number(m[0]) : 0
}

/** The `jobid:` a job runner printed, '' when none. */
export const parseJobId = (text: unknown): string => {
  const t = typeof text === 'string' ? text : ''
  const id = lastField(t, 'jobid')
  return /^[\w.-]{1,160}$/.test(id) ? id : ''
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

/** An agy-job leaf stays on the agents panel this long after its Bash call returns. */
export const AGY_SHOW_MS = 10 * 60_000

/** A farmer job or agy-job call, as the interim agents lines draw it. */
export type JobLeaf = {
  id: string
  name: string
  /** The worker's display name (`Hydrogen xhigh`, `agy Sonnet high`), '' when unknown. */
  worker: string
  glyph: string
  /** `now · work`, for a running leaf only. */
  detail: string
  startedAt: number
  endedAt: number | null
  isLive: boolean
  /** An agy-job runs on the real repo: no scrubbed copy, so the line is marked ◇. */
  isRealRepo: boolean
  verifyPending: boolean
  status: string
  cost: number | null
}

/** The leaves the agents panel lists until the `work` tree lands: every probed job and every agy-job call, running first, newest first. */
export const jobLeaves = (jobs: readonly Job[], issued: readonly Issued[], now: number): JobLeaf[] => {
  const out: JobLeaf[] = []
  for (const j of jobs) {
    if (!showJob(j, now)) continue
    const live = isJobLive(j)
    const worker = live ? j.trying || j.backend : j.handoffBackend || j.backend || j.trying
    out.push({
      id: `job:${j.jobid}`,
      name: j.job || j.jobid,
      worker: workerDisplay(worker),
      glyph: jobGlyph(j),
      detail: live && j.status === 'running' ? [j.now, j.work].filter(Boolean).join(' · ') : '',
      startedAt: jobStartOf(j.jobid, j.ts * 1000),
      endedAt: live ? null : j.endedAt,
      isLive: live,
      isRealRepo: false,
      verifyPending: false,
      status: j.status,
      cost: j.cost,
    })
  }
  for (const i of issued) {
    if (i.kind !== 'agy') continue
    if (i.endedAt !== null && now - i.endedAt > AGY_SHOW_MS) continue
    const live = i.endedAt === null
    out.push({
      id: `agy:${i.callId}`,
      name: i.name || 'agy job',
      worker: agyWorker(i.worker, i.model, i.effort),
      glyph: live ? '◐' : i.ok === false ? '✗' : '●',
      detail: live ? [i.now, i.work].filter(Boolean).join(' · ') : '',
      startedAt: i.at,
      endedAt: i.endedAt,
      isLive: live,
      isRealRepo: true,
      verifyPending: i.verifyPending,
      status: live ? 'running' : i.ok === false ? 'failed' : 'done',
      cost: live ? null : 0,
    })
  }
  return out.sort((a, b) => Number(b.isLive) - Number(a.isLive) || (b.endedAt ?? now) - (a.endedAt ?? now) || b.startedAt - a.startedAt)
}

/**
 * The argv that prints a job's worker: a finished job's `backend` from its `state.json` (the model whose
 * work was kept), else the `trying` file (the attempt now running), else `backend`. Prints nothing when none says.
 */
export const workerProbe = (python: string | readonly string[], jobdir: string): string[] => [
  ...(typeof python === 'string' ? [python] : python),
  '-c',
  'import json,os,sys\nd=sys.argv[1]\ntry:\n s=json.load(open(os.path.join(d,"state.json"),"r",encoding="utf-8",errors="replace"))\nexcept Exception:\n s={}\n'
    + 'if s.get("backend") and s.get("status") not in ("running","parked",None):\n print(s["backend"])\nelse:\n'
    + ' try:\n  print(open(os.path.join(d,"trying"),"r",encoding="utf-8",errors="replace").read().strip())\n except Exception:\n  print(s.get("backend") or "")',
  jobdir,
]

/** The Python commands a probe tries, in order, until one runs; `py -3` is the Windows launcher. */
export const PYTHON_CANDIDATES: readonly (readonly string[])[] = [['python3'], ['python'], ['py', '-3']]

/**
 * A pid liveness test that is right on both systems: `os.kill(pid, 0)` is not a liveness test on Windows,
 * where `OpenProcess` + `GetExitCodeProcess` (259 = still active) is. The caller supplies `os`.
 */
export const PID_ALIVE_PY = String.raw`def alive(pid):
 try:
  if os.name == "nt":
   import ctypes
   k = ctypes.windll.kernel32
   h = k.OpenProcess(0x1000, False, int(pid))
   if not h:
    return False
   code = ctypes.c_ulong()
   ok = k.GetExitCodeProcess(h, ctypes.byref(code))
   k.CloseHandle(h)
   return bool(ok) and code.value == 259
  os.kill(int(pid), 0)
  return True
 except PermissionError:
  return True
 except Exception:
  return False`

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

/** The compaction count as the pane marks it: `↺2`, or `↺~2` when estimated; empty before the first. */
export const compactMark = (u: Pick<Usage, 'compactions' | 'isCompactEstimate'>) =>
  u.compactions > 0 ? `↺${u.isCompactEstimate ? '~' : ''}${u.compactions}` : ''

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

export const receiptOf = (t: Turn, o: { durationMs: number; agentsSince: number; jobsSince?: number; panelsSince?: number; costNow: number | null; reason: string }): Receipt => ({
  durationMs: o.durationMs,
  agents: o.agentsSince,
  jobs: o.jobsSince ?? 0,
  panels: o.panelsSince ?? 0,
  edits: t.edits,
  errors: t.errors,
  costDelta: o.costNow !== null && t.costAtStart !== null && o.costNow - t.costAtStart >= 0.005 ? o.costNow - t.costAtStart : null,
  reason: o.reason,
  since: t.startedAt,
})

/** A receipt's summary line: jobs and panels only when there were any; edits and errors always. */
export const receiptSummary = (r: Receipt): string =>
  [
    `last turn ${fmtDuration(r.durationMs)}`,
    plural(r.agents, 'agent'),
    (r.jobs ?? 0) > 0 ? plural(r.jobs, 'job') : '',
    (r.panels ?? 0) > 0 ? plural(r.panels, 'panel') : '',
    plural(r.edits, 'edit'),
    plural(r.errors, 'error'),
  ]
    .filter(Boolean)
    .join(' · ')

export type ReceiptJobParts = {
  glyph: string
  name: string
  worker: string
  duration: string
  tokens: string
  cost: string
  isLive: boolean
  startedAt: number
}

/** One turn job's row pieces: a running one keeps its clock (`isLive`) and no tokens. */
export const receiptJobParts = (j: TurnJob, now: number): ReceiptJobParts => ({
  glyph: j.glyph,
  name: j.name,
  worker: j.worker,
  duration: fmtDuration((j.endedAt ?? now) - j.startedAt),
  tokens: j.tokens && j.tokens.in + j.tokens.out + j.tokens.think > 0 ? `${kTokens(j.tokens.in)}→${kTokens(j.tokens.out + j.tokens.think)}` : '',
  cost: j.cost === null ? '' : j.cost === 0 ? 'free' : fmtWorkerCost(j.cost),
  isLive: j.isLive,
  startedAt: j.startedAt,
})

/** A receipt row for one job: glyph, name, worker, duration, tokens, cost; a running job keeps its clock and no tokens. */
export const receiptJobRow = (j: TurnJob, now: number): string => {
  const p = receiptJobParts(j, now)
  return [`${p.glyph} ${p.name}`, p.worker ? `▸ ${p.worker}` : '', p.duration, p.tokens, p.cost].filter(Boolean).join('  ')
}

/** A receipt row for one consult panel run: the engines that answered, failed, and how long it took. */
export const receiptPanelRow = (run: ConsultRun, now: number): string => {
  const total = run.engines.length
  const answered = run.engines.filter(e => e.state === 'ok').length
  const failed = run.engines.filter(e => e.state === 'failed').length
  return `◎ panel ${consultKindLabel(run.kind)} R${run.round}  ${answered}/${total} answered · ${failed} failed · ${fmtDuration((run.endedAt ?? now) - run.startedAt)}`
}

/** A job the turn started, from either a job dir (`ts`) or an agy-job call (`at`). */
export type TurnJob = {
  id: string
  name: string
  worker: string
  glyph: string
  status: string
  startedAt: number
  endedAt: number | null
  isLive: boolean
  tokens: JobTokens | null
  cost: number | null
}

/** The jobs whose start falls inside a turn window (`since` .. `end`, ms), oldest first. */
export const turnJobs = (jobs: readonly Job[], issued: readonly Issued[], since: number, end: number): TurnJob[] => {
  const out: TurnJob[] = []
  for (const j of jobs) {
    const startedAt = jobStartOf(j.jobid, j.ts * 1000)
    if (startedAt < since || startedAt > end) continue
    const live = isJobLive(j)
    out.push({
      id: `job:${j.jobid}`,
      name: j.job || j.jobid,
      worker: workerDisplay(live ? j.trying || j.backend : j.handoffBackend || j.backend || j.trying),
      glyph: jobGlyph(j),
      status: j.status,
      startedAt,
      endedAt: live ? null : j.endedAt,
      isLive: live,
      tokens: j.tokens,
      cost: j.cost,
    })
  }
  for (const i of issued) {
    if (i.kind !== 'agy' || i.at < since || i.at > end) continue
    const live = i.endedAt === null
    out.push({
      id: `agy:${i.callId}`,
      name: i.name || 'agy job',
      worker: agyWorker(i.worker, i.model, i.effort),
      glyph: live ? '◐' : i.ok === false ? '✗' : '●',
      status: live ? 'running' : i.ok === false ? 'failed' : 'done',
      startedAt: i.at,
      endedAt: i.endedAt,
      isLive: live,
      tokens: null,
      cost: 0,
    })
  }
  return out.sort((a, b) => a.startedAt - b.startedAt)
}

/** The consult runs started inside a turn window (the probe holds the newest run only). */
export const turnConsults = (run: ConsultRun | null, since: number, end: number): ConsultRun[] =>
  run && run.startedAt >= since && run.startedAt <= end ? [run] : []

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

/**
 * The running card a `TaskStop` call's `task_id` names: an exact id match first, else the newest
 * running card whose name (`type`) or `description` matches.
 */
export const cardForTaskStop = (cards: readonly AgentCard[], taskId: string): AgentCard | undefined => {
  const id = taskId.trim()
  if (!id) return undefined
  return (
    cards.find(c => c.status === 'running' && c.id === id) ??
    [...cards].reverse().find(c => c.status === 'running' && (c.type === id || c.description === id))
  )
}

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

export const CONSULT_PY = String.raw`import json, os, sys

HOME = os.path.expanduser("~")

` + PID_ALIVE_PY + String.raw`

d = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else os.path.join(HOME, ".claude", "state", "consult-runs")
lp = os.path.join(HOME, ".claude", "state", "consult-locks.json")
run = None
try:
 files = [os.path.join(d, f) for f in os.listdir(d) if f.endswith(".json") and not f.startswith(".")]
 files = [f for f in files if os.path.isfile(f)]
 if files:
  files.sort(key=lambda p: (os.stat(p).st_mtime_ns, os.path.basename(p)), reverse=True)
  with open(files[0], "r", encoding="utf-8", errors="replace") as fh:
   data = json.load(fh)
  if isinstance(data, dict):
   run = data
except Exception:
 run = None
if isinstance(run, dict) and run.get("endedAt") is None:
 pid = run.get("pid")
 if isinstance(pid, int) and not isinstance(pid, bool) and pid > 0:
  if not alive(pid):
   run["stale"] = True
 else:
  run["stale"] = True
locks = {}
try:
 with open(lp, "r", encoding="utf-8", errors="replace") as fh:
  ld = json.load(fh)
 if isinstance(ld, dict):
  locks = ld
except Exception:
 locks = {}
print(json.dumps({"run": run, "locks": locks}))`

/**
 * The argv that prints `{ run, locks }` from `dir` (or `~/.claude/state/consult-runs` when empty) and
 * `~/.claude/state/consult-locks.json`. Marks `run.stale = true` when `endedAt` is null and the pid is gone.
 */
export const consultProbe = (python: string | readonly string[], dir: string): string[] => [
  ...(typeof python === 'string' ? [python] : python),
  '-c',
  CONSULT_PY,
  dir,
]

// ---------------------------------------------------------------- farmer jobs

/** Job statuses that are still live-ish (`need_tool` waits on a person). */
export const LIVE_JOB_STATUSES: readonly string[] = ['running', 'parked', 'need_tool']

/** A job's status is live-ish and its pid, when one was recorded, still runs. */
export const isJobLive = (j: Pick<Job, 'status' | 'stale'>) => LIVE_JOB_STATUSES.includes(j.status) && !j.stale

/** A job whose `state.json` is older than this is no longer listed. */
export const JOB_CUTOFF_MS = 30 * 60_000

/** The pane shows at most this many jobs. */
export const JOB_LIMIT = 8

/** A job the pane lists: one with a live-ish status (the probe drops one whose runner is gone and whose state is older than 30 minutes; a newer one stays, marked stale), or one ended within the last 30 minutes. */
export const showJob = (j: Pick<Job, 'status' | 'endedAt'>, now: number) =>
  LIVE_JOB_STATUSES.includes(j.status) || (j.endedAt !== null && now - j.endedAt <= JOB_CUTOFF_MS)

/** The jobs the pane lists, newest first: open ones by their start, ended ones by their end; at most 8. */
export const orderJobs = (jobs: readonly Job[], now: number): Job[] =>
  jobs
    .filter(j => showJob(j, now))
    .sort((a, b) => {
      const openA = LIVE_JOB_STATUSES.includes(a.status)
      const openB = LIVE_JOB_STATUSES.includes(b.status)
      return Number(openB) - Number(openA) || (openA ? b.ts - a.ts : (b.endedAt ?? 0) - (a.endedAt ?? 0))
    })
    .slice(0, JOB_LIMIT)

const STAGE_OF_PHASE: Record<string, string> = {
  copy: 'copy',
  copied: 'copy',
  snapshot: 'copy',
  toolbox: 'toolbox',
  tools: 'toolbox',
  model: 'model',
  models: 'model',
  run: 'model',
  running: 'model',
  generate: 'model',
  apply: 'apply',
  applying: 'apply',
  patch: 'apply',
  check: 'check',
  checking: 'check',
  verify: 'check',
  test: 'check',
  handoff: 'handoff',
  report: 'handoff',
  done: 'handoff',
}

export type JobStage = { stage: string; attempts: number }

/**
 * A job's stage from the `job.log` lines that name one and `state.json`'s `phase`: copy (`copied N
 * files`), toolbox (`toolbox:`), model (a `trying` file, until a result line), then apply, check and
 * handoff as their lines or `handoff.txt` appear. `attempts` counts the distinct backends tried.
 */
export const jobStage = (lines: readonly string[], phase: string, hasTrying: boolean, hasHandoff: boolean): JobStage => {
  let stage = ''
  let hasResult = false
  const seen = new Set<string>()
  for (const line of lines) {
    const low = line.trim().toLowerCase()
    if (/copied\s+\d+\s+files?/.test(low)) stage = 'copy'
    if (/(?:^|[\s|])toolbox:/.test(low)) stage = 'toolbox'
    const tried = /(?:^|[\s|])trying\s*[:=]\s*(\S+)/.exec(low)
    if (tried?.[1]) seen.add(tried[1])
    if (/(?:^|[\s|])result\s*:/.test(low)) hasResult = true
    if (/^apply(?:\b|:)/.test(low) || /[|\s]apply:/.test(low)) stage = 'apply'
    if (/^check(?:\b|:)/.test(low) || /[|\s](?:check|verify):/.test(low)) stage = 'check'
    if (/^handoff(?:\b|:)/.test(low) || /[|\s]handoff:/.test(low)) stage = 'handoff'
  }
  const fromPhase = STAGE_OF_PHASE[phase.trim().toLowerCase()] ?? ''
  if (fromPhase) stage = fromPhase
  if (hasTrying && !hasResult && (stage === '' || stage === 'copy' || stage === 'toolbox')) stage = 'model'
  if (hasHandoff) stage = 'handoff'
  return { stage, attempts: Math.max(1, seen.size) }
}

/** The two spellings a work tree takes in an agy blob: `/` separators, and JSON-escaped `\\`. */
export const pathNeedles = (tree: string): string[] => {
  const p = tree.replace(/\\/g, '/')
  return [p, p.replace(/\//g, '\\\\')]
}

/** Whether a step blob mentions a tree path, in either separator; case-insensitive on Windows. */
export const mentionsTree = (text: string, tree: string, isWindows = false): boolean => {
  const hay = isWindows ? text.toLowerCase() : text
  return pathNeedles(tree).some(n => hay.includes(isWindows ? n.toLowerCase() : n))
}

export type AgyDbCandidate = { path: string; mtime: number; matched: boolean }

/** The newest db among the candidates that mentions the tree (and changed at or after `since`), '' when none. */
export const pickAgyDb = (dbs: readonly AgyDbCandidate[], since = 0): string => {
  let best = ''
  let bestMtime = -Infinity
  for (const d of dbs) {
    if (!d.matched || !d.path || d.mtime < since) continue
    if (d.mtime >= bestMtime) {
      best = d.path
      bestMtime = d.mtime
    }
  }
  return best
}

/** A job's mark: ◐ running, ● done, ◑ partial, ✗ failed/refused, ○ dry, ⊘ stale. */
export const jobGlyph = (j: Pick<Job, 'status' | 'stale'>) =>
  j.stale ? '⊘' : j.status === 'running' || j.status === 'parked' || j.status === 'need_tool' ? '◐' : j.status === 'done' ? '●' : j.status === 'partial' ? '◑' : j.status === 'dry' ? '○' : '✗'

/**
 * The Python every job read shares: utf-8 text with a byte cap, handoff `key: value` lines, printable
 * runs of a blob, the agy `steps` table, and the conversation db whose rows mention a tree path.
 */
const JOB_READERS_PY = String.raw`def read_text(path, limit=0):
 try:
  with open(path, "r", encoding="utf-8", errors="replace") as fh:
   if limit > 0:
    try:
     fh.seek(0, os.SEEK_END)
     size = fh.tell()
     fh.seek(max(0, size - limit))
    except Exception:
     pass
   return fh.read()
 except Exception:
  return ""

def handoff_of(text):
 out = {}
 for line in text.splitlines():
  m = re.match(r"^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
  if m:
   out[m.group(1).lower()] = m.group(2).strip()
 return out

def printable(blob):
 try:
  s = blob.decode("latin-1") if isinstance(blob, (bytes, bytearray)) else str(blob)
 except Exception:
  return []
 return re.findall(r"[\x20-\x7e]{3,}", s)

def safe_runs(blob, typ):
 # Only what the row needs: the tool id and name, a path, a command, and a model text line.
 # Prompts and file contents stay in the store.
 s = blob.decode("latin-1")
 runs = printable(blob)
 out = []
 for i in range(len(runs) - 1):
  if re.fullmatch(r"call_\d+", runs[i]):
   out.append(runs[i][:40])
   out.append(runs[i + 1][:80])
   break
 for key in ("Path", "CommandLine", "Command", "command", "Cmd", "model", "model_id", "modelId"):
  m = re.search(r'"' + key + r'"\s*:\s*"((?:[^"\\]|\\.)*)"', s)
  if m:
   out.append('"' + key + '":"' + m.group(1)[:400] + '"')
 if typ == 15 and runs:
  out.append(runs[0][:200])
 return out

def agy_steps(path):
 try:
  con = sqlite3.connect("file:%s?mode=ro" % path, uri=True, timeout=0.05)
 except Exception:
  return 0, []
 try:
  cur = con.cursor()
  cur.execute("select * from steps order by idx")
  names = [d[0] for d in cur.description]
  rows = []
  for row in cur.fetchall():
   rec = dict(zip(names, row))
   try:
    typ = int(rec.get("step_type"))
   except Exception:
    continue
   parts = []
   for key in ("metadata", "step_payload"):
    v = rec.get(key)
    if isinstance(v, (bytes, bytearray)):
     parts.append(bytes(v))
    elif isinstance(v, str):
     parts.append(v.encode("utf-8", "replace"))
   rows.append({"type": typ, "runs": safe_runs(b"\x00".join(parts), typ)})
  return len(rows), rows[-600:]
 except Exception:
  return 0, []
 finally:
  try:
   con.close()
  except Exception:
   pass

def db_mtime(path):
 try:
  mt = os.stat(path).st_mtime
 except Exception:
  mt = 0.0
 try:
  mt = max(mt, os.stat(path + "-wal").st_mtime)
 except Exception:
  pass
 return mt

def path_needles(path):
 p = path.replace("\\", "/")
 return [p, p.replace("/", "\\\\")]

def mentions(rows, needles):
 low = os.name == "nt"
 for row in rows:
  for run in row.get("runs", []):
   hay = run.lower() if low else run
   for n in needles:
    if (n.lower() if low else n) in hay:
     return True
 return False

def db_candidates(tree, since, key):
 c = cache.get(key)
 if isinstance(c, str) and c and os.path.isfile(c):
  return [{"path": c, "mtime": db_mtime(c), "matched": True}]
 base = os.path.join(HOME, ".gemini", "antigravity-cli", "conversations")
 try:
  names = [n for n in os.listdir(base) if n.endswith(".db")]
 except Exception:
  return []
 needles = path_needles(tree) if tree else []
 out = []
 for n in names:
  p = os.path.join(base, n)
  mt = db_mtime(p)
  if mt < since:
   continue
  if needles and not mentions(agy_steps(p)[1], needles):
   continue
  out.append({"path": p, "mtime": mt, "matched": True})
 return out

def pick_db(cands):
 best = ""
 best_mt = -1.0
 for c in cands:
  if not c.get("matched"):
   continue
  if c.get("mtime", 0) >= best_mt:
   best = c.get("path", "")
   best_mt = c.get("mtime", 0)
 return best

def stage_lines(log):
 out = []
 for line in log.splitlines()[-4000:]:
  s = line.strip()
  low = s.lower()
  if re.search(r"copied\s+\d+\s+files?|toolbox:|trying\s*[:=]|^apply|apply:|^check|check:|verify:|^handoff|handoff:|^result|result:", low):
   out.append(s[:200])
  if len(out) >= 80:
   break
 return out

def tree_of(jobdir, jobid, state, log):
 t = state.get("tree") if isinstance(state, dict) else None
 if isinstance(t, str) and t.strip():
  return t.strip()
 j = re.escape(jobid)
 m = re.search(r'([A-Za-z]:[\\/][^\s"\']*?[/\\]dsbench[/\\]jobs[/\\]' + j + r'[/\\]tree)', log, re.I)
 if m:
  return m.group(1)
 m = re.search(r'(/[^\s"\']*?/dsbench/jobs/' + j + r'/tree)', log)
 if m:
  return m.group(1)
 return os.path.join(tempfile.gettempdir(), "dsbench", "jobs", jobid, "tree")

def newest_file(tree, base, job):
 try:
  start = os.stat(base).st_mtime
 except Exception:
  try:
   start = float(job.get("ts") or 0)
  except Exception:
   start = 0.0
 newest = ""
 nm = 0.0
 count = 0
 seen = 0
 for dp, dns, fns in os.walk(tree):
  dns[:] = [x for x in dns if x not in (".git", "node_modules", ".hg", ".svn", "dist", "build", "target", "__pycache__")]
  for f in fns:
   seen += 1
   if seen > 4000:
    break
   p = os.path.join(dp, f)
   try:
    m = os.stat(p).st_mtime
   except Exception:
    continue
   if m > start + 0.001:
    count += 1
    if m > nm:
     nm = m
     newest = p
  if seen > 4000:
   break
 rel = ""
 if newest:
  try:
   rel = os.path.relpath(newest, tree)
  except Exception:
   rel = newest
  rel = rel.replace("\\", "/")
  if rel.startswith("./"):
   rel = rel[2:]
 return rel, count
`

export const JOBS_PY = String.raw`import json, os, re, sqlite3, sys, tempfile, time

HOME = os.path.expanduser("~")
root = os.path.expanduser(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else os.path.join(HOME, ".claude", "state", "ds-jobs")
cache = {}
try:
 loaded = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else {}
 if isinstance(loaded, dict):
  cache = loaded
except Exception:
 cache = {}
now = time.time()
LIVE = ("running", "parked", "need_tool")
CUTOFF = 30 * 60

` + PID_ALIVE_PY + String.raw`

` + JOB_READERS_PY + String.raw`

def main():
 out = []
 try:
  names = sorted(os.listdir(root))
 except Exception:
  names = []
 for jobid in names:
  d = os.path.join(root, jobid)
  sp = os.path.join(d, "state.json")
  if not os.path.isfile(sp):
   continue
  try:
   mt = os.stat(sp).st_mtime
  except Exception:
   continue
  start_mt = mt
  for p in (d, os.path.join(d, "job.log"), os.path.join(d, "base")):
   try:
    start_mt = min(start_mt, os.stat(p).st_mtime)
   except Exception:
    pass
  state = {}
  try:
   with open(sp, "r", encoding="utf-8", errors="replace") as fh:
    data = json.load(fh)
   if isinstance(data, dict):
    state = data
  except Exception:
   state = {}
  status = str(state.get("status") or "")
  live = status in LIVE
  if not live and now - mt > CUTOFF:
   continue
  pid = state.get("pid")
  pid = pid if isinstance(pid, int) and not isinstance(pid, bool) and pid > 0 else 0
  ts = state.get("ts")
  ts = float(ts) if isinstance(ts, (int, float)) and not isinstance(ts, bool) else 0.0
  rc = state.get("rc")
  rc = rc if isinstance(rc, int) and not isinstance(rc, bool) else None
  trying = read_text(os.path.join(d, "trying")).strip()
  handoff = read_text(os.path.join(d, "handoff.txt"), 65536)
  fields = handoff_of(handoff)
  log = read_text(os.path.join(d, "job.log"), 65536)
  tree = tree_of(d, jobid, state, log)
  job = {"jobid": jobid, "job": str(state.get("job") or jobid), "status": status, "ts": ts, "pid": pid or None, "backend": str(state.get("backend") or ""), "tier": str(state.get("tier") or ""), "profile": str(state.get("profile") or ""), "phase": str(state.get("phase") or ""), "rc": rc, "dir": d, "tree": tree, "live": live, "stale": False, "endedAt": None if live else int(mt * 1000), "mtime": int(start_mt * 1000), "trying": trying, "stageLines": stage_lines(log), "hasTrying": bool(trying), "hasHandoff": bool(handoff.strip()), "handoff": {"backend": fields.get("backend", ""), "files_changed": fields.get("files_changed", ""), "ds": fields.get("ds", ""), "not_verified": fields.get("not_verified", "")}}
  job["stale"] = bool(live and status == "running" and not (pid and alive(pid)))
  if job["stale"]:
   job["endedAt"] = int(mt * 1000)
  if live and (job["stale"] or not (pid and alive(pid))) and time.time() - mt > 1800:
   continue
  if live and not job["stale"]:
   if trying.startswith("agy:"):
    cands = db_candidates(tree, 0, jobid)
    job["dbs"] = cands
    dbp = pick_db(cands)
    if dbp:
     total, rows = agy_steps(dbp)
     job["db"] = dbp
     job["steps"] = rows
     job["stepsTotal"] = total
   else:
    rel, count = newest_file(tree, os.path.join(d, "base"), job)
    job["now"] = rel
    job["work"] = ("%d file%s" % (count, "" if count == 1 else "s")) if count else ""
  out.append(job)
 out.sort(key=lambda j: (0 if j["live"] and not j["stale"] else 1, -(j["ts"] if j["live"] else (j["endedAt"] or 0))))
 print(json.dumps(out[:8]))

try:
 main()
except Exception:
 pass`

/**
 * The argv that prints the job dirs under `root` (or `~/.claude/state/ds-jobs`) as one JSON array, newest
 * first, at most 8: live jobs, and ended ones whose `state.json` changed in the last 30 minutes. A live job
 * whose pid is gone is `stale`. `cache` maps a jobid to the agy conversation db already matched to it.
 */
export const jobsProbe = (python: string | readonly string[], root: string, cache: Record<string, string> = {}): string[] => [
  ...(typeof python === 'string' ? [python] : python),
  '-c',
  JOBS_PY,
  root,
  JSON.stringify(cache),
]

export const AGY_PY = String.raw`import json, os, re, sqlite3, sys, time

HOME = os.path.expanduser("~")
try:
 calls = json.loads(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else []
except Exception:
 calls = []
cache = {}
try:
 loaded = json.loads(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2] else {}
 if isinstance(loaded, dict):
  cache = loaded
except Exception:
 cache = {}

` + JOB_READERS_PY + String.raw`

def main():
 out = []
 for c in calls if isinstance(calls, list) else []:
  if not isinstance(c, dict):
   continue
  cid = str(c.get("callId") or "")
  name = str(c.get("name") or "")
  repo = str(c.get("repo") or "")
  try:
   since = float(c.get("since") or 0) / 1000.0
  except Exception:
   since = 0.0
  rec = {"callId": cid, "name": name, "steps": [], "stepsTotal": 0, "handoff": "", "verifyPending": False}
  cands = db_candidates(repo, since, "agy:" + cid) if repo else []
  rec["dbs"] = cands
  dbp = pick_db(cands)
  if dbp:
   total, rows = agy_steps(dbp)
   rec["steps"] = rows
   rec["stepsTotal"] = total
   rec["db"] = dbp
  hp = c.get("handoff")
  if isinstance(hp, str) and hp:
   rec["handoff"] = read_text(os.path.expanduser(hp), 65536)
  vp = os.path.join(HOME, ".claude", "state", "agy-verify-pending", name + ".json")
  rec["verifyPending"] = bool(name and os.path.isfile(vp))
  out.append(rec)
 print(json.dumps(out))

try:
 main()
except Exception:
 pass`

/**
 * The argv that prints the live rows of agy-job calls: each call's `{callId, name, steps, stepsTotal,
 * handoff, verifyPending}`. The db is the newest conversation mentioning `--repo` (both separators)
 * changed after the call started.
 */
export const agyProbe = (
  python: string | readonly string[],
  calls: { callId: string; name: string; repo: string; since: number; handoff?: string }[],
  cache: Record<string, string> = {},
): string[] => [...(typeof python === 'string' ? [python] : python), '-c', AGY_PY, JSON.stringify(calls), JSON.stringify(cache)]

/** A blob's printable ASCII runs (the probe reads the bytes as latin-1), three characters or more. */
export const printableRuns = (blob: string): string[] => blob.match(/[\x20-\x7e]{3,}/g) ?? []

const unescape = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string
  } catch {
    return s
  }
}

const AGY_TOOLS = ['edit_file', 'write_file', 'multi_edit', 'read_file', 'run_command', 'list_dir', 'find_file', 'grep', 'delete_file', 'move_file']

/** What a tool-call blob says: the tool (the run after the `call_<digits>` id), its `Path`, its command. */
export const parseAgyCall = (runs: readonly string[]): { tool: string; path: string; command: string } => {
  let tool = ''
  for (let i = 0; i < runs.length - 1; i += 1) {
    if (/^call_\d+$/.test(runs[i]!)) {
      tool = runs[i + 1]!
      break
    }
  }
  if (!tool) tool = AGY_TOOLS.find(t => runs.includes(t)) ?? ''
  const raw = runs.join(' ')
  const pathM = /"Path"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
  const cmdM = /"(?:CommandLine|Command|command|Cmd)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
  return { tool, path: pathM ? unescape(pathM[1]!) : '', command: cmdM ? unescape(cmdM[1]!) : '' }
}

/** A path as the owner sees it: tree prefix stripped, `/` separators. */
export const repoPath = (path: string, tree: string) => {
  let p = path.replace(/\\/g, '/')
  const t = tree.replace(/\\/g, '/').replace(/\/+$/, '')
  if (t && p.toLowerCase().startsWith(`${t.toLowerCase()}/`)) p = p.slice(t.length + 1)
  return p.replace(/^\/+/, '')
}

const AGY_VERBS: Record<string, string> = {
  edit_file: 'edit',
  write_file: 'write',
  multi_edit: 'edit',
  read_file: 'read',
  list_dir: 'list',
  find_file: 'find',
  delete_file: 'delete',
  move_file: 'move',
  run_command: 'run',
}

export type AgyStep = { type: number; runs: string[] }

const agyCallLine = (c: { tool: string; path: string; command: string }, tree: string) => {
  if (c.tool === 'run_command') return c.command ? `run ${shorten(c.command, 40)}` : 'run'
  const verb = AGY_VERBS[c.tool] ?? c.tool.replace(/_file$/, '')
  if (!verb) return ''
  return c.path ? `${verb} ${repoPath(c.path, tree)}` : verb
}

/**
 * What a live agy conversation shows: the latest tool call (`now`), the edited files, step and command
 * counts (`work`), and the first line of the latest model text (`think`). '' for what the rows don't say.
 */
export const agyLive = (steps: readonly AgyStep[], tree: string, total = steps.length): { now: string; work: string; think: string } => {
  const calls = steps.filter(s => s.type === 132).map(s => parseAgyCall(s.runs))
  const latest = calls[calls.length - 1]
  const now = latest ? agyCallLine(latest, tree) : ''
  const edits = new Set<string>()
  let runs = 0
  for (const c of calls) {
    if (c.tool === 'run_command') runs += 1
    if (/edit|write|patch/.test(c.tool) && c.path) edits.add(repoPath(c.path, tree))
  }
  const work = [edits.size > 0 ? `${edits.size} file${edits.size === 1 ? '' : 's'}` : '', total > 0 ? `${total} st` : '', runs > 0 ? `${runs} run` : ''].filter(Boolean).join(' · ')
  let think = ''
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const s = steps[i]!
    if (s.type !== 15) continue
    think = shorten(s.runs[0] ?? '', 60)
    break
  }
  return { now, work, think }
}

/** The model id an agy step blob names, '' when none does. */
export const agyModel = (steps: readonly AgyStep[]): string => {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    for (const run of steps[i]!.runs) {
      const m = /"(?:model|model_id|modelId)"\s*:\s*"([^"]{2,60})"/.exec(run)
      if (m?.[1]) return m[1]
    }
  }
  return ''
}

const numOf = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const strOf = (v: unknown) => (typeof v === 'string' ? v : '')

const tokensOf = (v: unknown): JobTokens | null =>
  isObject(v) ? { in: numOf(v.in), cache: numOf(v.cache), out: numOf(v.out), think: numOf(v.think) } : null

const agyStepsOf = (raw: unknown): AgyStep[] =>
  listOf<unknown>(raw)
    .filter(isObject)
    .map(s => ({ type: numOf(s.type), runs: listOf<unknown>(s.runs).filter((r): r is string => typeof r === 'string').slice(0, 40) }))

/**
 * A job's start time in ms: the local time encoded in a `-YYYYMMDD-HHMMSS` jobid suffix when it
 * parses, else the earliest of `ts` and the probe's `mtime` (when positive), else `ts`.
 */
export const jobStartOf = (jobid: string, ts: number, mtime?: number | null): number => {
  const m = /(?:^|-)(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(jobid)
  if (m) {
    const y = Number(m[1])
    const mo = Number(m[2])
    const d = Number(m[3])
    const H = Number(m[4])
    const M = Number(m[5])
    const S = Number(m[6])
    const dt = new Date(y, mo - 1, d, H, M, S)
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === mo - 1 &&
      dt.getDate() === d &&
      dt.getHours() === H &&
      dt.getMinutes() === M &&
      dt.getSeconds() === S
    ) {
      return dt.getTime()
    }
  }
  if (typeof mtime === 'number' && Number.isFinite(mtime) && mtime > 0) {
    return ts > 0 ? Math.min(ts, mtime) : mtime
  }
  return ts
}

/** A probe row as a Job, its live rows parsed from the agy blobs it carried. */
export const normalizeJob = (raw: unknown): Job => {
  const j = isObject(raw) ? raw : {}
  const steps = agyStepsOf(j.steps)
  const total = typeof j.stepsTotal === 'number' && j.stepsTotal >= 0 ? j.stepsTotal : steps.length
  const tree = strOf(j.tree)
  const liveRows = steps.length > 0 ? agyLive(steps, tree, total) : { now: '', work: '', think: '' }
  const handoff = isObject(j.handoff) ? j.handoff : {}
  const ds = strOf(handoff.ds)
  const stage =
    j.stageLines !== undefined
      ? jobStage(listOf<unknown>(j.stageLines).filter((l): l is string => typeof l === 'string'), strOf(j.phase), j.hasTrying === true, j.hasHandoff === true)
      : { stage: strOf(j.stage), attempts: typeof j.attempts === 'number' && j.attempts >= 1 ? j.attempts : 1 }
  const dbs = listOf<unknown>(j.dbs)
    .filter(isObject)
    .map(d => ({ path: strOf(d.path), mtime: numOf(d.mtime), matched: d.matched === true }))
  const rawTs = numOf(j.ts)
  const probeMt = typeof j.mtime === 'number' && Number.isFinite(j.mtime) && j.mtime > 0 ? j.mtime : 0
  const ts = probeMt > 0 ? (rawTs > 0 ? Math.min(rawTs, probeMt / 1000) : probeMt / 1000) : rawTs
  return {
    jobid: strOf(j.jobid),
    job: strOf(j.job),
    status: strOf(j.status),
    ts,
    pid: typeof j.pid === 'number' && j.pid > 0 ? j.pid : null,
    backend: strOf(j.backend),
    tier: strOf(j.tier),
    profile: strOf(j.profile),
    phase: strOf(j.phase),
    rc: typeof j.rc === 'number' ? j.rc : null,
    dir: strOf(j.dir),
    tree,
    stale: j.stale === true,
    endedAt: typeof j.endedAt === 'number' ? j.endedAt : null,
    trying: strOf(j.trying),
    stage: stage.stage,
    attempts: stage.attempts,
    now: strOf(j.now) || liveRows.now,
    work: strOf(j.work) || liveRows.work,
    think: strOf(j.think) || liveRows.think,
    handoffBackend: strOf(handoff.backend) || strOf(j.handoffBackend),
    tokens: parseHandoffTokens(ds) ?? tokensOf(j.tokens),
    cost: parseJobCost(ds) ?? (typeof j.cost === 'number' ? j.cost : null),
    wall: parseJobWall(ds) ?? (typeof j.wall === 'number' ? j.wall : null),
    filesChanged: parseFilesChanged(handoff.files_changed) || (typeof j.filesChanged === 'number' ? j.filesChanged : 0),
    notVerified: strOf(handoff.not_verified) || strOf(j.notVerified),
    db: pickAgyDb(dbs) || strOf(j.db),
  }
}

/** `jobsProbe` stdout as jobs; null on malformed output. With `now`, applies the pane's cutoff, order and limit. */
export const parseJobs = (stdout: string, now = 0): Job[] | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null
  const jobs = raw.filter(isObject).map(normalizeJob)
  return now > 0 ? orderJobs(jobs, now) : jobs
}

export type AgyLive = { callId: string; name: string; steps: AgyStep[]; stepsTotal: number; handoff: string; verifyPending: boolean; db: string }

/** `agyProbe` stdout as live rows; null on malformed output. */
export const parseAgyLive = (stdout: string): AgyLive[] | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null
  return raw.filter(isObject).map(x => ({
    callId: strOf(x.callId),
    name: strOf(x.name),
    steps: agyStepsOf(x.steps),
    stepsTotal: typeof x.stepsTotal === 'number' && x.stepsTotal >= 0 ? x.stepsTotal : 0,
    handoff: strOf(x.handoff),
    verifyPending: x.verifyPending === true,
    db:
      pickAgyDb(
        listOf<unknown>(x.dbs)
          .filter(isObject)
          .map(d => ({ path: strOf(d.path), mtime: numOf(d.mtime), matched: d.matched === true })),
      ) || strOf(x.db),
  }))
}

/** The issued agy calls after one agy probe: their live rows, worker and verify badge. */
export const applyAgyLive = (list: readonly Issued[], live: readonly AgyLive[]): Issued[] => {
  const byId = new Map(live.map(l => [l.callId, l]))
  return list.map(i => {
    const l = byId.get(i.callId)
    if (!l || i.kind !== 'agy') return i
    const rows = l.steps.length > 0 ? agyLive(l.steps, i.repo, l.stepsTotal) : { now: '', work: '', think: '' }
    return {
      ...i,
      now: rows.now,
      work: rows.work,
      model: agyModel(l.steps) || i.model,
      worker: i.worker || parseJobText(l.handoff).backend,
      verifyPending: l.verifyPending,
    }
  })
}

// ---------------------------------------------------------------- who issued what

/** A job runner or consult command found in a Bash call. */
export type RunnerCall = { kind: IssuedKind; name: string; repo: string; model: string; effort: string; handoff: string }

const flagOf = (cmd: string, name: string): string => {
  const m = new RegExp(`--${name}(?:=|\\s+)(?:"([^"]*)"|'([^']*)'|([^\\s'"]+))`).exec(cmd)
  return (m?.[1] ?? m?.[2] ?? m?.[3] ?? '').trim()
}

/**
 * What a Bash command starts: `ds-job.py run|batch --job <name>`, `agy-job.py run --job <name>` (with
 * `--repo`, `--model`, `--effort`, `--handoff`), or `consult-cli.js`. Null for anything else, and for a
 * runner call that names no `--job`.
 */
export const parseRunnerCall = (command: string): RunnerCall | null => {
  const cmd = typeof command === 'string' ? command : ''
  if (!cmd) return null
  if (/(?:^|[\s;&|"'/])consult-cli\.js(?:[\s;&|"']|$)/.test(cmd)) return { kind: 'consult', name: '', repo: '', model: '', effort: '', handoff: '' }
  const m = /(?:^|[\s;&|"'/])(ds-job|agy-job)\.py\s+(run|batch)(?:[\s;&|"']|$)/.exec(cmd)
  if (!m) return null
  if (m[1] === 'agy-job' && m[2] !== 'run') return null
  const name = flagOf(cmd, 'job')
  if (!name) return null
  return {
    kind: m[1] === 'agy-job' ? 'agy' : 'job',
    name,
    repo: flagOf(cmd, 'repo'),
    model: flagOf(cmd, 'model'),
    effort: flagOf(cmd, 'effort'),
    handoff: flagOf(cmd, 'handoff'),
  }
}

export const MAX_ISSUED = 40

export type IssueInput = RunnerCall & { callId: string; agentId: string; at: number; task: string }

/** A Bash call that starts a runner joins the binding store, waiting for its result's `jobid:` line. */
export const issueCall = (list: readonly Issued[], call: IssueInput): Issued[] => {
  if (!call.callId || list.some(x => x.callId === call.callId)) return [...list]
  const entry: Issued = {
    callId: call.callId,
    agentId: call.agentId,
    kind: call.kind,
    name: call.name,
    repo: call.repo,
    model: call.model,
    effort: call.effort,
    handoff: call.handoff,
    at: call.at,
    task: call.task,
    jobid: '',
    runId: '',
    endedAt: null,
    ok: null,
    worker: '',
    now: '',
    work: '',
    verifyPending: false,
  }
  return [...list, entry].slice(-MAX_ISSUED)
}

/** The call's result came back: it ends there, and a `jobid:` line binds the job dir it started. */
export const bindResult = (list: readonly Issued[], callId: string, text: unknown, at: number, ok: boolean | null = null): Issued[] => {
  if (!callId || !list.some(x => x.callId === callId)) return [...list]
  const backend = parseJobText(text).backend
  const jobid = parseJobId(text)
  return list.map(x =>
    x.callId !== callId ? x : { ...x, endedAt: x.endedAt ?? at, ok: ok ?? x.ok, jobid: x.jobid || jobid, worker: x.worker || backend },
  )
}

/** The newest consult run file started after a consult call is that call's run. */
export const bindConsultRun = (list: readonly Issued[], run: ConsultRun | null): Issued[] => {
  if (!run || !run.id) return [...list]
  const open = [...list].reverse().find(x => x.kind === 'consult' && !x.runId && run.startedAt >= x.at)
  return open ? list.map(x => (x === open ? { ...x, runId: run.id } : x)) : [...list]
}

/** The agent a job dir was bound to: its issuer's id, '' (main) when no call bound it. */
export const ownerOfJob = (list: readonly Issued[], jobid: string): string => list.find(x => x.jobid === jobid)?.agentId ?? ''

/** The mesh task a job serves: its issuer's `task:` line, else the `doing` item, else ''. */
export const taskOfJob = (list: readonly Issued[], jobid: string): string => list.find(x => x.jobid === jobid)?.task ?? ''

export const MESH_PY = String.raw`import json, os, sys
home = os.environ.get("MESH_HOME") or os.path.join(os.path.expanduser("~"), ".agent-mesh")
path = os.path.join(home, "tasks", (sys.argv[1] if len(sys.argv) > 1 else "") + ".json")
try:
 with open(path, "r", encoding="utf-8", errors="replace") as fh:
  data = json.load(fh)
except Exception:
 data = []
items = data
if isinstance(data, dict):
 items = data.get("tasks") or data.get("items") or []
out = []
for i in items if isinstance(items, list) else []:
 if isinstance(i, dict):
  out.append({"id": str(i.get("id") or ""), "status": str(i.get("status") or ""), "subject": str(i.get("subject") or i.get("title") or "")})
print(json.dumps(out))`

/** The argv that prints a session's mesh task items (`<MESH_HOME or ~/.agent-mesh>/tasks/<id>.json`); [] when none. */
export const meshProbe = (python: string | readonly string[], sessionId: string): string[] => [
  ...(typeof python === 'string' ? [python] : python),
  '-c',
  MESH_PY,
  sessionId,
]

/** `meshProbe` stdout as task items, whatever shape the cache holds (`[]` when it is not JSON). */
export const parseMeshTasks = (stdout: string): MeshTask[] => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return []
  }
  if (isObject(raw)) raw = listOf<unknown>(raw.tasks).length > 0 ? raw.tasks : raw.items
  if (!Array.isArray(raw)) return []
  return raw.filter(isObject).map(x => ({ id: strOf(x.id), status: strOf(x.status), subject: strOf(x.subject) || strOf(x.title) }))
}

/** The `task: t<N>` a sub-main's brief names, '' when none. */
export const taskOfBrief = (text: unknown): string => {
  const t = typeof text === 'string' ? text : ''
  const m = /\btask:\s*(t\d+)\b/i.exec(t)
  return m?.[1]?.toLowerCase() ?? ''
}

/** The mesh item a job issued now serves: the one whose status is `doing`, '' when none. */
export const doingTask = (items: readonly MeshTask[]): string => items.find(i => i.status === 'doing' && i.id)?.id ?? ''

/** Main's direct workers go under the item that was `doing` when they were issued; a sub-main's under its own task. */
export const taskAtIssue = (agentId: string, cardTask: string, items: readonly MeshTask[]): string => (agentId ? cardTask : doingTask(items))

const issuedKind = (v: unknown): IssuedKind => (v === 'agy' || v === 'consult' ? v : 'job')

/** Stored bindings normalized over their defaults. */
export const normalizeIssued = (stored: unknown): Issued[] =>
  listOf<unknown>(stored)
    .filter(isObject)
    .map(x => ({
      callId: strOf(x.callId),
      agentId: strOf(x.agentId),
      kind: issuedKind(x.kind),
      name: strOf(x.name),
      repo: strOf(x.repo),
      model: strOf(x.model),
      effort: strOf(x.effort),
      handoff: strOf(x.handoff),
      at: numOf(x.at),
      task: strOf(x.task),
      jobid: strOf(x.jobid),
      runId: strOf(x.runId),
      endedAt: typeof x.endedAt === 'number' ? x.endedAt : null,
      ok: typeof x.ok === 'boolean' ? x.ok : null,
      worker: strOf(x.worker),
      now: strOf(x.now),
      work: strOf(x.work),
      verifyPending: x.verifyPending === true,
    }))

// ---------------------------------------------------------------- checkpoints

/** Rule 8: a Claude subagent's checkpoint file is read only while it is at most this big. */
export const CHECKPOINT_MAX_BYTES = 256 * 1024

/** Only the last 8 KB of a checkpoint are read. */
export const CHECKPOINT_TAIL_BYTES = 8 * 1024

export const CHECKPOINT_PY = String.raw`import json, os, sys
p = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else "")
try:
 size = os.path.getsize(p)
except Exception:
 size = -1
if size < 0 or size > 262144:
 print(json.dumps({}))
else:
 try:
  with open(p, "r", encoding="utf-8", errors="replace") as fh:
   fh.seek(max(0, size - 8192))
   text = fh.read()
 except Exception:
  text = ""
 print(json.dumps({"text": text} if text else {}))`

/** The argv that prints the last 8 KB of a checkpoint file; `{}` when it is missing or over 256 KB. */
export const checkpointProbe = (python: string | readonly string[], path: string): string[] => [
  ...(typeof python === 'string' ? [python] : python),
  '-c',
  CHECKPOINT_PY,
  path,
]

const STEP_LINE = /^(?:[-*]\s+)?(?:✔|✓|✗|✘)?\s*(step\b.*)$/i

/** A checkpoint tail, parsed from its text: the last step, next command, open bullets, status and tests. */
export const parseCheckpointText = (text: string): CheckpointTail => {
  const steps: CheckpointStep[] = []
  const open: string[] = []
  let next = ''
  let status = ''
  let tests = ''
  let inOpen = false
  let current: CheckpointStep | null = null
  for (const raw of text.split('\n')) {
    const s = raw.trim()
    if (!s) {
      inOpen = false
      continue
    }
    const low = s.toLowerCase()
    const field = /^(status|tests|next|commits)\s*:/.exec(low)
    if (field) {
      const value = s.slice(s.indexOf(':') + 1).trim()
      if (field[1] === 'next') next = value
      else if (field[1] === 'status') status = value
      else if (field[1] === 'tests') tests = value
      // A step's own status and command follow its step line (`status: failed`, `cmd: … (exit 1)`).
      if (current && (field[1] === 'status' ? /^(failed|failure|error|partial)\b/i.test(value) : /exit\s*[1-9]\d*/.test(value))) current.ok = false
      inOpen = false
      continue
    }
    if (/^(?:cmd|command|run)\s*:/.test(low)) {
      if (current && /exit\s*[1-9]\d*/.test(s)) current.ok = false
      inOpen = false
      continue
    }
    if (/^open\s*:/.test(low)) {
      inOpen = true
      const value = s.slice(s.indexOf(':') + 1).trim()
      if (value) open.push(value.replace(/^[-*•]\s*/, ''))
      current = null
      continue
    }
    if (inOpen && /^[-*•]\s+/.test(s)) {
      open.push(s.replace(/^[-*•]\s+/, ''))
      continue
    }
    const m = STEP_LINE.exec(s)
    if (m?.[1]) {
      const body = m[1].trim()
      const bad = /^(?:✗|✘)/.test(s) || /\b(?:failed|failure|exit\s*[1-9]\d*)\b/i.test(body)
      current = { text: body, ok: !bad }
      steps.push(current)
    }
  }
  const last = steps[steps.length - 1]
  return {
    last: last ? `${last.ok ? '✔' : '✗'} ${last.text}` : '',
    next,
    open: open.slice(0, 4),
    status,
    tests,
    steps: steps.slice(-20),
  }
}

/** `checkpointProbe` stdout as a checkpoint tail; null when the file is missing, huge or unreadable. */
export const parseCheckpoint = (stdout: string): CheckpointTail | null => {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return null
  }
  if (!isObject(raw) || typeof raw.text !== 'string' || !raw.text.trim()) return null
  return parseCheckpointText(raw.text)
}

/** Stored checkpoint tails read back safely. */
export const normalizeCheckpoint = (raw: unknown): CheckpointTail | null => {
  if (!isObject(raw)) return null
  return {
    last: strOf(raw.last),
    next: strOf(raw.next),
    open: listOf<unknown>(raw.open).filter((x): x is string => typeof x === 'string').slice(0, 4),
    status: strOf(raw.status),
    tests: strOf(raw.tests),
    steps: listOf<unknown>(raw.steps)
      .filter(isObject)
      .map(s => ({ text: strOf(s.text), ok: s.ok === true }))
      .filter(s => s.text !== '')
      .slice(-20),
  }
}

/** A brief's relative path resolved against the session cwd; absolute paths (either system) kept as given. */
export const resolvePath = (path: string, cwd: string): string => {
  const p = typeof path === 'string' ? path.trim() : ''
  if (!p) return ''
  if (/^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\')) return p
  const base = typeof cwd === 'string' ? cwd.replace(/\\/g, '/').replace(/\/+$/, '') : ''
  return `${base ? `${base}/` : ''}${p.replace(/\\/g, '/').replace(/^\.\//, '')}`
}

/**
 * The checkpoint file a subagent's brief names (rule 8): a `report:` / `handoff:` line, else the first
 * `.handoffs/<name>.md` token, else for a builder `.handoffs/<agent name>.md`; '' when the brief names none.
 */
export const checkpointPath = (brief: string, name: string, cwd: string): string => {
  const b = typeof brief === 'string' ? brief : ''
  const line = /^[ \t]*(?:report|handoff)[ \t]*:[ \t]*(\S.*)$/im.exec(b)
  const token = line?.[1]?.trim().split(/\s+/)[0]?.replace(/^[`"'(<]+|[`"')>,.;]+$/g, '') ?? ''
  if (token) return resolvePath(token, cwd)
  const hand = /\.handoffs[\\/][\w.-]+\.md/.exec(b)
  if (hand?.[0]) return resolvePath(hand[0], cwd)
  if (/builder/i.test(name)) return resolvePath(`.handoffs/${name.replace(/[^\w.-]/g, '')}.md`, cwd)
  return ''
}

/** The checkpoint path an ended agent's final message names, through its `HANDOFF:` / `REPORT:` line. */
export const checkpointOfAnswer = (answer: string, cwd: string): string => {
  const m = /^[ \t]*(?:HANDOFF|REPORT)[ \t]*:[ \t]*(\S.*)$/im.exec(typeof answer === 'string' ? answer : '')
  const token = m?.[1]?.trim().split(/\s+/)[0]?.replace(/^[`"'(<]+|[`"')>,.;]+$/g, '') ?? ''
  return token ? resolvePath(token, cwd) : ''
}

// ---------------------------------------------------------------- work tree

/** A box whose work is all done collapses to its header line this long after the last end. */
export const COLLAPSE_AFTER_MS = 60_000

/** An ended leaf or done box stays in the tree this long after its end, then drops out. */
export const DONE_KEEP_MS = 60_000

/** A running card with no event for this long is stale: `⊘ stale`, and it leaves like an ended row. */
export const STALE_AFTER_MS = 10 * 60_000

/** Under 56 columns the tree leaves out its live detail lines. */
export const WORK_DETAIL_COLS = 56

/** Under 40 columns a sub-main is one header line. */
export const WORK_NARROW = 40

/** At most 12 glyphs in a strip, then `+N`. */
export const WORK_STRIP_MAX = 12

const WORK_RUNNING = new Set(['running', 'parked', 'need_tool', 'doing', 'queued'])

export const isRunningStatus = (status: string) => WORK_RUNNING.has(status)

/** `●` done ok · `◑` partial · `✗` failed · `◐` running · `⊘` stale · `○` to do; `◎` for a consult panel. */
export const workGlyph = (status: string): string =>
  status === 'done' || status === 'ok'
    ? '●'
    : status === 'partial' || status === 'stopped'
      ? '◑'
      : status === 'failed' || status === 'refused' || status === 'blocked'
        ? '✗'
        : status === 'stale'
          ? '⊘'
          : status === 'queued'
            ? '○'
            : isRunningStatus(status)
              ? '◐'
              : '○'

/** Only to-do and blocked units wait their turn; done, failed and partial are behind. */
export const isTodoStatus = (status: string) => status === 'todo' || status === 'blocked' || status === '' || status === 'queued' || status === 'dry'

/** The one status a box of units adds up to. */
export const sumStatus = (statuses: readonly string[]): string =>
  statuses.some(s => s === 'running' || s === 'parked' || s === 'need_tool' || s === 'doing')
    ? 'running'
    : statuses.some(s => s === 'failed' || s === 'refused')
      ? 'failed'
      : statuses.some(s => s === 'partial' || s === 'stopped')
        ? 'partial'
        : statuses.length > 0 && statuses.every(s => s === 'done' || s === 'ok')
          ? 'done'
          : 'todo'

export type WorkStrip = { glyphs: string[]; more: number; done: number; total: number }

/** One glyph per unit, at most 12 then `+N`, and `<done>/<total>` always. */
export const stripOf = (statuses: readonly string[], max = WORK_STRIP_MAX): WorkStrip => {
  const glyphs = statuses.slice(0, max).map(workGlyph)
  return {
    glyphs,
    more: Math.max(0, statuses.length - glyphs.length),
    done: statuses.filter(s => s === 'done' || s === 'ok').length,
    total: statuses.length,
  }
}

/** A strip as text: `●●◐○○ 2/5`, `●●◐○○+3 2/8`. */
export const stripText = (s: WorkStrip) => `${s.glyphs.join('')}${s.more > 0 ? `+${s.more}` : ''} ${s.done}/${s.total}`

/** A compact duration as the tree draws it: `16m`, `1m12s`, `2s`, `1h05m`. */
export const fmtSpan = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(s / 60)
  if (m === 0) return `${s}s`
  if (m >= 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
  return s % 60 === 0 ? `${m}m` : `${m}m${String(s % 60).padStart(2, '0')}s`
}

const TREE_ITEM = new Set(['leaf', 'step', 'more'])

/**
 * The tree glyph before each drawn row of a box body: `├` for an item (leaf, step, `+N more`) with a
 * later sibling, `└` for the last one, `│` or a space before the detail rows under an item, '' for
 * the other rows (task, box, last, closing). `base` is the shallowest depth that gets a glyph: 0 in
 * a sub-main's body (its rows sit directly in the box), 1 in main's (a task's workers, not main's
 * loose ones). Run it on the fitted entries, so the glyphs follow what is drawn.
 */
export const treePrefixes = (entries: readonly WorkEntry[], base = 0): string[] => {
  const isItem = (e: WorkEntry) => TREE_ITEM.has(e.kind) && e.depth >= base
  const isLast = (i: number) => {
    const d = entries[i].depth
    for (let j = i + 1; j < entries.length; j++) {
      const e = entries[j]
      if (e.depth < d) return true
      if (e.depth === d) return !isItem(e)
    }
    return true
  }
  const out: string[] = []
  const lastOf: boolean[] = []
  let owner = -1
  entries.forEach((e, i) => {
    lastOf[i] = false
    if (isItem(e)) {
      lastOf[i] = isLast(i)
      owner = i
      out.push(lastOf[i] ? '└' : '├')
    } else if ((e.kind === 'detail' || e.kind === 'expand') && owner >= 0 && entries[owner].depth === e.depth - 1) {
      out.push(lastOf[owner] ? ' ' : '│')
    } else {
      if (e.kind !== 'detail' && e.kind !== 'expand') owner = -1
      out.push('')
    }
  })
  return out
}

export type WorkTone = 'main' | 'agent' | 'gate' | 'amber' | 'warn' | 'dim' | 'faint' | 'text' | 'arch' | 'cleared'

/** One labelled row of an expanded leaf (stage, now, work, think, last, next, status, tests). */
export type WorkRow = { label: string; text: string; tone?: WorkTone }

/** A worker: a farmer job, an agy-job call, a consult run or a Claude subagent that spawns nothing. */
export type WorkLeaf = {
  id: string
  kind: 'job' | 'agy' | 'consult' | 'card'
  glyph: string
  /** The role written before the name: `farmer`, `helper`, `consult`. */
  role: string
  name: string
  /** `▸ <model>` when one is known, '' otherwise. */
  worker: string
  /** A short note after the name (`3 engines · 4/7` for a consult). */
  note: string
  status: string
  startedAt: number
  endedAt: number | null
  isLive: boolean
  isStale: boolean
  isRealRepo: boolean
  verifyPending: boolean
  /** The card whose box holds it; '' for main. */
  owner: string
  /** The mesh task it serves, '' when none. */
  task: string
  /** The one detail line under a running leaf. */
  detail: string
  /** Its rows when selected. */
  rows: WorkRow[]
  cost: number | null
}

/** One row of a box's body. */
export type WorkEntry = {
  kind: 'task' | 'leaf' | 'detail' | 'step' | 'more' | 'last' | 'closing' | 'box' | 'expand'
  /** 1 under a task row, 0 directly under the box. */
  depth: number
  leaf?: WorkLeaf
  box?: WorkBox
  text?: string
  /** The task row's status, or a step's. */
  status?: string
  tone?: WorkTone
  done?: boolean
  todo?: boolean
  count?: number
}

export type WorkBox = {
  id: string
  /** The role written in the header: `sub-main`. */
  role: string
  /** The mesh task its brief names, '' when none. */
  task: string
  title: string
  glyph: string
  status: string
  strip: WorkStrip
  startedAt: number
  endedAt: number | null
  isLive: boolean
  entries: WorkEntry[]
  collapsed: boolean
}

export type WorkTree = {
  title: string
  glyph: string
  status: string
  strip: WorkStrip
  startedAt: number
  endedAt: number | null
  isLive: boolean
  /** Live workers and live sub-main headers. */
  running: number
  /** Waiting workers plus the open plan steps of every sub-main. */
  waiting: number
  entries: WorkEntry[]
  boxes: WorkBox[]
  collapsed: boolean
}

export type WorkInput = {
  jobs: readonly Job[]
  issued: readonly Issued[]
  cards: readonly AgentCard[]
  tasks: readonly MeshTask[]
  run: ConsultRun | null
  now: number
  /** The selected leaf (`view.expanded`), whose rows expand under it. */
  expanded?: string | null
  /** When the current turn started: a failed row stays until the next turn starts. */
  turnStartedAt?: number
}

const lastEventOf = (c: AgentCard) => (typeof c.lastAt === 'number' && c.lastAt > 0 ? c.lastAt : c.spawnedAt)

const jobWorkLeaf = (j: Job, issued: readonly Issued[]): WorkLeaf => {
  const live = isJobLive(j)
  const stale = j.stale === true
  const worker = live ? j.trying || j.backend : j.handoffBackend || j.backend || j.trying
  const stage = j.stage ? `stage ${j.stage}${j.attempts > 1 ? ` ×${j.attempts}` : ''}` : ''
  return {
    id: `job:${j.jobid}`,
    kind: 'job',
    glyph: stale ? '⊘' : jobGlyph(j),
    role: 'farmer',
    name: j.job || j.jobid,
    worker: workerDisplay(worker),
    note: '',
    status: stale ? 'stale' : j.status,
    startedAt: jobStartOf(j.jobid, j.ts * 1000),
    endedAt: live ? null : j.endedAt ?? (stale ? j.ts * 1000 : null),
    isLive: live,
    isStale: stale,
    isRealRepo: false,
    verifyPending: false,
    owner: ownerOfJob(issued, j.jobid),
    task: taskOfJob(issued, j.jobid),
    detail: live && j.status === 'running' ? [j.now, j.work].filter(Boolean).join(' · ') : '',
    rows: [
      ...(stage ? [{ label: 'stage', text: stage }] : []),
      ...(j.now ? [{ label: 'now', text: j.now }] : []),
      ...(j.work ? [{ label: 'work', text: j.work }] : []),
      ...(j.think ? [{ label: 'think', text: j.think, tone: 'dim' as const }] : []),
    ],
    cost: j.cost,
  }
}

const agyWorkLeaf = (i: Issued): WorkLeaf => {
  const live = i.endedAt === null
  return {
    id: `agy:${i.callId}`,
    kind: 'agy',
    glyph: live ? '◐' : i.ok === false ? '✗' : '✓',
    role: 'farmer',
    name: `${i.name || 'agy job'}`,
    worker: agyWorker(i.worker, i.model, i.effort),
    note: '',
    status: live ? 'running' : i.ok === false ? 'failed' : 'done',
    startedAt: i.at,
    endedAt: i.endedAt,
    isLive: live,
    isStale: false,
    isRealRepo: true,
    verifyPending: i.verifyPending,
    owner: i.agentId,
    task: i.task,
    detail: live ? [i.now, i.work].filter(Boolean).join(' · ') : '',
    rows: [
      ...(i.now ? [{ label: 'now', text: i.now }] : []),
      ...(i.work ? [{ label: 'work', text: i.work }] : []),
    ],
    cost: live ? null : 0,
  }
}

/** The run a consult call started: the one it was bound to, or the newest started after it. */
const consultRunOf = (i: Issued, run: ConsultRun | null): ConsultRun | null =>
  run && (i.runId === run.id || (!i.runId && run.startedAt >= i.at)) ? run : null

/** A consult call stays in the tree while its run is live and 10 minutes after it ends, as its panel does. */
export const consultShown = (i: Issued, run: ConsultRun | null, now: number): boolean => {
  const bound = consultRunOf(i, run)
  if (bound) return bound.endedAt === null || now - bound.endedAt <= CONSULT_HIDE_AFTER_MS
  return i.endedAt === null || now - i.at <= CONSULT_HIDE_AFTER_MS
}

const consultWorkLeaf = (i: Issued, run: ConsultRun | null): WorkLeaf => {
  const bound = consultRunOf(i, run)
  const live = bound ? bound.endedAt === null && !bound.stale : i.endedAt === null
  const answered = bound ? bound.engines.filter(e => e.state === 'ok').length : 0
  const total = bound ? bound.engines.length : 0
  const failed = bound ? bound.engines.some(e => e.state === 'failed') : i.ok === false
  return {
    id: `consult:${bound?.id || i.callId}`,
    kind: 'consult',
    glyph: '◎',
    role: '',
    name: 'consult',
    worker: '',
    note: total > 0 ? `· ${total} engines · ${answered}/${total}` : '',
    status: live ? 'running' : failed ? 'partial' : 'done',
    startedAt: bound ? bound.startedAt : i.at,
    endedAt: bound ? bound.endedAt : i.endedAt,
    isLive: live,
    isStale: bound?.stale === true,
    isRealRepo: false,
    verifyPending: false,
    owner: i.agentId,
    task: i.task,
    detail: '',
    rows: bound ? [{ label: 'engines', text: `${answered}/${total} answered` }] : [],
    cost: null,
  }
}

const cardWorkLeaf = (c: AgentCard, now: number): WorkLeaf => {
  const stale = c.status === 'running' && now - lastEventOf(c) > STALE_AFTER_MS
  const live = c.status === 'running' && !stale
  return {
    id: c.id,
    kind: 'card',
    glyph: stale ? '⊘' : workGlyph(c.status),
    role: c.type || 'agent',
    name: cardTitle(c),
    worker: c.worker ? workerDisplay(c.worker) : '',
    note: '',
    status: stale ? 'stale' : c.status,
    startedAt: c.spawnedAt,
    endedAt: c.endedAt !== null ? c.endedAt : stale ? lastEventOf(c) + STALE_AFTER_MS : null,
    isLive: live,
    isStale: stale,
    isRealRepo: false,
    verifyPending: false,
    owner: c.parentId,
    task: c.task,
    detail: live && c.check?.next ? `next ${c.check.next}` : '',
    rows: [
      ...(c.check?.last ? [{ label: 'last', text: c.check.last }] : []),
      ...(c.check?.next ? [{ label: 'next', text: c.check.next }] : []),
      ...(c.check?.status && !live ? [{ label: 'status', text: c.check.status }] : []),
      ...(c.check?.tests ? [{ label: 'tests', text: c.check.tests }] : []),
    ],
    cost: c.workerCost,
  }
}

/** A coordinator that is not a root box draws as a line with its own strip. */
const coordWorkLeaf = (c: AgentCard, workers: readonly WorkLeaf[], now: number): WorkLeaf => {
  const statuses = workers.map(l => l.status)
  const status = sumStatus(statuses)
  const live = workers.some(l => l.isLive)
  const ends = workers.map(l => l.endedAt).filter((n): n is number => n !== null)
  const stale = c.status === 'running' && now - lastEventOf(c) > STALE_AFTER_MS
  return {
    id: c.id,
    kind: 'card',
    glyph: stale && !live ? '⊘' : workGlyph(status),
    role: c.type || 'agent',
    name: cardTitle(c),
    worker: '',
    note: stripText(stripOf(statuses)),
    status: stale && !live ? 'stale' : status,
    startedAt: c.spawnedAt,
    endedAt: live || ends.length !== workers.length ? null : Math.max(...ends),
    isLive: live,
    isStale: stale,
    isRealRepo: false,
    verifyPending: false,
    owner: c.parentId,
    task: c.task,
    detail: live && c.check?.next ? `next ${c.check.next}` : '',
    rows: [],
    cost: null,
  }
}

const leafRank = (l: { isLive: boolean; status: string }) => (l.isLive ? 0 : isTodoStatus(l.status) ? 1 : 2)

/** Running first, then to-do, then done, newest first inside a rank. */
export const orderWorkLeaves = <T extends { isLive: boolean; status: string; startedAt: number }>(leaves: readonly T[]): T[] =>
  [...leaves].sort((a, b) => leafRank(a) - leafRank(b) || b.startedAt - a.startedAt)

const entriesOf = (l: WorkLeaf, depth: number, detail: boolean, expanded?: string | null): WorkEntry[] => [
  { kind: 'leaf', depth, leaf: l, done: !l.isLive && !isTodoStatus(l.status) },
  ...(detail && l.detail ? [{ kind: 'detail' as const, depth: depth + 1, leaf: l }] : []),
  ...(expanded === l.id
    ? l.rows.map(r => ({ kind: 'expand' as const, depth: depth + 1, text: `${r.label}  ${r.text}`, tone: r.tone }))
    : []),
]

/** `3 steps left: snapshots · docs · review` for a sub-main's open plan items, '' when none. */
export const stepsLeftText = (open: readonly string[], max = 80): string => {
  if (open.length === 0) return ''
  const head = `${open.length} step${open.length === 1 ? '' : 's'} left: `
  return shorten(`${head}${open.join(' · ')}`, max)
}

/**
 * The whole delegation as one tree: main's sub-main headers, each with its workers and one steps-left
 * row, then main's loose workers. Only live work, waiting work and work ended under a minute ago.
 */
export const buildWork = (input: WorkInput): WorkTree => {
  const now = input.now
  const exp = input.expanded ?? null
  const cards = input.cards
  const byId = new Map(cards.map(c => [c.id, c]))
  const hasKids = (id: string) => Boolean(id) && cards.some(c => c.parentId === id)

  /** A card and its ancestors, nearest first. */
  const chainOf = (owner: string): string[] => {
    const out: string[] = []
    let cur = owner
    for (let i = 0; i < 16 && cur; i += 1) {
      const c = byId.get(cur)
      if (!c) break
      out.push(cur)
      cur = c.parentId
    }
    return out
  }
  /** The outermost coordinator an owner hangs under, '' for main. */
  const boxOf = (owner: string): string => {
    const chain = chainOf(owner)
    for (let i = chain.length - 1; i >= 0; i -= 1) if (hasKids(chain[i]!)) return chain[i]!
    return ''
  }

  const turnAt = input.turnStartedAt ?? 0
  const isFailed = (s: string) => s === 'failed' || s === 'refused'
  // A failed row stays until the next turn starts; every other ended row leaves after a minute.
  const keepLeaf = (l: WorkLeaf): boolean =>
    l.isLive ||
    l.endedAt === null ||
    (isFailed(l.status) && (turnAt <= 0 || l.endedAt >= turnAt)) ||
    now - l.endedAt <= DONE_KEEP_MS

  const rawLeaves: WorkLeaf[] = []
  for (const j of orderJobs(input.jobs, now)) rawLeaves.push(jobWorkLeaf(j, input.issued))
  for (const i of input.issued) {
    if (i.kind === 'agy' && (i.endedAt === null || now - i.endedAt <= DONE_KEEP_MS)) rawLeaves.push(agyWorkLeaf(i))
    if (i.kind === 'consult' && consultShown(i, input.run, now)) rawLeaves.push(consultWorkLeaf(i, input.run))
  }
  for (const c of cards) if (!hasKids(c.id)) rawLeaves.push(cardWorkLeaf(c, now))

  const leaves = rawLeaves.filter(keepLeaf)
  const directOf = (id: string, src: readonly WorkLeaf[] = leaves) => src.filter(l => l.owner === id)
  /** A deeper coordinator's workers: its own and its descendants', not the root box's direct ones. */
  const underOf = (id: string, root: string, src: readonly WorkLeaf[] = leaves) =>
    src.filter(l => l.owner !== root && chainOf(l.owner).includes(id))

  const roots = cards.filter(c => hasKids(c.id) && boxOf(c.id) === c.id)
  const deeps = cards.filter(c => hasKids(c.id) && boxOf(c.id) !== c.id)
  const taskById = new Map(input.tasks.filter(t => t.id).map(t => [t.id, t]))

  const subBox = (c: AgentCard): WorkBox | null => {
    const boxDeeps = deeps.filter(x => boxOf(x.id) === c.id)
    const rawAll = [...directOf(c.id, rawLeaves), ...boxDeeps.flatMap(d => underOf(d.id, c.id, rawLeaves))]
    const keptAll = rawAll.filter(keepLeaf)
    const cardStale = c.status === 'running' && now - lastEventOf(c) > STALE_AFTER_MS
    const isBoxLive = (c.status === 'running' && !cardStale) || keptAll.some(l => l.isLive) || boxDeeps.some(d => d.status === 'running')
    let boxEnd: number | null = null
    if (!isBoxLive) {
      const cardEnd = c.status === 'running' ? (cardStale ? lastEventOf(c) + STALE_AFTER_MS : null) : c.endedAt
      const ends = [cardEnd, ...keptAll.map(l => l.endedAt), ...boxDeeps.map(d => d.endedAt)].filter((n): n is number => n !== null)
      if (ends.length > 0) boxEnd = Math.max(...ends)
    }
    const keepsAFailure = keptAll.some(l => isFailed(l.status) && l.endedAt !== null && (turnAt <= 0 || l.endedAt >= turnAt))
    if (boxEnd !== null && now - boxEnd > DONE_KEEP_MS && !keepsAFailure) return null

    const workers = orderWorkLeaves(directOf(c.id))
    const check = c.check
    const open = check?.open ?? []
    const statuses = [...workers.map(l => l.status), ...open.map(() => 'todo')]
    const entries: WorkEntry[] = []
    for (const l of workers.filter(w => w.isLive)) entries.push(...entriesOf(l, 0, false, exp))
    for (const l of workers.filter(w => !w.isLive)) entries.push(...entriesOf(l, 0, false, exp))
    for (const d of boxDeeps) {
      const keptUnder = underOf(d.id, c.id)
      const rawUnder = underOf(d.id, c.id, rawLeaves)
      const dLive = d.status === 'running' || rawUnder.some(l => l.isLive)
      const dEnds = [d.status === 'running' ? null : d.endedAt, ...rawUnder.map(l => l.endedAt)].filter((n): n is number => n !== null)
      const dEnd = !dLive && rawUnder.every(l => l.endedAt !== null) && dEnds.length > 0 ? Math.max(...dEnds) : null
      if (dEnd !== null && now - dEnd > DONE_KEEP_MS) continue
      const dl = coordWorkLeaf(d, keptUnder, now)
      entries.push({ kind: 'leaf', depth: 0, leaf: dl, done: !dl.isLive })
    }
    const steps = stepsLeftText(open)
    if (steps) entries.push({ kind: 'step', depth: 0, text: steps, status: 'todo', todo: true, count: open.length })
    if (!isBoxLive && entries.length === 0) return null
    const startedEnds = [c.spawnedAt, ...workers.map(w => w.startedAt)].filter(n => n > 0)
    const boxStatus = isBoxLive ? 'running' : cardStale ? 'stale' : sumStatus(statuses)
    const role = c.type || 'sub-main'
    const subject = taskById.get(c.task)?.subject ?? ''
    return {
      id: c.id,
      role,
      task: c.task,
      title: `${role}${c.task ? ` · ${c.task}${subject ? ` ${subject}` : ''}` : ''}`,
      glyph: workGlyph(boxStatus),
      status: boxStatus,
      strip: stripOf(statuses),
      startedAt: startedEnds.length > 0 ? Math.min(...startedEnds) : 0,
      endedAt: boxEnd,
      isLive: isBoxLive,
      entries,
      collapsed: false,
    }
  }

  const boxes = [...roots]
    .map(subBox)
    .filter((b): b is WorkBox => b !== null)
    .sort((a, b) => Number(b.isLive) - Number(a.isLive) || (a.status === 'todo' ? -1 : 0) - (b.status === 'todo' ? -1 : 0) || a.startedAt - b.startedAt)

  const mainLeaves = orderWorkLeaves(leaves.filter(l => boxOf(l.owner) === ''))
  const entries: WorkEntry[] = []
  for (const b of boxes) entries.push({ kind: 'box', depth: 0, box: b })
  for (const l of mainLeaves) entries.push(...entriesOf(l, 0, false, exp))

  const runningInside = boxes.reduce((n, b) => n + b.entries.filter(e => e.kind === 'leaf' && e.leaf?.isLive).length, 0)
  const running = mainLeaves.filter(l => l.isLive).length + boxes.filter(b => b.isLive).length + runningInside
  const openSteps = boxes.reduce((n, b) => n + b.entries.filter(e => e.kind === 'step').reduce((m, e) => m + (e.count ?? 0), 0), 0)
  const waitingLeaves = mainLeaves.filter(l => !l.isLive && isTodoStatus(l.status)).length + boxes.reduce((n, b) => n + b.entries.filter(e => e.kind === 'leaf' && e.leaf && !e.leaf.isLive && isTodoStatus(e.leaf.status)).length, 0)
  const waiting = waitingLeaves + openSteps

  const starts = [...leaves.map(l => l.startedAt), ...boxes.map(b => b.startedAt)].filter(n => n > 0)
  const ends = [...leaves.map(l => l.endedAt), ...boxes.map(b => b.endedAt)]
  const endedAll = running === 0 && ends.length > 0 && ends.every((n): n is number => n !== null) ? Math.max(...ends) : null
  const status = running > 0 ? 'running' : waiting > 0 ? 'todo' : 'done'
  return {
    title: `running ${running} · waiting ${waiting}`,
    glyph: workGlyph(status),
    status,
    strip: stripOf(mainLeaves.map(l => l.status)),
    startedAt: starts.length > 0 ? Math.min(...starts) : 0,
    endedAt: endedAll,
    isLive: running > 0,
    running,
    waiting,
    entries,
    boxes,
    collapsed: false,
  }
}

/** Whether the tree has anything to draw: no worker and no task takes no room. */
export const isWorkEmpty = (w: WorkTree) => w.entries.length === 0

/** How many rows a box takes when drawn: its header line plus a line per body entry. */
export const workBoxRows = (b: WorkBox, _cols = 0): number => 1 + b.entries.length

/** How many rows the whole tree takes at `cols`, the frame's two rows included. */
export const workRows = (w: WorkTree, _cols = 0): number =>
  w.entries.length === 0
    ? 0
    : 2 + w.entries.reduce((n, e) => n + (e.kind === 'box' && e.box ? workBoxRows(e.box) : 1), 0)

/**
 * The tree at most `budget` rows tall: expanded rows first, then ended leaves, then whole boxes from
 * the end, then steps-left rows and finally waiting rows, keeping live work to the last.
 */
export const fitWork = (w: WorkTree, budget: number, cols: number): WorkTree => {
  // One clone per box, shared by `boxes` and the entries that draw it, so a fit that trims a box
  // body really trims what workRows and the renderer see.
  const boxes = w.boxes.map(b => ({ ...b, entries: [...b.entries] }))
  const byId = new Map(boxes.map(b => [b.id, b]))
  const next: WorkTree = {
    ...w,
    entries: w.entries.map(e => (e.box ? { ...e, box: byId.get(e.box.id) ?? { ...e.box, entries: [...e.box.entries] } } : { ...e })),
    boxes,
  }
  const total = () => workRows(next, cols)
  if (total() <= budget) return next
  const lists = (): WorkEntry[][] => [next.entries, ...next.boxes.map(b => b.entries)]
  const dropLast = (pred: (e: WorkEntry, inBox: boolean) => boolean): boolean => {
    for (const inBox of [true, false]) {
      const list = inBox ? lists().slice(1).sort((a, b) => b.length - a.length)[0] : next.entries
      if (!list) continue
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (pred(list[i]!, inBox)) {
          list.splice(i, 1)
          return true
        }
      }
    }
    return false
  }
  let guard = 0
  while (total() > budget && guard < 300) {
    guard += 1
    if (dropLast(e => e.kind === 'expand', true)) continue
    if (dropLast(e => e.kind === 'leaf' && Boolean(e.leaf && !e.leaf.isLive && !isTodoStatus(e.leaf.status)), true)) continue
    if (next.boxes.length > 0 && total() > budget) {
      const gone = next.boxes.pop()!
      next.entries = next.entries.filter(e => e.box?.id !== gone.id)
      continue
    }
    if (dropLast(e => e.kind === 'step', true)) continue
    if (dropLast(e => e.kind === 'leaf' && Boolean(e.leaf && !e.leaf.isLive), true)) continue
    if (dropLast(e => e.kind === 'leaf', true)) continue
    break
  }
  return next
}

// ---------------------------------------------------------------- plan

/** The mesh task ids a sub-main's brief names: a task row draws `→ sub-main` for each. */
export const subMainTasks = (cards: readonly AgentCard[]): Set<string> =>
  new Set(cards.filter(c => !c.parentId && c.task && /sub-main/i.test(c.type)).map(c => c.task))

export type PlanFit = { rows: MeshTask[]; more: number; isDone: boolean }

/**
 * The plan's rows: the doing task first, then the to-do ones, then the done ones. With too few rows
 * it keeps the doing task and the next to-do ones, and folds the rest into one `+N done` (or `+N more`).
 */
export const fitPlan = (tasks: readonly MeshTask[], budget: number): PlanFit => {
  const plan = tasks.filter(t => t.id)
  const isDoing = (s: string) => s === 'doing' || s === 'running'
  const doing = plan.filter(t => isDoing(t.status))
  const todo = plan.filter(t => !isDoing(t.status) && isTodoStatus(t.status))
  const done = plan.filter(t => !isDoing(t.status) && !isTodoStatus(t.status))
  const all = [...doing, ...todo, ...done]
  // The whole plan keeps the file's order; only a short pane puts the doing and to-do rows first.
  if (plan.length <= budget) return { rows: plan, more: 0, isDone: false }
  if (budget <= 1) return { rows: all.slice(0, Math.max(0, budget)), more: 0, isDone: false }
  const room = Math.max(1, budget - (done.length > 0 ? 1 : 0))
  const shown = [...doing, ...todo].slice(0, room)
  // The line under the rows counts the done tasks left out, never the to-do ones still ahead.
  return { rows: shown, more: done.length, isDone: true }
}

// ---------------------------------------------------------------- consult text

/** The first sentence of a question, up to `:`, `.`, `?` or a newline. */
export const firstSentence = (text: string): string => {
  const raw = text.trim()
  const m = /^[^:.?\n]*[:.?\n]/.exec(raw)
  return (m ? m[0] : raw).replace(/\s+/g, ' ').trim()
}

/** The question as one quoted line, or '' when the whole first sentence does not fit `width`. */
export const questionLine = (question: string, width: number): string => {
  const sentence = firstSentence(question)
  if (!sentence) return ''
  const line = `“${sentence}”`
  return cellWidth(line) <= width ? line : ''
}

/** The model an engine runs: its `model` field, else the part after the first `:` in its name. */
export const engineModel = (e: Pick<ConsultEngine, 'name' | 'model'>): string => {
  if (typeof e.model === 'string' && e.model.trim()) return e.model.trim()
  const i = e.name.indexOf(':')
  return i >= 0 ? e.name.slice(i + 1).trim() : ''
}

/** `✓ 8/9 answered · ⊘ codex` at the end of a run: names shorten, the counts never do. */
export const consultSummaryLine = (run: ConsultRun, width: number): string => {
  const total = run.engines.length
  const answered = run.engines.filter(e => e.state === 'ok').length
  let line = `✓ ${answered}/${total} answered`
  const names = [
    ...run.engines.filter(e => e.state === 'skipped').map(e => `⊘ ${shortConsultEngine(e.name)}`),
    ...run.engines.filter(e => e.state === 'failed').map(e => `✗ ${shortConsultEngine(e.name)}`),
  ]
  let omitted = false
  for (const name of names) {
    const next = `${line} · ${name}`
    if (cellWidth(next) <= width) line = next
    else omitted = true
  }
  if (omitted && names.length > 0) {
    const tail = `${line} · …`
    if (cellWidth(tail) <= width) line = tail
  }
  return line
}

/** `⊘ codex until 22:54` for every locked or skipped engine, on one line, or '' when none. */
export const consultLockNote = (run: ConsultRun | null, locks: readonly { engine: string; hhmm: string }[], width: number): string => {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const lk of locks) {
    const name = shortConsultEngine(lk.engine)
    if (seen.has(name)) continue
    seen.add(name)
    parts.push(`⊘ ${name} until ${lk.hhmm}`)
  }
  for (const e of run?.engines ?? []) {
    if (e.state !== 'skipped') continue
    const name = shortConsultEngine(e.name)
    if (seen.has(name)) continue
    seen.add(name)
    const at = /(\d{1,2}:\d{2})\s*$/.exec(e.reason ?? '')
    parts.push(at ? `⊘ ${name} until ${at[1]}` : `⊘ ${name}`)
  }
  if (parts.length === 0) return ''
  let line = parts[0]!
  for (const part of parts.slice(1)) {
    const next = `${line} · ${part}`
    if (cellWidth(next) <= width) line = next
  }
  return shorten(line, width)
}

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
    ...(typeof raw.model === 'string' && raw.model.trim() ? { model: raw.model.trim() } : {}),
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
    // Newlines stay: the question line stops at the first one.
    question: typeof raw.question === 'string' ? raw.question.replace(/[ \t]+/g, ' ').trim() : '',
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
export type RingNodeInput = { label: string; width: number; glyph?: string; name?: string; dur?: string; model?: string }
export type RingNodePos = {
  label: string
  width: number
  angle: number
  anchorX: number
  anchorY: number
  labelX: number
  labelY: number
  align: 'left' | 'right' | 'center'
  /** Its model, drawn in one dim row under the label; undefined = no row. */
  model?: string
  modelX?: number
  modelY?: number
  modelWidth?: number
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

// A straight raster line can round to either side; keep the variants so close spokes can choose.
const spokeLines = (from: Pt, to: Pt): Pt[][] => {
  const paths = [bresenham(from.x, from.y, to.x, to.y)]
  const dx = to.x - from.x
  const dy = to.y - from.y
  const steps = Math.max(Math.abs(dx), Math.abs(dy))
  if (steps > 0) {
    for (const round of [Math.floor, Math.ceil]) {
      paths.push(Array.from({ length: steps + 1 }, (_, k) => ({
        x: Math.abs(dx) >= Math.abs(dy) ? from.x + Math.sign(dx) * k : round(from.x + dx * k / steps),
        y: Math.abs(dx) >= Math.abs(dy) ? round(from.y + dy * k / steps) : from.y + Math.sign(dy) * k,
      })))
    }
  }
  const seen = new Set<string>()
  return paths.filter(path => {
    const key = path.map(p => `${p.x},${p.y}`).join(';')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

const arrowFromVec = (vx: number, vy: number): string => {
  const deg = (Math.atan2(vy, vx) * 180) / Math.PI
  if (deg >= -22.5 && deg < 22.5) return '→'
  if (deg >= 22.5 && deg < 67.5) return '↘'
  if (deg >= 67.5 && deg < 112.5) return '↓'
  if (deg >= 112.5 && deg < 157.5) return '↙'
  if (deg >= 157.5 || deg < -157.5) return '←'
  if (deg >= -157.5 && deg < -112.5) return '↖'
  if (deg >= -112.5 && deg < -67.5) return '↑'
  return '↗'
}

const DUR_SUFFIX_RE = /^(\S+) (.+?) (\d+(?:s|m\d{2}s|h\d{2}m))$/

const fitRingLabel = (nd: RingNodeInput, room: number): string => {
  if (cellWidth(nd.label) <= room) return nd.label
  let glyph = nd.glyph
  let name = nd.name
  if (glyph === undefined || name === undefined) {
    const m = DUR_SUFFIX_RE.exec(nd.label)
    if (m) {
      glyph = m[1]!
      name = m[2]!
    }
  }
  if (glyph !== undefined && name !== undefined) {
    const noDur = `${glyph} ${name}`
    if (cellWidth(noDur) <= room) return noDur
    if (room >= 3) return `${glyph} ${shorten(name, room - 2)}`
    return shorten(noDur, room)
  }
  const sp = nd.label.indexOf(' ')
  if (sp === 1 && room >= 3) return `${nd.label[0]} ${shorten(nd.label.slice(2), room - 2)}`
  return shorten(nd.label, room)
}

/** Any cell a label or its model row owns: spokes and arc arrowheads keep out. */
const isNodeLabelCell = (nodes: readonly RingNodePos[], x: number, y: number): boolean =>
  nodes.some(
    nd =>
      (y === nd.labelY && x >= nd.labelX && x < nd.labelX + nd.width) ||
      (nd.model !== undefined && nd.modelWidth !== undefined && nd.modelX !== undefined && y === nd.modelY && x >= nd.modelX && x < nd.modelX + nd.modelWidth),
  )

const angDiff = (a: number, b: number): number => Math.abs(((a - b + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)

const ellipsePointAngle = (p: Pt, cxMid: number, cy: number, rx: number, ry: number): number =>
  (Math.atan2((p.x - cxMid) / Math.max(1, rx), -(p.y - cy) / Math.max(1, ry)) + 2 * Math.PI) % (2 * Math.PI)

const pickArcArrowIdx = (
  seg: readonly Pt[],
  nodes: readonly RingNodePos[],
  fromAngle: number,
  toAngle: number,
  cxMid: number,
  cy: number,
  rx: number,
  ry: number,
): number => {
  const delta = ((toAngle - fromAngle + 2 * Math.PI) % (2 * Math.PI)) || 2 * Math.PI
  const tMid = (fromAngle + delta / 2) % (2 * Math.PI)
  let arrowIdx = Math.floor(seg.length / 2)
  let bestAng = Infinity
  for (let k = 0; k < seg.length; k += 1) {
    const p = seg[k]!
    if (!isNodeLabelCell(nodes, p.x, p.y)) {
      const d = angDiff(ellipsePointAngle(p, cxMid, cy, rx, ry), tMid)
      if (d < bestAng) {
        bestAng = d
        arrowIdx = k
      }
    }
  }
  return arrowIdx
}

/**
 * Computes balanced, mirror-symmetric ellipse layout for `nodes` on a `cols x rows` cell grid:
 * rounded `MAIN` centre box, one continuous 8-connected spoke from each engine label to its
 * arrowhead beside the hub, and a smooth dotted clockwise ring for debate rounds. Side engines sit
 * on the hub's middle row, so their spoke is a straight horizontal line.
 */
export const ringLayout = (
  nodes: readonly RingNodeInput[],
  cols: number,
  rows: number,
  options: { isDebate?: boolean; tagWidth?: number } = {},
): RingLayout => {
  const n = nodes.length
  const isDebate = Boolean(options.isDebate)
  const tagW = options.tagWidth ?? 6
  const boxW = isDebate ? Math.max(8, tagW + 4 + (tagW % 2)) : 8
  const boxH = isDebate ? 4 : 3
  const boxX = Math.floor((cols - boxW) / 2)
  const cy = Math.floor(rows / 2)
  const centre: RingBox = { x: boxX, y: cy - 1, width: boxW, height: boxH }
  const cxLeft = boxX + Math.floor(boxW / 2) - 1
  const cxRight = boxX + Math.floor(boxW / 2)
  const cx = cxRight
  const ry = Math.max(2, cy - 1)
  // Keep the terminal's ~2.2 aspect as a minimum; wider panels leave room for longer spokes.
  const minRx = Math.max(7, Math.min(Math.round(ry * 2.2), Math.floor((cols - 20) / 2)))
  const rightW = Math.max(0, ...nodes.filter((_, i) => i > 0 && i < n / 2).map(nd => nd.width))
  const leftW = Math.max(0, ...nodes.filter((_, i) => i > n / 2).map(nd => nd.width))
  const rx = Math.max(minRx, Math.min(cxLeft - leftW - 2, cols - cxRight - rightW - 3))

  type RawAnchor = {
    angle: number
    dx: number
    ady: number
    anchorX: number
    anchorY: number
    labelY: number
    align: RingNodePos['align']
  }
  const rawAnchors: RawAnchor[] = new Array(n)
  if (n > 0) {
    rawAnchors[0] = { angle: 0, dx: 0, ady: ry, anchorX: cx, anchorY: cy - ry, labelY: 0, align: 'center' }
    if (n % 2 === 0) {
      const h = n / 2
      rawAnchors[h] = { angle: Math.PI, dx: 0, ady: ry, anchorX: cx, anchorY: cy + ry, labelY: rows - 1, align: 'center' }
    }
    // Round once in [0, pi/2] and mirror both top/bottom and left/right so i and n-i match exactly.
    for (let i = 1; i < n / 2; i += 1) {
      const theta = (2 * Math.PI * i) / n
      const inTop = theta <= Math.PI / 2 + 1e-9
      const alpha = inTop ? theta : Math.PI - theta
      const dx = Math.max(1, Math.round(rx * Math.sin(alpha)))
      const ady = Math.round(ry * Math.cos(alpha))
      const y = cy + (inTop ? -ady : ady)
      rawAnchors[i] = { angle: theta, dx, ady, anchorX: cxRight + dx, anchorY: y, labelY: y, align: 'left' }
      const j = n - i
      rawAnchors[j] = { angle: (2 * Math.PI * j) / n, dx, ady, anchorX: cxLeft - dx, anchorY: y, labelY: y, align: 'right' }
    }
  }

  const placeLabel = (a: RawAnchor, nd: RingNodeInput): RingNodePos => {
    let label = nd.label
    let width = nd.width
    let labelX = 0
    if (a.align === 'center') {
      const room = Math.max(1, cols - 2)
      label = fitRingLabel(nd, room)
      width = cellWidth(label)
      labelX = Math.max(1, Math.min(cols - 1 - width, Math.floor((cols - width) / 2)))
    } else if (a.align === 'left') {
      const start = Math.min(cols - 2, a.anchorX + 2)
      const room = Math.max(1, cols - 1 - start)
      label = fitRingLabel(nd, room)
      width = cellWidth(label)
      labelX = start
    } else {
      const end = Math.max(1, a.anchorX - 2)
      const room = Math.max(1, end)
      label = fitRingLabel(nd, room)
      width = cellWidth(label)
      labelX = end - width + 1
    }
    return {
      label,
      width,
      angle: a.angle,
      anchorX: a.anchorX,
      anchorY: a.anchorY,
      labelX,
      labelY: a.labelY,
      align: a.align,
    }
  }

  const placed: RingNodePos[] = rawAnchors.map((a, i) => placeLabel(a, nodes[i]!))

  // A side engine sits on the hub's middle row when its side has no other label there: the spoke is
  // then one straight horizontal line from the label to the arrowhead beside MAIN.
  if (!isDebate && n > 2) {
    // Pick the mirrored pair nearest the middle row, so both sides snap together.
    let best = -1
    for (let i = 1; i < n / 2; i += 1) {
      const nd = placed[i]!
      if (nd.align === 'center') continue
      if (best < 0 || Math.abs(nd.labelY - cy) < Math.abs(placed[best]!.labelY - cy)) best = i
    }
    if (best > 0) {
      const pair = [best, n - best]
      const sideOf = (i: number) => (i < n / 2 ? 'left' : 'right')
      const free = pair.every(i => !placed.some((o, j) => j !== i && o.align === placed[i]!.align && sideOf(j) === sideOf(i) && o.labelY === cy))
      if (free) {
        for (const i of pair) {
          const nd = placed[i]!
          if (nd.align === 'center') continue
          nd.labelY = cy
          nd.anchorY = cy
          nd.anchorX = nd.align === 'left' ? cxRight + rx : cxLeft - rx
          if (nd.align === 'left') {
            nd.labelX = Math.min(cols - 1 - nd.width, nd.anchorX + 2)
          } else {
            nd.labelX = Math.max(1, nd.anchorX - 2 - nd.width + 1)
          }
        }
      }
    }
  }

  // One dim model row under each label, centred and truncated to the label's width + 4.
  for (let i = 0; i < placed.length; i += 1) {
    const nd = placed[i]!
    const raw = nodes[i]!.model
    if (typeof raw !== 'string' || raw.trim() === '') continue
    let y = nd.labelY + 1
    if (y >= rows) {
      // A bottom label moves up one row; its model takes the row under it.
      nd.labelY -= 1
      if (nd.align === 'center') nd.anchorY -= 1
      y = nd.labelY + 1
    }
    const labelCentre = nd.labelX + (nd.width - 1) / 2
    const room = Math.floor(Math.min(labelCentre - 1, cols - 1 - labelCentre)) * 2 + 1
    const maxW = Math.max(1, Math.min(nd.width + 4, cols - 2, room))
    const text = shorten(raw.trim(), maxW)
    const width = cellWidth(text)
    let x = Math.round(labelCentre - (width - 1) / 2)
    x = Math.max(1, Math.min(cols - 1 - width, x))
    if (y < 0 || y >= rows) continue
    // Keep out of every other label or model row; a model that cannot fit is left out.
    const blocked = placed.some(
      (o, j) =>
        j !== i &&
        ((y === o.labelY && x < o.labelX + o.width && x + width > o.labelX) ||
          (o.model !== undefined && o.modelWidth !== undefined && o.modelX !== undefined && y === o.modelY && x < o.modelX + o.modelWidth && x + width > o.modelX)),
    )
    if (blocked) continue
    const inCentre = y >= centre.y && y < centre.y + centre.height && x < centre.x + centre.width && x + width > centre.x
    if (inCentre) continue
    nd.model = text
    nd.modelX = x
    nd.modelY = y
    nd.modelWidth = width
  }

  // Build one smooth, 4-way symmetric ellipse from a single first-quadrant curve (0 .. pi/2).
  const q1Angles: number[] = []
  const SAMPLES = 128
  for (let k = 0; k <= SAMPLES; k += 1) q1Angles.push((Math.PI / 2) * (k / SAMPLES))
  for (let i = 1; i < n / 2; i += 1) {
    const theta = (2 * Math.PI * i) / n
    q1Angles.push(theta <= Math.PI / 2 + 1e-9 ? theta : Math.PI - theta)
  }
  q1Angles.sort((a, b) => a - b)

  const q1Raw: Pt[] = []
  for (const t of q1Angles) {
    const dx = Math.round(rx * Math.sin(t))
    const ady = Math.round(ry * Math.cos(t))
    const prev = q1Raw[q1Raw.length - 1]
    if (!prev) {
      q1Raw.push({ x: dx, y: ady })
    } else if (dx !== prev.x || ady !== prev.y) {
      if (Math.abs(dx - prev.x) > 1 || Math.abs(ady - prev.y) > 1) {
        const bridge = bresenham(prev.x, prev.y, dx, ady)
        for (let b = 1; b < bridge.length; b += 1) q1Raw.push(bridge[b]!)
      } else {
        q1Raw.push({ x: dx, y: ady })
      }
    }
  }
  const protQ1 = new Set<string>([`0,${ry}`, `${rx},0`])
  for (let i = 1; i < n / 2; i += 1) protQ1.add(`${rawAnchors[i]!.dx},${rawAnchors[i]!.ady}`)
  const q1 = collapseCorners(q1Raw, protQ1)

  const loop: Pt[] = []
  const pushLoopPt = (x: number, y: number) => {
    const prev = loop[loop.length - 1]
    if (!prev || prev.x !== x || prev.y !== y) loop.push({ x, y })
  }
  for (let k = 0; k < q1.length; k += 1) pushLoopPt(cxRight + q1[k]!.x, cy - q1[k]!.y)
  for (let k = q1.length - 2; k >= 0; k -= 1) pushLoopPt(cxRight + q1[k]!.x, cy + q1[k]!.y)
  for (let k = 0; k < q1.length; k += 1) pushLoopPt(cxLeft - q1[k]!.x, cy + q1[k]!.y)
  for (let k = q1.length - 2; k >= 0; k -= 1) pushLoopPt(cxLeft - q1[k]!.x, cy - q1[k]!.y)
  if (loop.length > 1 && loop[loop.length - 1]!.x === loop[0]!.x && loop[loop.length - 1]!.y === loop[0]!.y) loop.pop()

  const cxMid = centre.x + (centre.width - 1) / 2
  const cyMid = centre.y + (centre.height - 1) / 2

  let arcs: RingArcCell[][]
  if (n < 2) {
    arcs = nodes.map(() => [])
  } else {
    const anchorIdx: number[] = new Array(n)
    let searchFrom = 0
    for (let i = 0; i < n; i += 1) {
      const nd = placed[i]!
      let found = -1
      for (let idx = searchFrom; idx < loop.length; idx += 1) {
        if (loop[idx]!.x === nd.anchorX && loop[idx]!.y === nd.anchorY) {
          found = idx
          break
        }
      }
      if (found < 0) {
        let bestD = Infinity
        for (let idx = searchFrom; idx < loop.length; idx += 1) {
          const d = Math.abs(loop[idx]!.x - nd.anchorX) + Math.abs(loop[idx]!.y - nd.anchorY)
          if (d < bestD) {
            bestD = d
            found = idx
          }
        }
      }
      anchorIdx[i] = found
      searchFrom = found + 1
    }
    arcs = placed.map((nd, i) => {
      const nextNd = placed[(i + 1) % n]!
      const start = anchorIdx[i]!
      const end = i < n - 1 ? anchorIdx[i + 1]! : loop.length
      const seg = loop.slice(start, end)
      const arrowIdx = pickArcArrowIdx(seg, placed, nd.angle, nextNd.angle, cxMid, cy, rx, ry)
      return seg.map((p, k) => {
        const aGlyph = arrowFromVec(-(p.y - cy) / Math.max(1, ry), (p.x - cxMid) / Math.max(1, rx))
        const isArrow = k === arrowIdx
        return { x: p.x, y: p.y, glyph: isArrow ? aGlyph : '·', lineGlyph: '·', arrowGlyph: aGlyph, isArrow }
      })
    })
  }

  const bx0 = centre.x
  const bx1 = centre.x + centre.width - 1
  const by0 = centre.y
  const by1 = centre.y + centre.height - 1
  const outerRing: Pt[] = []
  for (let x = bx0 - 1; x <= bx1 + 1; x += 1) outerRing.push({ x, y: by0 - 1 })
  for (let y = by0; y <= by1; y += 1) outerRing.push({ x: bx1 + 1, y })
  for (let x = bx1 + 1; x >= bx0 - 1; x -= 1) outerRing.push({ x, y: by1 + 1 })
  for (let y = by1; y >= by0; y -= 1) outerRing.push({ x: bx0 - 1, y })
  const inCentre = (x: number, y: number) => x >= bx0 && x <= bx1 && y >= by0 && y <= by1

  const spokePts: Pt[][] = nodes.map(() => [])
  if (!isDebate && n > 0) {
    // Where a spoke leaves its label: one cell inside the label's block, toward MAIN.
    const entryOf = (nd: RingNodePos): Pt => {
      if (nd.align === 'left') return { x: nd.labelX - 1, y: nd.labelY }
      if (nd.align === 'right') return { x: nd.labelX + nd.width, y: nd.labelY }
      const top = nd.anchorY < cy
      const modelTowardHub = nd.model !== undefined && nd.modelY === (top ? nd.labelY + 1 : nd.labelY - 1)
      return { x: nd.labelX + Math.floor(nd.width / 2), y: top ? nd.labelY + (modelTowardHub ? 2 : 1) : nd.labelY - 1 }
    }
    const onLabel = (p: Pt) => isNodeLabelCell(placed, p.x, p.y)
    const inGrid = (p: Pt) => p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows
    const paths: Pt[][] = nodes.map(() => [])
    const straight = (nd: RingNodePos, entry: Pt, p: Pt) =>
      nd.align === 'center' ? Number(p.x !== entry.x) : Number(p.y !== entry.y)
    const order = placed
      .map((nd, i) => ({ nd, i }))
      .sort((a, b) => {
        const sideRow = (x: RingNodePos) => (x.align !== 'center' && x.labelY === cy ? 0 : x.align === 'center' ? 1 : 2)
        return sideRow(a.nd) - sideRow(b.nd) || Math.abs(a.nd.labelY - cy) - Math.abs(b.nd.labelY - cy) || a.i - b.i
      })
    const fits = (path: readonly Pt[], arrow: Pt): boolean =>
      path.every(p => inGrid(p) && !inCentre(p.x, p.y) && !onLabel(p)) &&
      paths.every(other => {
        if (other.length === 0) return true
        const otherArrow = other[other.length - 1]!
        if (Math.abs(arrow.x - otherArrow.x) + Math.abs(arrow.y - otherArrow.y) <= 1) return false
        return path.every(p => other.every(q => p.x !== q.x || p.y !== q.y))
      })
    const place = (k: number): boolean => {
      if (k === order.length) return true
      const { nd, i } = order[k]!
      const entry = entryOf(nd)
      const candidates: { pts: Pt[]; score: number[] }[] = []
      for (const target of outerRing) {
        if (onLabel(target)) continue
        for (const pts of spokeLines(entry, target)) {
          if (pts.length < 2) continue
          const dist = Math.abs(target.x - entry.x) + Math.abs(target.y - entry.y)
          const aim = Math.abs(angDiff(Math.atan2(target.x - cxMid, -(target.y - cyMid)), nd.angle))
          candidates.push({ pts, score: [straight(nd, entry, target), dist, aim] })
        }
      }
      candidates.sort((a, b) => a.score[0]! - b.score[0]! || a.score[1]! - b.score[1]! || a.score[2]! - b.score[2]!)
      for (const cand of candidates) {
        if (!fits(cand.pts, cand.pts[cand.pts.length - 1]!)) continue
        paths[i] = cand.pts
        if (place(k + 1)) return true
        paths[i] = []
      }
      return false
    }
    place(0)
    for (let i = 0; i < n; i += 1) {
      const pts = paths[i]!
      if (pts.length < 2) continue
      spokePts[i] = pts
    }
  } else {
    const separate = (a: readonly Pt[], b: readonly Pt[]): boolean =>
      a.every(p =>
        b.every(q => {
          const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y)
          return d > 1
        }),
      )
    const groups: { indices: number[]; candidates: Pt[][][] }[] = []
    // Choose right-hand endpoints and mirror whole paths, not just their arrowheads.
    for (let i = 0; i <= n / 2 && i < n; i += 1) {
      const nd = placed[i]!
      const indices = nd.align === 'center' ? [i] : [i, n - i]
      const vx = nd.anchorX - cxMid
      const vy = nd.anchorY - cyMid
      const targets = outerRing.filter(p => {
        if (nd.align === 'center') return p.x === nd.anchorX && (p.y - cyMid) * vy > 0
        if (p.x < cxRight) return false
        if (nd.anchorY < by0) return p.y === by0 - 1 || (p.x === bx1 + 1 && p.y === by0)
        if (nd.anchorY > by1) return p.y === by1 + 1 || (p.x === bx1 + 1 && p.y === by1)
        return p.x === bx1 + 1 && p.y >= by0 && p.y <= by1
      })
      const distance = (p: Pt) => Math.abs((p.x - cxMid) * vy - (p.y - cyMid) * vx)
      const sideCorner = (p: Pt) => nd.align !== 'center' && (nd.anchorY < by0 || nd.anchorY > by1) && p.y >= by0 && p.y <= by1
      targets.sort((a, b) => Number(sideCorner(a)) - Number(sideCorner(b)) || distance(a) - distance(b))
      const candidates = targets
        .flatMap(p =>
          spokeLines({ x: nd.anchorX, y: nd.anchorY }, p).map(right =>
            indices.length === 1 ? [right] : [right, right.map(q => ({ x: 2 * cxMid - q.x, y: q.y }))],
          ),
        )
        .filter(
          ps =>
            ps.every(path => path.length >= 2 && path.every(p => !inCentre(p.x, p.y) && !isNodeLabelCell(placed, p.x, p.y))) &&
            (ps.length === 1 || separate(ps[0]!, ps[1]!)),
        )
      groups.push({ indices, candidates })
    }
    groups.sort((a, b) => a.candidates.length - b.candidates.length)
    const placeSpokes = (g: number): boolean => {
      if (g === groups.length) return true
      const group = groups[g]!
      for (const ps of group.candidates) {
        if (!ps.every(path => spokePts.every(other => other.length === 0 || separate(path, other)))) continue
        group.indices.forEach((idx, k) => {
          spokePts[idx] = ps[k]!
        })
        if (placeSpokes(g + 1)) return true
        group.indices.forEach(idx => {
          spokePts[idx] = []
        })
      }
      return false
    }
    placeSpokes(0)
  }

  const spokes: RingCell[][] = spokePts.map(pts =>
    pts.map((p, k) => {
      const prev = pts[Math.max(0, k - 1)]!
      return {
        x: p.x,
        y: p.y,
        glyph: k === pts.length - 1 ? arrowFromVec(p.x - prev.x, p.y - prev.y) : '·',
      }
    }),
  )

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
  const ringHeight = run.engines.length <= 6 ? 11 : 13
  const parts = run.engines.map(e => {
    const glyph = consultGlyph(e.state)
    // A locked or skipped engine keeps no clock: its label is just `⊘ name`.
    const dur = e.state === 'skipped' ? '' : consultEngineDuration(e, run, now)
    const name = shortConsultEngine(e.name, 12)
    const label = dur ? `${glyph} ${name} ${dur}` : `${glyph} ${name}`
    return { e, glyph, name, dur, label, width: cellWidth(label), model: engineModel(e) }
  })
  const tag = `⟳ R${run.round}/${run.rounds}`
  const layout = ringLayout(
    parts.map(p => ({ label: p.label, width: p.width, glyph: p.glyph, name: p.name, dur: p.dur, ...(p.model ? { model: p.model } : {}) })),
    cols,
    ringHeight,
    { isDebate, tagWidth: cellWidth(tag) },
  )
  const buf: (GridCell | null)[][] = Array.from({ length: ringHeight }, () => Array.from({ length: cols }, () => null))
  const put = (x: number, y: number, ch: string, color: string, bold = false, dim = false) => {
    if (ch === ' ' || y < 0 || y >= ringHeight || x < 0 || x >= cols) return
    buf[y]![x] = { ch, color, bold, dim }
  }
  const putStr = (x: number, y: number, s: string, color: string, bold = false, dim = false) => {
    const chars = [...s]
    for (let i = 0; i < chars.length; i += 1) put(x + i, y, chars[i]!, color, bold, dim)
  }

  const c = layout.centre
  putStr(c.x, c.y, `╭${'─'.repeat(c.width - 2)}╮`, colors.main)
  put(c.x, c.y + 1, '│', colors.main)
  put(c.x + c.width - 1, c.y + 1, '│', colors.main)
  putStr(c.x + Math.floor((c.width - 4) / 2), c.y + 1, 'MAIN', colors.main, true)
  if (isDebate) {
    put(c.x, c.y + 2, '│', colors.main)
    put(c.x + c.width - 1, c.y + 2, '│', colors.main)
    putStr(c.x + Math.floor((c.width - cellWidth(tag)) / 2), c.y + 2, tag, colors.arch)
    putStr(c.x, c.y + 3, `╰${'─'.repeat(c.width - 2)}╯`, colors.main)
  } else {
    putStr(c.x, c.y + 2, `╰${'─'.repeat(c.width - 2)}╯`, colors.main)
  }
  // One dim model row under each engine label, where the run file names one.
  for (const nd of layout.nodes) {
    if (nd.model !== undefined && nd.modelX !== undefined && nd.modelY !== undefined) {
      putStr(nd.modelX, nd.modelY, nd.model, colors.dim, false, true)
    }
  }

  const paths: RingAnimatedPath[] = []
  const isRunLive = run.endedAt === null && !run.stale

  if (!isDebate) {
    for (let i = 0; i < parts.length; i += 1) {
      const st = parts[i]!.e.state
      const spoke = layout.spokes[i] ?? []
      if (st === 'failed' || spoke.length === 0) continue
      if (st === 'skipped') {
        // A locked engine keeps a broken faint spoke that ends in ⊘ beside the hub.
        for (let k = 0; k < spoke.length - 1; k += 3) {
          const pt = spoke[k]!
          put(pt.x, pt.y, '·', colors.faint)
        }
        const last = spoke[spoke.length - 1]!
        put(last.x, last.y, '⊘', colors.amber)
      } else if (st === 'ok') {
        for (const pt of spoke) put(pt.x, pt.y, pt.glyph, colors.gate)
      } else if (st === 'queued') {
        for (const pt of spoke) put(pt.x, pt.y, '·', colors.faint)
      } else if (st === 'running') {
        for (let k = 0; k < spoke.length; k += 1) {
          const pt = spoke[k]!
          put(pt.x, pt.y, pt.glyph, k === spoke.length - 1 ? colors.agent : colors.dim)
        }
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
      const cxMid = c.x + (c.width - 1) / 2
      const closedCells: RingCell[] = []
      for (let k = 0; k < partIdx.length; k += 1) {
        const from = partIdx[k]!
        const to = partIdx[(k + 1) % partIdx.length]!
        const seg: RingArcCell[] = []
        for (let j = from; ; j = (j + 1) % n) {
          seg.push(...(layout.arcs[j] ?? []))
          if ((j + 1) % n === to) break
        }
        const arrowIdx = pickArcArrowIdx(
          seg,
          layout.nodes,
          layout.nodes[from]!.angle,
          layout.nodes[to]!.angle,
          cxMid,
          layout.cy,
          layout.rx,
          layout.ry,
        )
        for (let m = 0; m < seg.length; m += 1) {
          const pt = seg[m]!
          if (isNodeLabelCell(layout.nodes, pt.x, pt.y)) continue
          const g = m === arrowIdx ? pt.arrowGlyph : pt.lineGlyph
          put(pt.x, pt.y, g, staticColor)
          closedCells.push({ x: pt.x, y: pt.y, glyph: g })
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
      st === 'ok' ? colors.gate : st === 'running' ? colors.agent : st === 'failed' ? colors.warn : st === 'skipped' ? colors.warn : colors.faint
    const nameColor =
      st === 'queued' ? colors.faint : st === 'failed' ? colors.warn : st === 'skipped' ? colors.warn : colors.text
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
  // Odd engine counts have no south-pole label; do not reserve an unused bottom row.
  while (rows.length > 0 && rows[rows.length - 1]!.length === 0) rows.pop()
  const caption = 'answers pass round the ring'
  if (isDebate && cols >= cellWidth(caption) + 2) {
    rows.push([{ x: Math.floor((cols - cellWidth(caption)) / 2), text: caption, color: colors.dim, dim: true }])
  }

  return {
    width: cols,
    height: rows.length,
    active: isRunLive && (paths.length > 0 || spinners.length > 0),
    isDebate,
    rows,
    paths,
    spinners,
    layout,
  }
}
