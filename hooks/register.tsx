import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentCard, Architect, Bucket, Check, CheckpointTail, ConsultState, Feed, Gate, Issued, Job, Layout, LogLine, Loop, Main, MeshTask, Roster, Turn, Usage, View } from '../types'
import {
  AGY_SHOW_MS,
  PYTHON_CANDIDATES,
  WORK_DETAIL_COLS,
  WORK_NARROW,
  buildWork,
  checkpointOfAnswer,
  checkpointPath,
  checkpointProbe,
  consultSummaryLine,
  engineModel,
  fitPlan,
  fitWork,
  flattenWork,
  isRunningStatus,
  isTodoStatus,
  isWorkEmpty,
  parseCheckpoint,
  questionLine,
  subMainTasks,
  treePrefixes,
  fmtSpan,
  workGlyph,
  workRows,
  DEFAULT_ARCHITECT,
  addCard,
  cardForTaskStop,
  resumeCard,
  DEFAULT_GATE,
  DEFAULT_MAIN,
  DEFAULT_ROSTER,
  DEFAULT_TURN,
  DEFAULT_USAGE,
  DEFAULT_VIEW,
  EDIT_TOOLS,
  SCHEMA_VERSION,
  afterCall,
  applyStep,
  bucketOf,
  buildConsultGrid,
  cellWidth,
  consultEngineDuration,
  consultGlyph,
  consultKindLabel,
  consultProbe,
  piecesThatFit,
  cardTitle,
  afterCompactHooked,
  afterCompactRead,
  agyProbe,
  applyAgyLive,
  bindConsultRun,
  bindResult,
  isConsultLive,
  isConsultShown,
  isJobLive,
  isObject,
  issueCall,
  jobsProbe,
  meshProbe,
  normalizeIssued,
  parseAgyLive,
  parseJobs,
  parseMeshTasks,
  parseRunnerCall,
  receiptJobParts,
  receiptPanelRow,
  receiptSummary,
  taskAtIssue,
  taskOfBrief,
  turnConsults,
  turnJobs,
  afterFillRead,
  afterResponse,
  claimCompactRead,
  compactMark,
  headerTaskText,
  contextFill,
  faultKey,
  forgetCompactRead,
  knowsMono,
  titleLines,
  consultTimeline,
  describeInput,
  endConsult,
  fmtClock,
  fmtCny,
  fmtDuration,
  fmtTimer,
  fmtUsd,
  plural,
  gateSummary,
  gauge,
  isAdvising,
  isLoopActive,
  kTokens,
  lanes,
  limitLabel,
  limitOf,
  fmtResetIn,
  feedLabel,
  MAX_GEM,
  listOf,
  logRows,
  marksIn,
  momentOf,
  normalize,
  normalizeCard,
  normalizeConsult,
  normalizeFeed,
  normalizeGate,
  normalizeJob,
  normalizeLog,
  fmtWorkerCost,
  jobsCost,
  noteJob,
  noteTool,
  parseJobText,
  shortConsultEngine,
  shortWorker,
  workerProbe,
  PALETTES,
  SVG_COLORS,
  parseConfig,
  parseConsult,
  parseFeed,
  prettyModel,
  promptLine,
  handbackOf,
  adviceLine,
  receiptOf,
  recordCheck,
  settleCheck,
  shorten,
  startConsult,
  stepSpeed,
  stepLoop,
} from './core'
import type { Config, Panel, RingGridRun, WorkBox, WorkEntry, WorkLeaf } from './core'

const PANE = 'flightdeck'
const TITLE = 'Flightdeck'


// ---------------------------------------------------------------- state

const meta = atom({ plugin: 'flightdeck', key: 'meta' } as const, { schemaVersion: SCHEMA_VERSION })
const main = atom({ plugin: 'flightdeck', key: 'main' } as const, DEFAULT_MAIN)
const usage = atom({ plugin: 'flightdeck', key: 'usage' } as const, DEFAULT_USAGE)
const architect = atom({ plugin: 'flightdeck', key: 'architect' } as const, DEFAULT_ARCHITECT)
const gate = atom({ plugin: 'flightdeck', key: 'gate' } as const, DEFAULT_GATE)
const agents = atom({ plugin: 'flightdeck', key: 'agents' } as const, [])
const jobs = atom({ plugin: 'flightdeck', key: 'jobs' } as const, [])
const issued = atom({ plugin: 'flightdeck', key: 'issued' } as const, [])
const mesh = atom({ plugin: 'flightdeck', key: 'mesh' } as const, [])
const loops = atom({ plugin: 'flightdeck', key: 'loops' } as const, [])
const log = atom({ plugin: 'flightdeck', key: 'log' } as const, [])
const turn = atom({ plugin: 'flightdeck', key: 'turn' } as const, DEFAULT_TURN)
const receipt = atom({ plugin: 'flightdeck', key: 'receipt' } as const, null)
const view = atom({ plugin: 'flightdeck', key: 'view' } as const, DEFAULT_VIEW)
const roster = atom({ plugin: 'flightdeck', key: 'roster' } as const, DEFAULT_ROSTER)
const feed = atom({ plugin: 'flightdeck', key: 'feed' } as const, null)
const consult = atom({ plugin: 'flightdeck', key: 'consult' } as const, null)

type ServerBlock = { type: string; id?: string; name?: string; tool_use_id?: string }

// Every read goes through these, so a value saved under an older shape still reads.
async function getMain($: EngineInterface): Promise<Main> {
  return normalize(DEFAULT_MAIN, await read($, main))
}
async function getUsage($: EngineInterface): Promise<Usage> {
  return normalize(DEFAULT_USAGE, await read($, usage))
}
/** Whether this engine's Text takes `mono`; false when it can't say, or has no `$.session.version` to ask. */
async function readMono($: EngineInterface): Promise<boolean> {
  try {
    return knowsMono(await $.session.version())
  } catch {
    return false
  }
}
async function getArchitect($: EngineInterface): Promise<Architect> {
  const a = normalize(DEFAULT_ARCHITECT, await read($, architect))
  return { ...a, consults: listOf(a.consults), ids: listOf(a.ids), seen: listOf(a.seen) }
}
async function getGate($: EngineInterface): Promise<Gate> {
  return normalizeGate(await read($, gate))
}
async function getCards($: EngineInterface): Promise<AgentCard[]> {
  return listOf<unknown>(await read($, agents)).map(normalizeCard)
}
async function getJobs($: EngineInterface): Promise<Job[]> {
  return listOf<unknown>(await read($, jobs)).map(normalizeJob)
}
async function getIssued($: EngineInterface): Promise<Issued[]> {
  return normalizeIssued(await read($, issued))
}
async function getMesh($: EngineInterface): Promise<MeshTask[]> {
  return listOf<unknown>(await read($, mesh))
    .filter(isObject)
    .map(x => ({ id: String(x.id ?? ''), status: String(x.status ?? ''), subject: typeof x.subject === 'string' ? x.subject : '' }))
}
async function getLoops($: EngineInterface): Promise<Loop[]> {
  return listOf<Loop>(await read($, loops))
}
async function getLog($: EngineInterface): Promise<LogLine[]> {
  return normalizeLog(await read($, log))
}
async function getTurn($: EngineInterface): Promise<Turn> {
  return normalize(DEFAULT_TURN, await read($, turn))
}
async function getView($: EngineInterface): Promise<View> {
  return normalize(DEFAULT_VIEW, await read($, view))
}
async function getRoster($: EngineInterface): Promise<Roster> {
  const r = normalize(DEFAULT_ROSTER, await read($, roster))
  return { architectTypes: listOf(r.architectTypes) }
}
async function getFeed($: EngineInterface): Promise<Feed | null> {
  return normalizeFeed(await read($, feed))
}
async function getConsult($: EngineInterface): Promise<ConsultState | null> {
  return normalizeConsult(await read($, consult))
}

/** A stored shape older than this build's: drop what cannot be read, keep the rest. */
async function migrate($: EngineInterface) {
  const m = await read($, meta)
  if ((m?.schemaVersion ?? 0) >= SCHEMA_VERSION) return
  await update($, log, list => normalizeLog(list))
  await update($, agents, list => listOf<unknown>(list).map(normalizeCard))
  await update($, jobs, list => listOf<unknown>(list).map(normalizeJob))
  await update($, issued, list => normalizeIssued(list))
  await update($, gate, g => normalizeGate(g))
  await update($, meta, () => ({ schemaVersion: SCHEMA_VERSION }))
}

async function say($: EngineInterface, who: string, text: string, kind: LogLine['kind'] = 'info', agentId: string | null = null) {
  const line: LogLine = { at: await $.clock.now(), who, text, kind, agentId }
  await update($, log, list => [...normalizeLog(list), line].slice(-60))
}

async function refreshStatus($: EngineInterface, cfg: Config) {
  if (!cfg.statusLine) return $.ui.status(undefined)
  const [u, a, g, cards] = await Promise.all([getUsage($), getArchitect($), getGate($), getCards($)])
  const running = cards.filter(c => c.status === 'running').length
  const s = gateSummary(g)
  const ctxFill = contextFill(u, cfg.ctxBudget)
  const parts = [
    ctxFill.pct !== null ? `ctx ${Math.round(ctxFill.pct)}%` : null,
    cards.length > 0 ? `agents ${running}/${cards.length}` : null,
    a.consults.length > 0 || a.ids.length > 0 ? `${cfg.architectLabel.toLowerCase()} ${isAdvising(a) ? 'advising' : a.consults.length}` : null,
    s.deny > 0 ? `denied ${s.deny}` : null,
  ]
  // Only fields with something to say; with none, no status entry at all.
  const shown = parts.filter(Boolean)
  $.ui.status(shown.length > 0 ? shown.join(' · ') : undefined)
}

async function whoIs($: EngineInterface, agentId: string | undefined) {
  if (!agentId) return 'main'
  const card = (await getCards($)).find(c => c.id === agentId)
  return card ? shorten(cardTitle(card), 14) : 'agent'
}

async function consultStarted($: EngineInterface, cfg: Config, id: string, via: string) {
  const t = await getTurn($)
  const moment = momentOf(t)
  const at = await $.clock.now()
  await update($, architect, a => startConsult(normalize(DEFAULT_ARCHITECT, a), { id, at, moment, via }))
  if (moment === 'before done') await update($, turn, x => ({ ...normalize(DEFAULT_TURN, x), isReviewing: true }))
  await say($, cfg.architectLabel.toLowerCase(), cfg.moments ? `${moment} · ${via}` : `consulted · ${via}`, 'consult')
  await refreshStatus($, cfg)
}

async function consultEnded($: EngineInterface, cfg: Config, advice: string | null, id?: string) {
  const at = await $.clock.now()
  const first = advice?.split('\n').find(l => l.trim()) ?? null
  const text = first ? shorten(first.replace(/^[#>*\s-]+/, ''), 160) : null
  await update($, architect, a => endConsult(normalize(DEFAULT_ARCHITECT, a), at, text, id))
  await update($, turn, t => ({ ...normalize(DEFAULT_TURN, t), isReviewing: false }))
  await say($, cfg.architectLabel.toLowerCase(), text ? `advice: ${shorten(text, 60)}` : 'advice returned', 'consult')
  await refreshStatus($, cfg)
}

async function noteAdvice($: EngineInterface, cfg: Config, advice: string) {
  await update($, architect, x => ({ ...normalize(DEFAULT_ARCHITECT, x), lastAdvice: advice }))
  await say($, cfg.architectLabel.toLowerCase(), `advice: ${shorten(advice, 60)}`, 'consult')
}

async function isArchitectType($: EngineInterface, cfg: Config, type: string) {
  return cfg.architect.test(type) || (await getRoster($)).architectTypes.includes(type)
}

async function openPane($: EngineInterface, cfg: Config) {
  // columns apply when docked beside the transcript, rows when seated inline above the prompt.
  return $.ui.open({ id: PANE, title: TITLE, columns: cfg.paneColumns, rows: 8 })
}

async function resetAll($: EngineInterface) {
  await update($, main, m => ({ ...DEFAULT_MAIN, model: normalize(DEFAULT_MAIN, m).model, mode: normalize(DEFAULT_MAIN, m).mode }))
  await update($, architect, () => DEFAULT_ARCHITECT)
  await update($, gate, () => DEFAULT_GATE)
  await update($, agents, () => [])
  await update($, jobs, () => [])
  await update($, issued, () => [])
  await update($, mesh, () => [])
  await update($, loops, () => [])
  await update($, log, () => [])
  await update($, turn, () => DEFAULT_TURN)
  await update($, receipt, () => null)
  await update($, view, () => DEFAULT_VIEW)
  // The context gauge waits for the next measurement rather than showing the pre-clear fill.
  await update($, usage, x => ({ ...normalize(DEFAULT_USAGE, x), pct: null, tokens: null }))
}

/**
 * Stores the compaction window for the model window `window`. A `summary` breakdown estimates locally
 * and sends no request; until the host gives one, the gauge stays on the model's window (afterCompactRead).
 */
async function readCompactWindow($: EngineInterface, window: number) {
  const r = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  await update($, usage, x => afterCompactRead(normalize(DEFAULT_USAGE, x), window, r?.context.breakdown))
}

/** The session's cost read fresh, not from the last measurement: the receipt subtracts two of these. */
async function costNow($: EngineInterface): Promise<number | null> {
  const u = await $.session.usage().catch(() => null)
  return u?.cost?.usd ?? null
}

async function noteMode($: EngineInterface, mode: string | undefined) {
  if (mode) await update($, main, m => (normalize(DEFAULT_MAIN, m).mode === mode ? normalize(DEFAULT_MAIN, m) : { ...normalize(DEFAULT_MAIN, m), mode }))
}

// ---------------------------------------------------------------- hooks

const FEED_INTERVAL_MS = 30_000
const FEED_TIMEOUT_MS = 20_000

function modelDisplayName(raw: unknown): string {
  if (typeof raw === 'string') return raw ? prettyModel(raw) : ''
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>
    if (typeof o.display_name === 'string') return o.display_name
    if (typeof o.displayName === 'string') return o.displayName
    if (typeof o.name === 'string') return o.name
    if (typeof o.id === 'string') return o.id ? prettyModel(o.id) : ''
  }
  return ''
}

async function pollFeed($: EngineInterface, argv: string[], lock: { inFlight: boolean }) {
  if (argv.length === 0 || lock.inFlight) return
  lock.inFlight = true
  try {
    const [sid, cwd, rawModel] = await Promise.all([
      $.session.id().catch(() => ''),
      $.session.cwd().catch(() => ''),
      $.session.model().catch(() => ''),
    ])
    const stdin = JSON.stringify({
      session_id: typeof sid === 'string' ? sid : '',
      cwd: typeof cwd === 'string' ? cwd : '',
      model: { display_name: modelDisplayName(rawModel) },
    })
    const res = await $.process.run(argv, { stdin, timeoutMs: FEED_TIMEOUT_MS })
    if (res.exitCode !== 0) return
    const now = await $.clock.now()
    const parsed = parseFeed(res.stdout, now)
    if (parsed) await update($, feed, () => parsed)
  } catch {
    // Silent: keep the last good feed value.
  } finally {
    lock.inFlight = false
  }
}

/**
 * Fills the main panel at start instead of at the first request: the model (`$.session.model()`), the
 * effort (`effortLevel`) and the permission mode (`permissions.defaultMode`) from the settings, each only
 * where nothing is known yet. A resumed session (it has prompts already) whose host has no fill yet gets
 * the context from a local `summary` breakdown, marked as an estimate until the first response counts it.
 * Every read is best effort.
 */
async function seedResumed($: EngineInterface, u: { context: { tokens?: number; window: number } } | null) {
  const [model, effort, perms, turns] = await Promise.all([
    $.session.model().catch(() => ''),
    $.settings.read({ key: 'effortLevel' }).catch(() => undefined),
    $.settings.read({ key: 'permissions' }).catch(() => undefined),
    $.session.turns().catch(() => 0),
  ])
  const mode = isObject(perms) && typeof perms.defaultMode === 'string' ? perms.defaultMode : ''
  await update($, main, x => {
    const m = normalize(DEFAULT_MAIN, x)
    return {
      ...m,
      model: m.model || (typeof model === 'string' ? model : ''),
      effort: m.effort || (typeof effort === 'string' ? effort : ''),
      mode: m.mode || mode,
    }
  })
  if (turns <= 0 || !u || u.context.tokens !== undefined) return
  const r = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const b = r?.context.breakdown
  if (!b || !(b.totalTokens > 0)) return
  const window = r.context.window || u.context.window
  await update($, usage, x => {
    const now = normalize(DEFAULT_USAGE, x)
    if (now.tokens !== null && !now.isFillEstimate) return now
    const read = afterCompactRead({ ...now, window, compactFor: window }, window, b)
    return { ...read, tokens: b.totalTokens, pct: window > 0 ? (b.totalTokens * 100) / window : null, isFillEstimate: true }
  })
}

const WORKER_INTERVAL_MS = 10_000
const WORKER_TIMEOUT_MS = 5_000
const CONSULT_TICK_MS = 1_000
const CONSULT_LIVE_TICKS = 2
const CONSULT_IDLE_TICKS = 15
const CONSULT_TIMEOUT_MS = 5_000

type ConsultLock = {
  inFlight: boolean
  python: readonly string[]
  lastJson: string
  boundRun: string
  isLive: boolean
  ticks: number
  started: boolean
  stopped: boolean
  stopTimer: (() => void) | undefined
}

/**
 * Polls the newest external consult run file this session started, and the locks file, via `consultProbe`.
 * Keeps the last good state on failure and skips overlapping calls.
 */
async function pollConsult($: EngineInterface, dir: string, lock: ConsultLock): Promise<boolean | null> {
  if (lock.inFlight || lock.stopped) return null
  lock.inFlight = true
  try {
    const sid = await $.session.id().catch(() => '')
    let res: { exitCode: number; stdout: string } | null = null
    for (const py of lock.python.length > 0 ? [lock.python] : PYTHON_CANDIDATES) {
      res = await $.process.run(consultProbe(py, dir, typeof sid === 'string' ? sid : ''), { timeoutMs: CONSULT_TIMEOUT_MS }).catch(() => null)
      if (res && res.exitCode === 0) {
        lock.python = py
        break
      }
    }
    if (!res || res.exitCode !== 0) return null
    const parsed = parseConsult(res.stdout)
    if (!parsed) return null
    if (res.stdout !== lock.lastJson) {
      lock.lastJson = res.stdout
      await update($, consult, () => parsed)
    }
    if (parsed.run && parsed.run.id !== lock.boundRun) {
      lock.boundRun = parsed.run.id
      await update($, issued, list => bindConsultRun(normalizeIssued(list), parsed.run))
    }
    const live = isConsultLive(parsed)
    lock.isLive = live
    return live
  } catch {
    return null
  } finally {
    lock.inFlight = false
  }
}

/**
 * Asks each running card's job dir which model works on it now (a job runner falls back from model to
 * model, so this can change mid-run). Runs nothing when no running card has a job dir.
 */
async function pollWorkers($: EngineInterface, lock: { inFlight: boolean; python: readonly string[] }) {
  if (lock.inFlight) return
  lock.inFlight = true
  try {
    const now = await $.clock.now()
    const todo = (await getCards($)).filter(c => c.jobdir && (c.status === 'running' || (c.endedAt !== null && now - c.endedAt < 3 * WORKER_INTERVAL_MS)))
    for (const c of todo) {
      let res: { exitCode: number; stdout: string } | null = null
      for (const py of lock.python.length > 0 ? [lock.python] : PYTHON_CANDIDATES) {
        res = await $.process.run(workerProbe(py, c.jobdir), { timeoutMs: WORKER_TIMEOUT_MS }).catch(() => null)
        if (res && res.exitCode === 0) {
          lock.python = py
          break
        }
      }
      const found = res && res.exitCode === 0 ? parseJobText(`backend: ${res.stdout.trim()}`).backend : ''
      if (found && found !== c.worker) {
        await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(x => (x.id === c.id ? { ...x, worker: found, lastAt: now } : x)))
      }
    }
  } catch {
    // Silent: the card keeps the last worker it knew.
  } finally {
    lock.inFlight = false
  }
}

const JOBS_TICK_MS = 1_000
const JOBS_LIVE_TICKS = 3
const JOBS_IDLE_TICKS = 20
const JOBS_TIMEOUT_MS = 5_000

type JobsLock = {
  inFlight: boolean
  python: readonly string[]
  ticks: number
  isLive: boolean
  started: boolean
  stopped: boolean
  stopTimer: (() => void) | undefined
  lastJobs: string
  lastAgy: string
  /** jobid (or `agy:<callId>`) → the conversation db already matched to it. */
  dbCache: Record<string, string>
}

/**
 * Reads the job dirs (`jobsProbe`) and the live agy-job calls (`agyProbe`) into their atoms. Every 3 s while
 * one is live, every 20 s otherwise; one probe in flight; silent on errors, keeping the last good rows.
 */
async function pollJobs($: EngineInterface, root: string, lock: JobsLock) {
  if (lock.inFlight || lock.stopped) return
  lock.inFlight = true
  try {
    const now = await $.clock.now()
    const list = await getIssued($)
    const agy = list.filter(i => i.kind === 'agy' && (i.endedAt === null || now - i.endedAt < AGY_SHOW_MS))
    let stdout = ''
    for (const py of lock.python.length > 0 ? [lock.python] : PYTHON_CANDIDATES) {
      const res = await $.process.run(jobsProbe(py, root, lock.dbCache), { timeoutMs: JOBS_TIMEOUT_MS }).catch(() => null)
      if (res && res.exitCode === 0) {
        lock.python = py
        stdout = res.stdout
        break
      }
    }
    const parsed = stdout ? parseJobs(stdout, now) : null
    if (parsed) {
      for (const j of parsed) if (j.db) lock.dbCache[j.jobid] = j.db
      if (stdout !== lock.lastJobs) {
        lock.lastJobs = stdout
        await update($, jobs, () => parsed)
      }
    }
    if (agy.length > 0) {
      let agyOut = ''
      const calls = agy.map(i => ({ callId: i.callId, name: i.name, repo: i.repo, since: i.at, handoff: i.handoff }))
      for (const py of lock.python.length > 0 ? [lock.python] : PYTHON_CANDIDATES) {
        const res = await $.process.run(agyProbe(py, calls, lock.dbCache), { timeoutMs: JOBS_TIMEOUT_MS }).catch(() => null)
        if (res && res.exitCode === 0) {
          lock.python = py
          agyOut = res.stdout
          break
        }
      }
      const live = agyOut ? parseAgyLive(agyOut) : null
      if (live) {
        for (const l of live) if (l.db) lock.dbCache[`agy:${l.callId}`] = l.db
        if (agyOut !== lock.lastAgy) {
          lock.lastAgy = agyOut
          await update($, issued, current => applyAgyLive(normalizeIssued(current), live))
        }
      }
    }
    lock.isLive = (await getJobs($)).some(isJobLive) || agy.some(i => i.endedAt === null)
  } catch {
    // Silent: the pane keeps the last rows it read.
  } finally {
    lock.inFlight = false
  }
}

const MESH_TIMEOUT_MS = 2_000

/**
 * A session's mesh task items, read-only. Main's direct workers hang under the item that was `doing`
 * when they were issued, so they are read at issue time; '' when the cache cannot be read.
 */
async function readMeshTasks($: EngineInterface, python: readonly string[]): Promise<{ tasks: MeshTask[]; python: readonly string[] }> {
  const sid = await $.session.id().catch(() => '')
  if (typeof sid !== 'string' || !sid) return { tasks: [], python }
  for (const py of python.length > 0 ? [python] : PYTHON_CANDIDATES) {
    const res = await $.process.run(meshProbe(py, sid), { timeoutMs: MESH_TIMEOUT_MS }).catch(() => null)
    if (res && res.exitCode === 0) return { tasks: parseMeshTasks(res.stdout), python: py }
  }
  return { tasks: [], python }
}

const MESH_TICK_MS = 5_000
const CHECKPOINT_TICK_MS = 10_000
const CHECKPOINT_TIMEOUT_MS = 5_000

type MeshLock = { inFlight: boolean; python: readonly string[]; last: string }
type CheckpointLock = { inFlight: boolean; python: readonly string[] }

/** Reads the session's mesh task items into the `mesh` atom every 5 s; silent and one at a time. */
async function pollMesh($: EngineInterface, lock: MeshLock) {
  if (lock.inFlight) return
  lock.inFlight = true
  try {
    const r = await readMeshTasks($, lock.python)
    lock.python = r.python
    const json = JSON.stringify(r.tasks)
    if (json !== lock.last) {
      lock.last = json
      await update($, mesh, () => r.tasks)
    }
  } catch {
    // Silent: the tree keeps the plan it last read.
  } finally {
    lock.inFlight = false
  }
}

/**
 * Reads the checkpoint tail of every running card (and one that just ended) every 10 s: the last step,
 * next command, open bullets, status and tests. Read-only; a missing or huge file leaves the rows out.
 */
async function pollCheckpoints($: EngineInterface, lock: CheckpointLock) {
  if (lock.inFlight) return
  lock.inFlight = true
  try {
    const now = await $.clock.now()
    const todo = (await getCards($)).filter(
      c => c.checkpoint && (c.status === 'running' || (c.endedAt !== null && now - c.endedAt < 3 * CHECKPOINT_TICK_MS)),
    )
    for (const c of todo) {
      let res: { exitCode: number; stdout: string } | null = null
      for (const py of lock.python.length > 0 ? [lock.python] : PYTHON_CANDIDATES) {
        res = await $.process.run(checkpointProbe(py, c.checkpoint), { timeoutMs: CHECKPOINT_TIMEOUT_MS }).catch(() => null)
        if (res && res.exitCode === 0) {
          lock.python = py
          break
        }
      }
      const tail = res && res.exitCode === 0 ? parseCheckpoint(res.stdout) : null
      if (tail) await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(x => (x.id === c.id ? { ...x, check: tail, lastAt: now } : x)))
    }
  } catch {
    // Silent: the card keeps the checkpoint rows it last read.
  } finally {
    lock.inFlight = false
  }
}

/** Stores a checkpoint tail on a card, when it has one. */
async function noteCheckpoint($: EngineInterface, id: string, tail: CheckpointTail | null) {
  if (!tail) return
  const at = await $.clock.now()
  await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? { ...c, check: tail, lastAt: at } : c)))
}

/** Marks a card ended (by `turn.complete` or `TaskStop`), reads its final checkpoint, logs and updates status. */
async function finishCard(
  $: EngineInterface,
  cfg: Config,
  checkLock: CheckpointLock,
  card: AgentCard,
  status: string,
  at: number,
  opts: { answer?: string; checkpoint?: string; note?: string } = {},
) {
  const checkpoint = opts.checkpoint ?? card.checkpoint
  const answer = opts.answer !== undefined ? shorten(opts.answer, 400) : card.answer
  await update($, agents, list =>
    listOf<unknown>(list)
      .map(normalizeCard)
      .map(c => (c.id === card.id ? { ...c, status, endedAt: at, answer, checkpoint, lastAt: at } : c)),
  )
  // One last read of the checkpoint, so an ended card shows its final status and tests.
  if (checkpoint) {
    let res: { exitCode: number; stdout: string } | null = null
    for (const py of checkLock.python.length > 0 ? [checkLock.python] : PYTHON_CANDIDATES) {
      res = await $.process.run(checkpointProbe(py, checkpoint), { timeoutMs: CHECKPOINT_TIMEOUT_MS }).catch(() => null)
      if (res && res.exitCode === 0) {
        checkLock.python = py
        break
      }
    }
    if (res && res.exitCode === 0) await noteCheckpoint($, card.id, parseCheckpoint(res.stdout))
  }
  await say($, await whoIs($, card.id), opts.note ?? status, status === 'done' ? 'done' : 'error', card.id)
  await refreshStatus($, cfg)
}

export const register: Register = (on, options) => {
  const cfg = parseConfig(options)
  const C = PALETTES[cfg.palette]
  // tool.check carries no loop id; the tool.call around it does, keyed by the call's id.
  const callLoop = new Map<string, string | null>()
  // An `Agent` tool call's brief, by description, for the card its `agent.spawn` makes: the `task:` line lives there.
  const briefs = new Map<string, string>()
  let meshPython: readonly string[] = []
  const feedLock = { inFlight: false }
  let stopFeedTimer: (() => void) | undefined
  const workerLock: { inFlight: boolean; python: readonly string[] } = { inFlight: false, python: [] }
  let stopWorkerTimer: (() => void) | undefined
  const consultLock: ConsultLock = { inFlight: false, python: [], lastJson: '', boundRun: '', isLive: false, ticks: 0, started: false, stopped: false, stopTimer: undefined }
  const jobsLock: JobsLock = {
    inFlight: false,
    python: [],
    ticks: 0,
    isLive: false,
    started: false,
    stopped: false,
    stopTimer: undefined,
    lastJobs: '',
    lastAgy: '',
    dbCache: {},
  }
  const meshLock: MeshLock = { inFlight: false, python: [], last: '' }
  let stopMeshTimer: (() => void) | undefined
  const checkLock: CheckpointLock = { inFlight: false, python: [] }
  let stopCheckTimer: (() => void) | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'flightdeck',
      description: 'Flightdeck, the live agent dashboard: open, close, reset, or set the layout',
      argumentHint: '[open|close|reset|layout auto|compact|wide|mini]',
    })
    await migrate($)
    // A host without usage (headless, an SDK host, a session not yet bound) just starts without it.
    const u = await $.session.usage().catch(() => null)
    // A resumed session has a fill to draw already: its compaction window is read now, not at its first
    // measurement. Any other start forgets the last reading (the setting may have changed) for that one to read.
    const resumedWindow = u && u.context.tokens !== undefined && u.context.window > 0 ? u.context.window : 0
    if (u) {
      await update($, usage, x => ({
        ...normalize(DEFAULT_USAGE, x),
        pct: u.context.percent ?? null,
        tokens: u.context.tokens ?? null,
        window: u.context.window,
        compactFor: resumedWindow,
        compactMisses: 0,
        hasFill: u.context.tokens !== undefined,
        costUsd: u.cost?.usd ?? null,
        limits: u.rateLimits.map(limitOf),
      }))
    }
    if (cfg.openOnStart) void openPane($, cfg).catch(() => undefined)
    await refreshStatus($, cfg)
    // The feed starts before the slow part of the start-up (next(e), the resume seed), so its rows are there as soon as the pane is.
    if (cfg.feedCommand.length > 0) {
      stopFeedTimer?.()
      const stop: unknown = $.clock.every(FEED_INTERVAL_MS, () => {
        void pollFeed($, cfg.feedCommand, feedLock)
      })
      stopFeedTimer = typeof stop === 'function' ? (stop as () => void) : undefined
      void pollFeed($, cfg.feedCommand, feedLock)
    }
    const done = await next(e)
    if (resumedWindow > 0) {
      await readCompactWindow($, resumedWindow)
      await refreshStatus($, cfg)
    }
    await seedResumed($, u)
    await refreshStatus($, cfg)
    stopWorkerTimer?.()
    const stopW: unknown = $.clock.every(WORKER_INTERVAL_MS, () => {
      void pollWorkers($, workerLock)
    })
    stopWorkerTimer = typeof stopW === 'function' ? (stopW as () => void) : undefined
    if (cfg.panels.includes('consult')) {
      consultLock.stopped = false
      consultLock.ticks = 0
      await pollConsult($, cfg.consultDir, consultLock)
      if (!consultLock.started) {
        consultLock.started = true
        const stopC: unknown = $.clock.every(CONSULT_TICK_MS, () => {
          if (consultLock.stopped || consultLock.inFlight) return
          consultLock.ticks += 1
          const target = consultLock.isLive ? CONSULT_LIVE_TICKS : CONSULT_IDLE_TICKS
          if (consultLock.ticks < target) return
          consultLock.ticks = 0
          void pollConsult($, cfg.consultDir, consultLock)
        })
        consultLock.stopTimer = typeof stopC === 'function' ? (stopC as () => void) : undefined
      }
    }
    if (cfg.panels.includes('agents') || cfg.panels.includes('receipt') || cfg.panels.includes('work')) {
      jobsLock.stopped = false
      jobsLock.ticks = 0
      await pollJobs($, cfg.jobsDir, jobsLock)
      if (!jobsLock.started) {
        jobsLock.started = true
        const stopJ: unknown = $.clock.every(JOBS_TICK_MS, () => {
          if (jobsLock.stopped || jobsLock.inFlight) return
          jobsLock.ticks += 1
          const target = jobsLock.isLive ? JOBS_LIVE_TICKS : JOBS_IDLE_TICKS
          if (jobsLock.ticks < target) return
          jobsLock.ticks = 0
          void pollJobs($, cfg.jobsDir, jobsLock)
        })
        jobsLock.stopTimer = typeof stopJ === 'function' ? (stopJ as () => void) : undefined
      }
    }
    // The plan behind the main card's plan rows: read even when only `main` shows it.
    if (cfg.panels.includes('work') || cfg.panels.includes('main')) {
      await pollMesh($, meshLock)
      stopMeshTimer?.()
      const stopM: unknown = $.clock.every(MESH_TICK_MS, () => {
        void pollMesh($, meshLock)
      })
      stopMeshTimer = typeof stopM === 'function' ? (stopM as () => void) : undefined
    }
    if (cfg.panels.includes('work') || cfg.panels.includes('agents')) {
      await pollCheckpoints($, checkLock)
      stopCheckTimer?.()
      const stopP: unknown = $.clock.every(CHECKPOINT_TICK_MS, () => {
        void pollCheckpoints($, checkLock)
      })
      stopCheckTimer = typeof stopP === 'function' ? (stopP as () => void) : undefined
    }
    return done
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await resetAll($)
      await refreshStatus($, cfg)
    } else if (e.reason !== 'resume') {
      stopFeedTimer?.()
      stopFeedTimer = undefined
      consultLock.stopped = true
      consultLock.stopTimer?.()
      consultLock.stopTimer = undefined
      jobsLock.stopped = true
      jobsLock.stopTimer?.()
      jobsLock.stopTimer = undefined
      jobsLock.started = false
      stopMeshTimer?.()
      stopMeshTimer = undefined
      stopCheckTimer?.()
      stopCheckTimer = undefined
    }
    // The process goes on in another conversation, whose first request may find no fill: no compaction.
    if (e.reason === 'clear' || e.reason === 'resume') await update($, usage, x => ({ ...normalize(DEFAULT_USAGE, x), hasFill: false }))
    return next(e)
  })

  on('command.run', { command: 'flightdeck' }, async ($, e) => {
    const [verb = 'open', arg = ''] = e.args.trim().split(/\s+/)
    if (verb === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Flightdeck closed.' }
    }
    if (verb === 'reset') {
      await resetAll($)
      await refreshStatus($, cfg)
      return { text: 'Flightdeck reset.' }
    }
    if (verb === 'layout') {
      const layout: Layout | null = arg === 'compact' || arg === 'wide' || arg === 'auto' || arg === 'mini' ? arg : null
      if (!layout) return { text: 'Usage: /flightdeck layout auto|compact|wide|mini' }
      await update($, view, v => ({ ...normalize(DEFAULT_VIEW, v), layout }))
      const opened = await openPane($, cfg)
      return { text: opened.isPlaced ? `Flightdeck layout: ${layout}.` : `Layout set to ${layout}; the pane is not shown yet: ${opened.reason}` }
    }
    const opened = await openPane($, cfg)
    if (!opened.isPlaced) return { text: `Flightdeck is not shown yet: ${opened.reason}` }
    return { text: 'Flightdeck opened. Focus it with ctrl+x tab; 1-6 expand cards, f/s/o open the gate rows.' }
  })

  // Opened at session.start the pane is unasked, so a terminal under 144 columns (110 once opened by hand)
  // leaves it waiting undrawn. A prompt the person enters counts as asked: seat the waiting pane then, at any
  // width (docked when fullscreen, else inline). A pane the person closed is not listed and stays closed.
  on('prompt.submit', async ($, e, next) => {
    if (cfg.openOnStart) {
      const waiting = (await $.ui.panes().catch(() => [])).some(p => p.id === PANE && !p.isPlaced)
      if (waiting) await openPane($, cfg).catch(() => undefined)
    }
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await noteMode($, e.permission_mode)
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (cfg.architect.test(e.agent) || (cfg.matchDescriptions && cfg.architect.test(e.description))) {
      await update($, roster, r => {
        const x = normalize(DEFAULT_ROSTER, r)
        return x.architectTypes.includes(e.agent) ? x : { architectTypes: [...listOf<string>(x.architectTypes), e.agent].slice(-20) }
      })
    }
    return offered
  })

  on('turn.start', async ($, e, next) => {
    // A subagent's turn (its spawn, or a resume by SendMessage) is its card's, not the main turn's.
    if (e.agentId !== undefined) return next(e)
    const [now, cost] = await Promise.all([$.clock.now(), costNow($)])
    await update($, turn, () => ({ ...DEFAULT_TURN, startedAt: now, costAtStart: cost }))
    await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: true }))
    // A background architect's report reaches the main loop as the text opening this turn. The
    // SubagentHandback tool call (in tool.call) normally carries it first; this is the fallback.
    const back = e.text ? handbackOf(e.text) : null
    const a = back ? await getArchitect($) : null
    if (back && a && a.ids.includes(back.from)) {
      const advice = adviceLine(back.body)
      if (advice && advice !== a.lastAdvice) await noteAdvice($, cfg, advice)
    } else if (e.text) {
      const p = promptLine(e.text)
      await say($, p.who, p.text)
    }
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // The main loop's model is known when its request starts; a long first request shouldn't read "—".
    if (!e.agentId) {
      let isNewModel = false
      await update($, main, m => {
        const x = normalize(DEFAULT_MAIN, m)
        isNewModel = x.model !== '' && x.model !== e.model
        return { ...x, model: e.model, effort: String(e.effort ?? x.effort), steps: x.steps + 1 }
      })
      if (isNewModel) await update($, usage, x => forgetCompactRead(normalize(DEFAULT_USAGE, x)))
      // Under the built-in guard session.compact never runs here. A request that finds the context
      // emptied after a response came back follows a compaction: counted as an estimate (afterFillRead).
      const [u0, live, at] = await Promise.all([getUsage($), $.session.usage().catch(() => null), $.clock.now()])
      let hasFill = u0.hasFill
      if (live) {
        const read = afterFillRead(u0, live.context.tokens !== undefined, at)
        hasFill = read.usage.hasFill
        let isCompaction = false
        if (read.usage !== u0) {
          await update($, usage, x => {
            const r = afterFillRead(normalize(DEFAULT_USAGE, x), live.context.tokens !== undefined, at)
            isCompaction = r.isCompaction
            return r.usage
          })
        }
        if (isCompaction) await say($, 'main', 'context compacted (estimated)')
      }
      // Time the response as it passes: its first piece that is neither the engine's envelope nor the
      // stop. One clock read in the stream and nothing stored until it has ended.
      const sentAt = await $.clock.now()
      let firstAt: number | null = null
      const s = next(e)
      for await (const c of s) {
        if (firstAt === null && c.kind !== 'engine' && c.kind !== 'stop') firstAt = await $.clock.now()
        yield c
      }
      const result = await s.result
      const speed = result.usage ? stepSpeed(sentAt, firstAt) : null
      if (speed) await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), speed }))
      // Marked here, not at the next request: two compactions can come with one response between them.
      if (result.usage && !hasFill) await update($, usage, x => afterResponse(normalize(DEFAULT_USAGE, x)))
      return result
    }
    const id = e.agentId
    // A step from an agent whose card finished means it was resumed (SendMessage): it runs again.
    const before = (await getCards($)).find(c => c.id === id)
    if (before && before.status !== 'running') {
      // Flipped in the write: a resume its agent.spawn already logged is not logged again.
      let isResumed = false
      const at = await $.clock.now()
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => {
            if (c.id !== id || c.status === 'running') return c
            isResumed = true
            return { ...resumeCard(c), lastAt: at }
          }),
      )
      if (isResumed) {
        await say($, await whoIs($, id), 'resumed', 'info', id)
        await refreshStatus($, cfg)
      }
    }
    const result = yield* next(e)
    const [cards, a] = await Promise.all([getCards($), getArchitect($)])
    if (cards.some(c => c.id === id)) {
      const step = { model: e.model, usage: result.usage, stopReason: result.stopReason }
      const at = await $.clock.now()
      await update($, agents, list => listOf<unknown>(list).map(normalizeCard).map(c => (c.id === id ? { ...applyStep(c, step), lastAt: at } : c)))
      if (result.stopReason === 'max_tokens') await say($, await whoIs($, id), 'hit max_tokens', 'error', id)
    } else if (!a.ids.includes(id)) {
      const now = await $.clock.now()
      await update($, loops, l => stepLoop(listOf<Loop>(l), id, now))
    }
    return result
  })

  on('session.measure', async ($, e, next) => {
    // The compaction window is read once per model window, not on every measurement (a breakdown
    // estimates every category each time): claimed here, in the same write, so no two reads overlap.
    let isStale = false
    await update($, usage, x => {
      const claim = claimCompactRead(normalize(DEFAULT_USAGE, x), e.context.window)
      isStale = claim.isClaimed
      // A resumed session's estimate stands until a response gives the real count.
      const keep = e.context.tokens === undefined && claim.usage.isFillEstimate === true
      return {
        ...claim.usage,
        pct: keep ? claim.usage.pct : (e.context.percent ?? null),
        tokens: keep ? claim.usage.tokens : (e.context.tokens ?? null),
        isFillEstimate: keep,
        window: e.context.window,
        costUsd: e.cost?.usd ?? null,
        limits: e.rateLimits.map(limitOf),
      }
    })
    if (e.changed.includes('context')) await refreshStatus($, cfg)
    const done = await next(e)
    if (isStale) {
      await readCompactWindow($, e.context.window)
      await refreshStatus($, cfg)
    }
    return done
  })

  on('session.compact', async ($, e, next) => {
    // Any compaction reaching this hook, a subagent's or a precompute too, means the guard isn't in the way.
    if (!(await getUsage($)).isCompactHooked) await update($, usage, x => afterCompactHooked(normalize(DEFAULT_USAGE, x)))
    const done = await next(e)
    // A skip is a veto, by a plugin or a blocking PreCompact hook: the conversation stays as it was.
    if (!done.skip && !e.agentId && e.trigger !== 'precompute') {
      const now = await $.clock.now()
      await update($, usage, x => {
        const u = normalize(DEFAULT_USAGE, x)
        return { ...u, compactions: u.compactions + 1, lastCompactAt: now }
      })
      await say($, 'main', `context compacted (${e.trigger})`)
    }
    return done
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (e.tool_use_id) {
      const check: Check = {
        id: e.tool_use_id,
        tool: e.tool,
        bucket: bucketOf(e.tool),
        verdict: verdict.decision === 'allow' ? 'rule' : verdict.decision,
        inSubagent: Boolean(callLoop.get(e.tool_use_id)),
        detail: shorten(describeInput(e.tool, e.input), 90),
        at: await $.clock.now(),
      }
      await update($, gate, g => recordCheck(normalizeGate(g), check))
      // The status line updates when the call settles; only a refusal ends here.
      if (verdict.decision === 'deny') {
        await say($, 'gate', `denied by rule · ${check.detail}`, 'error')
        await refreshStatus($, cfg)
      }
    }
    return verdict
  })

  on('tool.call', async ($, e, next) => {
    callLoop.set(e.tool_use_id, e.agentId ?? null)
    // A tool.call carries its input's fields on the event itself; some engines nest them under `input`.
    const ev = e as unknown as Record<string, unknown>
    const input = isObject(ev.input) ? ev.input : ev
    if (e.tool === 'Agent' && typeof input.prompt === 'string') {
      briefs.set(String(input.description ?? ''), input.prompt)
      if (briefs.size > 20) briefs.delete(briefs.keys().next().value as string)
    }
    const runner = e.tool === 'Bash' && typeof input.command === 'string' ? parseRunnerCall(input.command) : null
    if (runner && e.tool_use_id) {
      const at = await $.clock.now()
      const cardTask = e.agentId ? ((await getCards($)).find(c => c.id === e.agentId)?.task ?? '') : ''
      const plan = e.agentId ? { tasks: [] as MeshTask[], python: meshPython } : await readMeshTasks($, meshPython)
      meshPython = plan.python
      if (!e.agentId) await update($, mesh, () => plan.tasks)
      const task = taskAtIssue(e.agentId ?? '', cardTask, plan.tasks)
      await update($, issued, list => issueCall(normalizeIssued(list), { ...runner, callId: e.tool_use_id!, agentId: e.agentId ?? '', at, task }))
      if (!jobsLock.stopped) void pollJobs($, cfg.jobsDir, jobsLock)
    }
    const ran = await next(e).finally(() => callLoop.delete(e.tool_use_id))
    const didRun = ran.deny === undefined
    if (runner && e.tool_use_id) {
      const at = await $.clock.now()
      await update($, issued, list => bindResult(normalizeIssued(list), e.tool_use_id!, didRun ? ran.text : '', at, didRun && ran.isError !== true))
      if (!jobsLock.stopped) void pollJobs($, cfg.jobsDir, jobsLock)
    }
    // Settle this call's pending ask, if it had one; skip the write (and the redraw) otherwise.
    const g0 = await getGate($)
    const isSettled = settleCheck(g0, e.tool_use_id, didRun) !== g0
    if (isSettled) await update($, gate, g => settleCheck(normalizeGate(g), e.tool_use_id, didRun))
    // A background agent hands its report back through this tool; an architect's report is its advice.
    if (String(e.tool) === 'SubagentHandback') {
      const message = (e as unknown as { message?: unknown }).message
      const a = e.agentId ? await getArchitect($) : null
      if (a && e.agentId && a.ids.includes(e.agentId) && typeof message === 'string') {
        const advice = adviceLine(message)
        if (advice && advice !== a.lastAdvice) await noteAdvice($, cfg, advice)
      }
      return ran
    }
    if (e.tool === 'Agent') {
      if (isSettled) await refreshStatus($, cfg)
      return ran
    }
    if (e.tool === 'TaskStop' && didRun && ran.isError !== true) {
      const taskId = typeof input.task_id === 'string' ? input.task_id : ''
      const card = taskId ? cardForTaskStop(await getCards($), taskId) : undefined
      if (card) await finishCard($, cfg, checkLock, card, 'stopped', await $.clock.now())
    }
    const hasFailed = didRun && ran.isError === true
    const isEdit = !hasFailed && didRun && EDIT_TOOLS.has(e.tool)
    const t0 = await getTurn($)
    if (isEdit || hasFailed || (!e.agentId && t0.errorStreak > 0)) {
      await update($, turn, t => afterCall(normalize(DEFAULT_TURN, t), { inSubagent: Boolean(e.agentId), hasFailed, isEdit }))
    }
    const text = shorten(describeInput(e.tool, e), 64)
    if (e.agentId) {
      const id = e.agentId
      const at = await $.clock.now()
      await update($, agents, list =>
        listOf<unknown>(list)
          .map(normalizeCard)
          .map(c => (c.id === id ? { ...noteJob(noteTool(c, { tool: e.tool, text, isError: hasFailed || ran.deny !== undefined }), didRun ? ran.text : ''), lastAt: at } : c)),
      )
    }
    // The log keeps what is worth a glance: refusals, errors and edits; the rest is on the cards.
    if (ran.deny !== undefined) await say($, await whoIs($, e.agentId), `${text}  denied`, 'error', e.agentId ?? null)
    else if (hasFailed) await say($, await whoIs($, e.agentId), `${text}  ✗`, 'error', e.agentId ?? null)
    else if (isEdit) await say($, await whoIs($, e.agentId), text, 'info', e.agentId ?? null)
    if (isSettled || !didRun) await refreshStatus($, cfg)
    return ran
  })

  // A server-side review tool never reaches tool.call: it shows only in the assistant's rows.
  // Only response rows carry them. A managed plugin may pass user plugins over on other doors.
  on('session.append', { door: 'response' }, async ($, e, next) => {
    if (!e.agentId && e.message.type === 'assistant') {
      const a = await getArchitect($)
      // Consults this row opened: their result may be in the same row, after the stale read above.
      const opened = new Set<string>()
      for (const block of e.message.content as unknown as readonly ServerBlock[]) {
        if (block.type === 'server_tool_use' && block.name && block.id && cfg.architect.test(block.name)) {
          if (a.seen.includes(block.id)) continue
          const id = block.id
          await update($, architect, x => {
            const y = normalize(DEFAULT_ARCHITECT, x)
            return { ...y, seen: [...listOf<string>(y.seen), id].slice(-60) }
          })
          opened.add(id)
          await consultStarted($, cfg, id, `${block.name} tool`)
        } else if (block.type.endsWith('_tool_result') && block.tool_use_id) {
          const id = block.tool_use_id
          const isOpen = opened.has(id) || (await getArchitect($)).consults.some(c => c.id === id && c.endAt === null)
          if (isOpen) await consultEnded($, cfg, null, id)
        }
      }
    }
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (!e.parentAgentId) await noteMode($, e.permissionMode)
    if (started.deny !== undefined || !started.agentId) return started
    const id = started.agentId
    if (await isArchitectType($, cfg, e.subagentType)) {
      await update($, architect, a => {
        const x = normalize(DEFAULT_ARCHITECT, a)
        return { ...x, ids: [...listOf<string>(x.ids), id].slice(-40) }
      })
      await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
      await consultStarted($, cfg, id, e.subagentType.split(':').pop() ?? 'agent')
      return started
    }
    const spawnPrompt = typeof (e as unknown as { prompt?: unknown }).prompt === 'string' ? (e as unknown as { prompt: string }).prompt : ''
    const type = e.name ?? e.subagentType
    const brief = spawnPrompt || briefs.get(e.description) || ''
    const cwd = brief || /builder/i.test(type) ? await $.session.cwd().catch(() => '') : ''
    const at = await $.clock.now()
    const card: AgentCard = {
      ...normalizeCard({}),
      id,
      type,
      model: started.model,
      description: e.description,
      spawnedAt: at,
      lastAt: at,
      parentId: e.parentAgentId ?? '',
      task: taskOfBrief(brief),
      checkpoint: checkpointPath(brief, type, cwd),
    }
    // Decided in the write: a resume whose first step already put its card back to running is not logged again.
    let isNew = true
    let isResumed = false
    await update($, agents, list => {
      const cards = listOf<unknown>(list).map(normalizeCard)
      const known = cards.find(c => c.id === id)
      isNew = known === undefined
      isResumed = known !== undefined && known.status !== 'running'
      return addCard(cards, card)
    })
    await update($, loops, l => listOf<Loop>(l).filter(x => x.id !== id))
    if (isNew || isResumed) await say($, shorten(cardTitle(card), 12), isNew ? `spawned · ${card.type}` : 'resumed', 'info', id)
    await refreshStatus($, cfg)
    return started
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    const id = e.agentId
    const now = await $.clock.now()
    if (!id) {
      const [t, cards, cost, probed, issuedNow, cs] = await Promise.all([getTurn($), getCards($), costNow($), getJobs($), getIssued($), getConsult($)])
      const r = receiptOf(t, {
        durationMs: e.durationMs,
        agentsSince: cards.filter(c => c.spawnedAt >= t.startedAt).length,
        jobsSince: turnJobs(probed, issuedNow, t.startedAt, now).length,
        panelsSince: turnConsults(cs?.run ?? null, t.startedAt, now).length,
        costNow: cost,
        reason: e.reason,
      })
      await update($, receipt, () => r)
      await update($, main, m => ({ ...normalize(DEFAULT_MAIN, m), isRunning: false }))
      await refreshStatus($, cfg)
      return done
    }
    if ((await getArchitect($)).ids.includes(id)) {
      await consultEnded($, cfg, e.answer, id)
      return done
    }
    const cards = await getCards($)
    const card = cards.find(c => c.id === id)
    if (card) {
      const status = e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'failed'
      // The brief named no checkpoint, but the final message may: its HANDOFF: / REPORT: line.
      const cwd = !card.checkpoint && e.answer ? await $.session.cwd().catch(() => '') : ''
      const checkpoint = card.checkpoint || checkpointOfAnswer(e.answer, cwd)
      // This run's own length: a resumed agent's card clock also spans the idle time between runs.
      const took = fmtDuration(e.durationMs)
      await finishCard($, cfg, checkLock, card, status, now, { answer: e.answer, checkpoint, note: status === 'done' ? `done · ${took}` : status })
      return done
    }
    await update($, loops, l => listOf<Loop>(l).map(x => (x.id === id ? { ...x, isDone: true, lastAt: now } : x)))
    await refreshStatus($, cfg)
    return done
  })

  // ---------------------------------------------------------------- drawing

  // After a surface module faults on a surface, this load draws it there as plain text; the other
  // module, and other surfaces, keep theirs. Keyed by faultKey: `desktop:rail.tsx`. `ui.fault` came in
  // Claude Code 2.1.289, and an older engine refuses to load a module that hooks it: the floor the README
  // states and CI's oldest leg tests.
  const faulted = new Set<string>()
  on('ui.fault', async ($, e, next) => {
    const key = faultKey(e.surface, e.module)
    if (e.requestId === PANE && !faulted.has(key)) {
      faulted.add(key)
      $.ui.log(`flightdeck: ${e.module} faulted on ${e.surface} (${e.phase}: ${e.reason}); drawing it without animation`)
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Text's `mono` came in Claude Code 2.1.299, after the 2.1.289 Flightdeck supports. An older engine refuses
  // the prop ("Text prop "mono" is not allowed"): a connector drawn with it unmounts the pane, from the first
  // prompt on, when the first connector appears (#28). So the connectors ask for the face only where the
  // engine says it is that new, read once per load.
  let monoRead: Promise<boolean> | null = null

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const hasClient = 'Client' in els
    const hasRail = hasClient && !faulted.has(faultKey(e.surface, 'rail.tsx'))
    const hasRing = hasClient && !faulted.has(faultKey(e.surface, 'ring.tsx'))
    const hasClock = hasClient && !faulted.has(faultKey(e.surface, 'elapsed.tsx'))
    const [m, u, a, cs, g, cards, jobsNow, issuedNow, meshTasks, lp, lines, t, r, v, f, now, mono] = await Promise.all([
      getMain($),
      getUsage($),
      getArchitect($),
      getConsult($),
      getGate($),
      getCards($),
      getJobs($),
      getIssued($),
      getMesh($),
      getLoops($),
      getLog($),
      getTurn($),
      read($, receipt),
      getView($),
      cfg.feedCommand.length > 0 ? getFeed($) : null,
      $.clock.now(),
      (monoRead ??= readMono($)),
    ])
    // What the turn's job runners cost on their own models, beside Claude's own spend: `· jobs +$0.05` / `· jobs free`.
    const jobsLabel = (x: { since?: number }) => {
      const n = typeof x.since === 'number' ? jobsCost(cards, x.since) : null
      return n === null ? '' : ` · jobs ${n === 0 ? 'free' : `+${fmtWorkerCost(n)}`}`
    }
    // The body's own width, down to the narrowest dock Claude Code seats (24): a wider drawing is cut off at the frame.
    const W = Math.max(24, e.props.bodyColumns)
    const layout = v.layout ?? cfg.layout
    const isWide = layout === 'wide' || (layout === 'auto' && W >= 110)
    const colW = isWide ? Math.floor((W - 2) / 2) : W
    const modelName = prettyModel(m.model)
    const viewed = e.props.view?.agentId ?? null
    const advising = isAdvising(a)
    const running = cards.filter(c => c.status === 'running')
    const showArchitect = a.consults.length > 0 || a.ids.length > 0
    const showConsult = isConsultShown(cs, now)
    const motion = cfg.motion && hasRail
    // The body rows the host gives the pane (the same way it gives bodyColumns): the hard height limit.
    const bodyRows = e.props.scroll?.bodyRows ?? e.viewport?.rows ?? 40
    // The whole delegation as one tree, rebuilt on every render from the pane size (rule 6).
    const work = buildWork({ jobs: jobsNow, issued: issuedNow, cards, tasks: meshTasks, run: cs?.run ?? null, now, expanded: v.expanded, turnStartedAt: t.startedAt })
    // A panel with nothing to show yet takes no room: most sessions never spawn an agent.
    const isEmpty: Record<Panel, boolean> = {
      main: false,
      work: isWorkEmpty(work),
      architect: !showArchitect,
      consult: !showConsult,
      gate: g.recent.length === 0 && gateSummary(g).total === 0,
      agents: cards.length === 0,
      loops: lp.length === 0,
      receipt: !m.isRunning && !r,
      log: false,
    }
    const panels = cfg.panels.filter(p => !isEmpty[p])
    const decider = m.mode === 'auto' ? 'classifier' : 'you'

    // A connector between panels: animated while its flow is live, a dim line otherwise.
    const rail = (key: string, active: boolean, color: string, width: number, marks: number[] = [], isMerge = false) =>
      motion ? (
        <els.Client
          key={key}
          module="./rail.tsx"
          width={width}
          height={1}
          props={{ active, width, color, dim: C.faint, marks, isMerge, mono }}
        />
      ) : (
        <Text color={C.faint} {...(mono ? { mono: true } : {})}>
          {'─'.repeat(Math.max(1, width))}
        </Text>
      )

    // A start time of 0 is unknown (state saved before it was recorded): no clock, not decades.
    // `span`: the work tree's compact form (`16m`, `1m12s`) in place of the card clock's `16:00`.
    const clock = (key: string, since: number, endAt: number | null, color: string, span = false) =>
      since <= 0 ? (
        <Text color={color}>—</Text>
      ) : hasClock ? (
        <els.Client key={key} module="./elapsed.tsx" props={{ since, now, endAt, color, span }} />
      ) : (
        <Text color={color}>{(span ? fmtSpan : fmtTimer)((endAt ?? now) - since)}</Text>
      )

    // A work status as its colour: done green, running blue, failed red, waiting faint.
    const toneOfStatus = (s: string) =>
      s === 'done' || s === 'ok'
        ? C.gate
        : s === 'partial' || s === 'stopped'
          ? C.amber
          : s === 'failed' || s === 'refused' || s === 'blocked' || s === 'stale'
            ? C.warn
            : isTodoStatus(s)
              ? C.faint
              : isRunningStatus(s)
                ? C.agent
                : C.faint

    const isTerminal = e.surface === 'terminal'
    // A row of marks (gate checks, loop dots), sized by `marksIn`. Should a surface draw them wider
    // still, the row is cut at its box rather than running past it.
    const markRow = (marks: RenderChildren, lead = 0) => (
      <Box overflow="hidden" {...(lead ? { marginLeft: lead } : {})}>
        <Text wrap="truncate-start">{marks}</Text>
      </Box>
    )
    // A line of coloured pieces, drawn as a row of boxes the way the log draws its lines. A Text nesting
    // coloured Texts truncates as one line in a terminal, but the desktop app wraps each nested piece on its
    // own, lays truncating ones out as blocks of their own, and collapses runs of spaces. So pieces sit `gap`
    // cells apart (a piece's `lead` adds more), each keeps its width, and pieces that don't fit in `room` are
    // left out from the end; or a piece marked `fill` (one span) truncates to what the others leave.
    type Span = { text: string; color?: string; dim?: boolean; bold?: boolean }
    type Piece = { spans: Span[]; lead?: number; fill?: boolean }
    const styleOf = (s: Span) => ({ ...(s.color ? { color: s.color } : {}), ...(s.dim ? { dimColor: true } : {}), ...(s.bold ? { bold: true } : {}) })
    const widthOf = (p: Piece) => p.spans.reduce((n, s) => n + cellWidth(s.text), 0)
    const line = (pieces: (Piece | null)[], room: number, gap = 1, justify?: 'center') => {
      const all = pieces.filter((p): p is Piece => p !== null)
      const shown = all.some(p => p.fill) ? all : all.slice(0, piecesThatFit(all.map(p => ({ width: widthOf(p), lead: p.lead })), room, gap))
      return (
        <Box width={room} columnGap={gap} overflow="hidden" {...(justify ? { justifyContent: justify } : {})}>
          {shown.map(p => {
            const lead = p.lead ? { marginLeft: p.lead } : {}
            if (p.fill && p.spans[0]) {
              return (
                <Text {...styleOf(p.spans[0])} wrap="truncate">
                  {p.spans[0].text}
                </Text>
              )
            }
            return (
              <Box flexShrink={0} {...lead}>
                {p.spans.length === 1 && p.spans[0] ? <Text {...styleOf(p.spans[0])}>{p.spans[0].text}</Text> : <Text>{p.spans.map(s => <Text {...styleOf(s)}>{s.text}</Text>)}</Text>}
              </Box>
            )
          })}
        </Box>
      )
    }

    // ---- main
    const ctxFill = contextFill(u, cfg.ctxBudget)
    const ctxGauge = ctxFill.pct !== null ? gauge(ctxFill.pct, 10) : null
    const showFeed = cfg.feedCommand.length > 0 && f !== null
    const hasFeedA = showFeed && (f.dsCny !== null || f.gem.length > 0)
    const hasFeedB = showFeed && (f.task !== '' || f.cwd !== '')
    // The main card: a fixed label column, then the row's pieces, so gauges line up from row to row.
    const LABEL_W = 5
    const row = (w: number, label: string, pieces: (Piece | null)[], gap = 1) => (
      <Box>
        <Box width={LABEL_W} flexShrink={0}>
          <Text dimColor>{label}</Text>
        </Box>
        {line(pieces, w - 4 - LABEL_W, gap)}
      </Box>
    )
    // One quota window: a 3-cell name, a 5-cell gauge, the percent used, and the time to its reset where it fits.
    const meter = (name: string, pct: number, resetsAt: number | null, w: number, lead: number): Piece => {
      const lg = gauge(pct, 5)
      const resetIn = w >= 58 ? fmtResetIn(resetsAt, now) : ''
      return {
        lead,
        spans: [
          { text: `${name.padEnd(3)} `, dim: true },
          { text: lg.on, color: pct >= 80 ? C.warn : C.main },
          { text: lg.off, color: C.faint },
          { text: ` ${String(Math.round(pct)).padStart(3)}%${resetIn ? ` ↻ ${resetIn.padEnd(5)}` : ''}`, ...(pct >= 80 ? { color: C.warn } : {}) },
        ],
      }
    }
    // A permission mode is kept only when it is not the default, in its short form (`bypass`).
    const shortMode = (mode: string): string => {
      const s = mode.toLowerCase()
      if (s.includes('bypass')) return 'bypass'
      if (s.includes('accept')) return 'accept'
      if (s.includes('plan')) return 'plan'
      if (s.includes('dont') || s.includes("don't")) return 'dont-ask'
      return mode
    }
    const showMode = m.mode !== '' && !/^default$/i.test(m.mode)
    const planSet = subMainTasks(cards)
    const planBudget = Math.max(1, bodyRows - 18)
    const planFit = fitPlan(meshTasks, planBudget)
    const planDone = meshTasks.filter(x => x.status === 'done' || x.status === 'ok').length
    const planGlyph = (status: string) => {
      const g = workGlyph(status)
      return g === '●' ? '✓' : g
    }
    const isDoingTask = (status: string) => status === 'doing' || status === 'running'
    const doingTask = meshTasks.find(x => isDoingTask(x.status))
    const mainPanel = (w: number) => {
      const inner = w - 4
      const frame = (key: string, children: RenderChildren) => (
        <Box key={key} width={w}>
          <Text color={C.main}>│</Text>
          <Box width={1} flexShrink={0} />
          <Box width={inner} overflow="hidden">
            {children}
          </Box>
          <Box width={1} flexShrink={0} />
          <Text color={C.main}>│</Text>
        </Box>
      )
      const rows: RenderChildren[] = []
      rows.push(
        frame(
          'main-ctx',
          row(w, 'ctx', [
            ...(ctxGauge && ctxFill.pct !== null
              ? [
                  {
                    spans: [
                      { text: ctxGauge.on, color: ctxFill.pct >= 80 ? C.warn : C.main },
                      { text: ctxGauge.off, color: C.faint },
                      { text: ` ${String(Math.round(ctxFill.pct)).padStart(3)}%`, bold: true },
                    ],
                  },
                  ...(u.tokens !== null
                    ? [{ lead: 1, spans: [{ text: `${u.isFillEstimate ? '~' : ''}${kTokens(u.tokens)}/${kTokens(ctxFill.window)}`, dim: true }] }]
                    : []),
                  ...(u.compactions > 0 ? [{ spans: [{ text: compactMark(u), color: C.amber }], lead: 1 }] : []),
                  ...(u.compactions > 0 && u.isCompactEstimate ? [{ spans: [{ text: '(estimated)', color: C.faint }], lead: 1 }] : []),
                ]
              : u.compactions > 0
                ? [{ spans: [{ text: compactMark(u), color: C.amber }] }]
                : []),
            { lead: 2, spans: [{ text: 'effort ', dim: true }, { text: m.effort || '—', color: C.main, bold: true }] },
            showMode ? { lead: 2, spans: [{ text: shortMode(m.mode), dim: true }] } : null,
          ]),
        ),
      )
      if (u.limits.length > 0 || u.costUsd !== null || (hasFeedA && f && f.dsCny !== null)) {
        rows.push(
          frame(
            'main-windows',
            line(
              [
                ...u.limits.slice(0, 2).map((l, i) => meter(limitLabel(l.kind), l.pct, l.resetsAt ?? null, w, i > 0 ? 2 : 0)),
                u.costUsd !== null
                  ? { lead: 2, spans: [{ text: fmtUsd(u.costUsd), color: C.text, bold: true }] }
                  : hasFeedA && f && f.dsCny !== null
                    ? { lead: 2, spans: [{ text: 'DS ', dim: true }, { text: fmtCny(f.dsCny), color: C.text, bold: true }] }
                    : null,
              ],
              inner,
              2,
            ),
          ),
        )
      }
      if (hasFeedA && f && f.gem.length > 0) {
        // Two meters to a row; the label sits on the first row only.
        for (let r = 0; r < Math.ceil(Math.min(f.gem.length, MAX_GEM) / 2); r++) {
          rows.push(
            frame(
              `main-agy-${r}`,
              row(w, r === 0 ? 'agy' : '', f.gem.slice(r * 2, r * 2 + 2).map((gm, i) => meter(feedLabel(gm.label), gm.pct, null, w, i > 0 ? 2 : 0))),
            ),
          )
        }
      }
      if (meshTasks.length > 0) {
        rows.push(frame('main-plan', row(w, 'plan', [{ spans: [{ text: `${planDone}/${meshTasks.length}`, bold: true }] }])))
        planFit.rows.forEach(task => {
          const isDoing = isDoingTask(task.status)
          rows.push(
            frame(
              `main-plan-${task.id}`,
              <Box width={inner} columnGap={1} overflow="hidden">
                <Text color={toneOfStatus(task.status)}>{planGlyph(task.status)}</Text>
                <Box flexShrink={1}>
                  <Text wrap="truncate">{`${task.id}${task.subject ? ` ${task.subject}` : ''}`}</Text>
                </Box>
                <Box flexGrow={1} />
                {isDoing ? <Box flexShrink={0}>{clock(`plan-${task.id}`, t.startedAt, null, C.dim, true)}</Box> : null}
                {planSet.has(task.id) ? (
                  <Box flexShrink={0}>
                    <Text color={C.dim}>→ sub-main</Text>
                  </Box>
                ) : null}
              </Box>,
            ),
          )
        })
        if (planFit.more > 0) {
          rows.push(frame('main-plan-more', <Text color={C.faint} wrap="truncate">{`+${planFit.more} ${planFit.isDone ? 'done' : 'more'}`}</Text>))
        }
      } else if (hasFeedB && f && f.task) {
        rows.push(frame('main-task', row(w, 'task', [{ fill: true, spans: [{ text: f.task, color: C.text }] }])))
      }
      return (
        <Box flexDirection="column" width={w}>
          <Text color={C.main} wrap="truncate">{`╭ main ${'─'.repeat(Math.max(0, w - 8))}╮`}</Text>
          {rows}
          <Text color={C.main} wrap="truncate">{`╰${'─'.repeat(Math.max(0, w - 2))}╯`}</Text>
        </Box>
      )
    }

    // ---- architect
    const lastConsult = a.consults[a.consults.length - 1]
    const architectPanel = (w: number) => {
      // Both ends are anchors (the first consult, now): should it run past its box, it asks to lose the middle.
      const tl = consultTimeline(a, now, Math.max(8, w - 4))
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.arch} paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.arch} bold wrap="truncate">
              {cfg.architectLabel} · {advising ? 'advising' : 'on call'}
            </Text>
            <Box flexShrink={0}>
              <Text>
                <Text dimColor>consults </Text>
                <Text color={C.arch} bold>
                  {a.consults.length}
                </Text>
              </Text>
            </Box>
          </Box>
          <Text color={C.arch} wrap="truncate-middle">
            {tl}
          </Text>
          {lastConsult ? (
            <Text dimColor wrap="truncate">
              {advising
                ? `consulting since ${fmtClock(lastConsult.at)}`
                : `last ${fmtDuration(now - (lastConsult.endAt ?? lastConsult.at))} ago · took ${fmtDuration((lastConsult.endAt ?? now) - lastConsult.at)}`}
            </Text>
          ) : (
            <Text dimColor>not consulted yet</Text>
          )}
          {cfg.moments ? (
            <Box flexWrap="wrap" columnGap={2}>
              {(['before a plan', 'error repeats', 'before done'] as const).map(mo => {
                const isOn = lastConsult?.moment === mo
                return (
                  <Text color={isOn ? C.arch : C.dim} bold={isOn}>
                    {isOn ? '◆' : '◇'} {mo}
                  </Text>
                )
              })}
              <Text color={C.faint}>(inferred)</Text>
            </Box>
          ) : null}
          {a.lastAdvice ? (
            <Text color={C.arch} wrap="truncate">
              » {a.lastAdvice}
            </Text>
          ) : null}
        </Box>
      )
    }

    // ---- gate
    const s = gateSummary(g)
    const verdictColor = (c: Check) =>
      c.verdict === 'rule' ? C.gate : c.verdict === 'cleared' ? C.cleared : c.verdict === 'ask' ? C.amber : C.warn
    const checkMark = (c: Check) => (
      <Text color={verdictColor(c)} dimColor={c.inSubagent}>
        {c.verdict === 'deny' ? '✗' : '■'}
      </Text>
    )
    const gatePanel = (w: number) => {
      const strip = g.recent.slice(-Math.max(8, marksIn(w - 4, isTerminal)))
      const open = v.gateOpen
      // The totals in words where they all fit, in numbers alone where they don't: the colours say which is which.
      const totalsOf = (isShort: boolean): Piece[] => [
        { spans: [{ text: '■', color: C.gate }, { text: isShort ? ` ${s.rule}` : ` ${s.rule} allowed`, dim: true }] },
        { spans: [{ text: '■', color: C.cleared }, { text: isShort ? ` ${s.cleared}` : ` ${s.cleared} ${decider}`, dim: true }] },
        ...(s.ask > 0 ? [{ spans: [{ text: isShort ? `■ ${s.ask}` : `■ ${s.ask} pending`, color: C.amber }] }] : []),
        { spans: [{ text: isShort ? `✗ ${s.deny}` : `✗ ${s.deny} denied`, color: s.deny > 0 ? C.warn : C.dim }] },
      ]
      const words = totalsOf(false)
      const isShort = piecesThatFit(words.map(p => ({ width: widthOf(p) })), w - 4, 2) < words.length
      const totals = isShort ? totalsOf(true) : words
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.gate} paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={C.gate} bold wrap="truncate">
              {cfg.gateLabel} · permissions
            </Text>
            <Box flexShrink={0}>
              <Text dimColor>{`${s.total} checks`}</Text>
            </Box>
          </Box>
          {strip.length === 0 ? <Text color={C.faint}>no checks yet</Text> : markRow(strip.map(checkMark))}
          {line([...totals, !isShort && w >= 80 && g.recent.some(c => c.inSubagent) ? { spans: [{ text: 'dim: in subagents', color: C.faint }] } : null], w - 4, 2)}
          {/* Below about 44 columns the three rows' buttons take two lines rather than run past the box. */}
          <Box columnGap={2} flexWrap="wrap">
            {(['file', 'shell', 'other'] as const).map((b: Bucket) => {
              const tl = g.totals[b]
              const n = tl.rule + tl.ask + tl.cleared + tl.deny
              return (
                <Button
                  key={`gate-${b}`}
                  plain
                  hotkey={b[0]}
                  label={`${b} ${n}${open === b ? ' ▾' : ''}`}
                  dimColor={n === 0}
                  onPress={() => update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), gateOpen: normalize(DEFAULT_VIEW, x).gateOpen === b ? null : b }))}
                />
              )
            })}
          </Box>
          {open
            ? g.recent
                .filter(c => c.bucket === open)
                .slice(-5)
                .map(c => (
                  // The verdict sits in a box of its own width, not padded with spaces, which a graphical surface collapses.
                  <Box width={w - 4} columnGap={1} overflow="hidden">
                    <Box width={12} flexShrink={0}>
                      <Text>
                        <Text color={verdictColor(c)}>{c.verdict === 'deny' ? '✗ ' : '■ '}</Text>
                        <Text color={C.dim}>{c.verdict === 'rule' ? 'allowed' : c.verdict === 'cleared' ? decider : c.verdict === 'ask' ? 'pending' : 'denied'}</Text>
                      </Text>
                    </Box>
                    <Text dimColor={c.inSubagent} wrap="truncate">
                      {shorten(c.detail, Math.max(10, w - 18))}
                    </Text>
                  </Box>
                ))
            : null}
        </Box>
      )
    }

    // ---- agents: cards up to the limit, swimlanes beyond it
    const statusColor = (c: AgentCard) => (c.status === 'failed' ? C.warn : c.status === 'done' ? C.gate : C.agent)
    const glyph = (c: AgentCard) => (c.status === 'running' ? '◐' : c.status === 'done' ? '✓' : c.status === 'failed' ? '✗' : '■')
    const expandOnPress = (id: string) => () =>
      update($, view, x => ({ ...normalize(DEFAULT_VIEW, x), expanded: normalize(DEFAULT_VIEW, x).expanded === id ? null : id }))

    const agentsPanel = (w: number) => {
      // Cards need 20 columns each; when the pane can't hold the limit, lanes take over.
      const fit = Math.max(1, Math.min(cfg.maxCards, Math.floor((w + 1) / 21)))
      const useLanes = cards.length > fit
      const isNarrow = w < 40
      const header = (
        <Box justifyContent="space-between" width={w}>
          <Text bold wrap="truncate">
            {isNarrow ? `agents · ${running.length}/${cards.length}` : `agents · ${running.length} running · ${cards.length} total`}
          </Text>
          {cards.length > 0 ? (
            <Box flexShrink={0}>
              <Text color={C.faint}>{`1-${Math.min(cards.length, useLanes ? 6 : fit)}${isNarrow ? '' : ' expand'}`}</Text>
            </Box>
          ) : null}
        </Box>
      )
      if (cards.length === 0) {
        return (
          <Box flexDirection="column" width={w}>
            {header}
            <Text color={C.faint}>no subagents yet</Text>
          </Box>
        )
      }
      if (useLanes) {
        const shown = cards.slice(-6)
        // A lane is its glyph, a label, the bar and a clock: below 34 columns the label narrows, below
        // 36 the bar, so a 24-column pane still holds it. From 40 they are as they always were.
        const labelW = Math.min(17, Math.max(7, w - 17))
        const barW = Math.max(4, w - 11 - labelW)
        const geo = lanes(shown, now, barW)
        return (
          <Box flexDirection="column" width={w}>
            {header}
            {cards.length > shown.length ? <Text color={C.faint}>{`+${cards.length - shown.length} earlier`}</Text> : null}
            {shown.map((c, i) => {
              const gm = geo[i]
              const isViewed = viewed === c.id
              return (
                <Box columnGap={1}>
                  <Text color={statusColor(c)} bold={isViewed}>
                    {isViewed ? '▶' : glyph(c)}
                  </Text>
                  <Box width={labelW} flexShrink={0}>
                    <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={shorten(cardTitle(c), labelW - 3)} onPress={expandOnPress(c.id)} />
                  </Box>
                  <Box flexShrink={0}>
                    <Text>
                      <Text color={C.faint}>{'·'.repeat(gm?.before ?? 0)}</Text>
                      <Text color={statusColor(c)}>{'━'.repeat(gm?.bar ?? 1)}</Text>
                      <Text color={C.faint}>{'·'.repeat(gm?.after ?? 0)}</Text>
                    </Text>
                  </Box>
                  {clock(`lane-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}
                </Box>
              )
            })}
          </Box>
        )
      }
      const shown = cards.slice(-fit)
      const cardW = Math.max(20, Math.floor((w - (shown.length - 1)) / shown.length))
      const centers = shown.map((_, i) => i * (cardW + 1) + Math.floor(cardW / 2))
      return (
        <Box flexDirection="column" width={w}>
          {header}
          {rail('fan-out', running.length > 0, C.agent, w, centers)}
          <Box columnGap={1}>
            {shown.map((c, i) => {
              const isViewed = viewed === c.id
              const sameModel = !c.model || prettyModel(c.model) === modelName
              return (
                <Box
                  flexDirection="column"
                  borderStyle={isViewed ? 'double' : 'round'}
                  borderColor={c.lastStop === 'max_tokens' ? C.warn : C.agent}
                  borderDimColor={c.status !== 'running' && !isViewed}
                  width={cardW}
                  paddingX={1}
                >
                  <Button key={`card-${c.id}`} plain hotkey={String(i + 1)} label={titleLines(cardTitle(c), cardW - 7, cardW - 4)[0]} onPress={expandOnPress(c.id)} />
                  <Text bold wrap="truncate">
                    {titleLines(cardTitle(c), cardW - 7, cardW - 4)[1]}
                  </Text>
                  <Text color={C.dim} wrap="truncate">
                    {c.worker
                      ? `${c.type} ▸ ${shortWorker(c.worker)}${c.workerCost !== null ? ` · ${fmtWorkerCost(c.workerCost)}` : ''}`
                      : sameModel ? c.type : `${c.type} · ${prettyModel(c.model)}`}
                  </Text>
                  <Text dimColor wrap="truncate">
                    {c.steps > 0 ? `ctx ${kTokens(c.ctx)} · out ${kTokens(c.out)} · ${c.steps} st` : 'starting…'}
                  </Text>
                  <Box columnGap={1}>
                    <Text color={c.lastStop === 'max_tokens' ? C.warn : statusColor(c)}>
                      {cardW >= 26 ? `${glyph(c)} ${c.lastStop === 'max_tokens' ? 'max_tokens' : c.status}` : glyph(c)}
                    </Text>
                    <Box flexShrink={0}>{clock(`card-clock-${c.id}`, c.spawnedAt, c.endedAt, C.dim)}</Box>
                  </Box>
                </Box>
              )
            })}
          </Box>
          {rail('merge', running.length > 0, C.agent, w, centers, true)}
        </Box>
      )
    }

    const expandedCard = cards.find(c => c.id === v.expanded)
    const expandedPanel = (w: number) =>
      expandedCard ? (
        <Box flexDirection="column" borderStyle="single" borderColor={C.agent} paddingX={1} width={w}>
          <Text bold wrap="wrap">
            {expandedCard.description || expandedCard.type}
          </Text>
          <Text dimColor wrap="truncate">{`${expandedCard.type} · ${prettyModel(expandedCard.model)}${expandedCard.worker ? ` ▸ ${expandedCard.worker}` : ''} · ${expandedCard.status} · ${expandedCard.steps} steps${expandedCard.task ? ` · ${expandedCard.task}` : ''}`}</Text>
          {/* The subagent's own checkpoint (rule 8), labelled like the main card's rows. */}
          {expandedCard.check?.last ? (
            <Box width={w - 4} columnGap={1} overflow="hidden">
              <Box width={5} flexShrink={0}>
                <Text dimColor>last</Text>
              </Box>
              <Text wrap="truncate">{expandedCard.check.last}</Text>
            </Box>
          ) : null}
          {expandedCard.check?.next ? (
            <Box width={w - 4} columnGap={1} overflow="hidden">
              <Box width={5} flexShrink={0}>
                <Text dimColor>next</Text>
              </Box>
              <Text wrap="truncate">{expandedCard.check.next}</Text>
            </Box>
          ) : null}
          {expandedCard.check && expandedCard.check.open.length > 0
            ? expandedCard.check.open.slice(0, 3).map((item, i) => (
                <Box width={w - 4} columnGap={1} overflow="hidden">
                  <Box width={5} flexShrink={0}>
                    <Text dimColor>{i === 0 ? 'open' : ''}</Text>
                  </Box>
                  <Text wrap="truncate">{`○ ${item}`}</Text>
                  {i === 2 && expandedCard.check!.open.length > 3 ? <Text color={C.faint}>{`+${expandedCard.check!.open.length - 3} more`}</Text> : null}
                </Box>
              ))
            : null}
          {expandedCard.check && expandedCard.status !== 'running' && (expandedCard.check.status || expandedCard.check.tests) ? (
            <Text dimColor wrap="truncate">
              {[expandedCard.check.status ? `status ${expandedCard.check.status}` : '', expandedCard.check.tests ? `tests ${expandedCard.check.tests}` : ''].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {expandedCard.tools.length === 0 ? <Text color={C.faint}>no tool calls yet</Text> : null}
          {expandedCard.tools.map(n => (
            <Text color={n.isError ? C.warn : C.text} wrap="truncate">
              {`${n.isError ? '✗' : '·'} ${n.text}`}
            </Text>
          ))}
          {expandedCard.answer ? (
            <Text dimColor wrap="wrap">
              {`» ${shorten(expandedCard.answer, 240)}`}
            </Text>
          ) : null}
        </Box>
      ) : null

    // ---- work: one live tree of who is doing what (rules 3-6). Every row is recomputed from the
    // pane size on each render: nothing about the layout is cached.
    const workHas = (p: Panel) => panels.includes(p)
    const workRailRows = panels.reduce((n, p, i) => {
      const prev = panels[i - 1]
      if (i === 0 || p === 'agents' || prev === 'agents' || p === 'consult' || prev === 'consult' || p === 'log' || p === 'loops' || prev === 'loops') return n
      return n + 1
    }, 0)
    // The rows every other shown panel needs; the tree gets what is left of the pane's body.
    const otherPanelRows = (): number => {
      let n = 1 // the pane's header
      if (workHas('main')) {
        n += 2 + 1 + 1 // border, ctx/effort, windows/spend
        if (hasFeedA && f) n += Math.ceil(Math.min(f.gem.length, MAX_GEM) / 2)
        if (meshTasks.length > 0) n += 1 + planFit.rows.length + (planFit.more > 0 ? 1 : 0)
        else if (hasFeedB && f && f.task) n += 1
      }
      if (workHas('architect')) n += 2 + 1 + 1 + 1 + (cfg.moments ? (W < 70 ? 2 : 1) : 0) + (a.lastAdvice ? 1 : 0)
      if (workHas('gate')) {
        n += 2 + 1 + 1 + 1 + (W >= 44 ? 1 : 2)
        if (v.gateOpen) n += Math.min(5, g.recent.filter(c => c.bucket === v.gateOpen).length)
      }
      if (workHas('agents')) {
        const fit = Math.max(1, Math.min(cfg.maxCards, Math.floor((W + 1) / 21)))
        n += cards.length === 0 ? 2 : cards.length > fit ? 1 + (cards.length > 6 ? 1 : 0) + Math.min(6, cards.length) : 10
        if (expandedCard) n += 12
      }
      if (workHas('loops')) n += 1
      if (workHas('receipt')) {
        const jobN = r ? turnJobs(jobsNow, issuedNow, r.since, r.since + r.durationMs).length : 0
        const panelN = r ? turnConsults(cs?.run ?? null, r.since, r.since + r.durationMs).length : 0
        n += 2 + (m.isRunning || !r ? 1 : 1 + (W >= 40 ? Math.min(4, jobN) + (jobN > 4 ? 1 : 0) + Math.min(2, panelN) : 0))
        if (t.isReviewing) n += 1
      }
      const run = cs?.run
      if (workHas('consult') && run) {
        const narrow = W < 40 || run.engines.length > 10
        n += 2 + 1 + (narrow ? run.engines.length : (run.engines.length <= 6 ? 11 : 13) + 1 + (run.round >= 2 || run.kind === 'round2' ? 1 : 0))
        if (questionLine(run.question, W - 4)) n += 1
        n += 1 // the glyph legend, dropped when the box has under 3 spare rows
        if (!narrow) n += Math.min(3, run.engines.filter(e => e.state === 'failed' && e.reason).length)
        if (run.endedAt !== null) n += 1
      }
      return n + workRailRows
    }
    const logReserve = workHas('log') ? 8 : 0
    const workBudget = Math.max(0, bodyRows - otherPanelRows() - logReserve)
    const workCols = isWide ? colW : W
    const fittedWork = fitWork(work, workBudget, workCols)
    const drawnWorkRows = workHas('work') && workBudget > 0 ? Math.min(workBudget, workRows(fittedWork, workCols)) : 0

    const workClock = (key: string, since: number, endAt: number | null) => clock(key, since, endAt, C.dim, true)
    const agoText = (endAt: number) => `${Math.max(0, Math.round((now - endAt) / 1000))}s ago`
    // Ended rows fade in place: `done 30s ago`, or `failed 30s ago` in red, until the tree lets them go.
    const workEndView = (endAt: number | null, status: string, stale = false) => {
      if (stale) return <Text color={C.warn}>⊘ stale</Text>
      if (endAt === null) return null
      if (status === 'failed' || status === 'refused') return <Text color={C.warn}>{`failed ${agoText(endAt)}`}</Text>
      if (status === 'partial' || status === 'stopped') return <Text color={C.amber}>{`stopped ${agoText(endAt)}`}</Text>
      return <Text dimColor>{`done ${agoText(endAt)}`}</Text>
    }

    const workLeafView = (l: WorkLeaf, w: number, prefix: string) => {
      const cost = l.cost === null || l.isLive ? '' : l.cost === 0 ? 'free' : `+${fmtWorkerCost(l.cost)}`
      return (
        <Box key={`work-leaf-${l.id}`} width={w} columnGap={1} overflow="hidden">
          {prefix ? <Text color={C.faint}>{prefix}</Text> : null}
          <Button key={`work-${l.id}`} plain onPress={expandOnPress(l.id)}>
            <Text color={toneOfStatus(l.status)}>{l.glyph}</Text>
          </Button>
          <Text dimColor={!l.isLive} wrap="truncate">
            {l.kind === 'consult'
              ? `${l.name}${l.note ? ` ${l.note}` : ''}`
              : `${l.role && !l.name.toLowerCase().startsWith(l.role.toLowerCase()) ? `${l.role} ` : ''}${l.isRealRepo ? '◇' : ''}${l.name}`}
          </Text>
          {l.worker ? <Text dimColor wrap="truncate">{`▸ ${l.worker}`}</Text> : null}
          {l.kind !== 'consult' && l.note ? <Text dimColor wrap="truncate">{l.note}</Text> : null}
          {l.verifyPending ? <Text color={C.amber} wrap="truncate">verify pending</Text> : null}
          {cost ? <Text color={l.cost === 0 ? C.dim : C.text} wrap="truncate">{cost}</Text> : null}
          <Box flexGrow={1} />
          <Box flexShrink={0}>
            {l.isLive ? workClock(`work-clock-${l.id}`, l.startedAt, l.endedAt) : workEndView(l.endedAt, l.status, l.isStale)}
          </Box>
        </Box>
      )
    }

    // `p`: the row's tree glyph from treePrefixes (`├`, `└`, `│`, ' ' or '').
    const workEntryView = (e: WorkEntry, w: number, p = '') => {
      const lead = p ? `${p} ` : ''
      if (e.kind === 'leaf' && e.leaf) return workLeafView(e.leaf, w, p)
      if (e.kind === 'detail' && e.leaf) {
        return workCols >= WORK_DETAIL_COLS && e.leaf.detail ? (
          <Text dimColor wrap="truncate">{`${p ? `${p}   ` : '  '}${e.leaf.detail}`}</Text>
        ) : null
      }
      if (e.kind === 'step') {
        return (
          <Box key={`work-step-${e.text}`} width={w} columnGap={1} overflow="hidden">
            {p ? <Text color={C.faint}>{p}</Text> : null}
            <Text color={C.faint}>○</Text>
            <Text dimColor wrap="truncate">{e.text}</Text>
          </Box>
        )
      }
      if (e.kind === 'task') {
        return (
          <Box key={`work-task-${e.text}`} width={w} columnGap={1} overflow="hidden">
            <Text color={toneOfStatus(e.status ?? '')}>{workGlyph(e.status ?? '')}</Text>
            <Text wrap="truncate">{e.text}</Text>
          </Box>
        )
      }
      if (e.kind === 'last') return <Text color={C.dim} wrap="truncate">{`last ${e.text}`}</Text>
      if (e.kind === 'more') return <Text color={C.faint} wrap="truncate">{`${lead}+${e.count ?? 0} more`}</Text>
      if (e.kind === 'expand') {
        return (
          <Text dimColor={e.tone === 'dim'} wrap="truncate">
            {`${p ? `${p}   ` : '  '}${e.text ?? ''}`}
          </Text>
        )
      }
      if (e.kind === 'closing') return <Text dimColor wrap="truncate">{e.text ?? ''}</Text>
      return null
    }

    const workBoxHeader = (b: WorkBox, w: number) => (
      <Box key={`work-boxheader-${b.id}`} width={w} columnGap={1} overflow="hidden">
        <Text color={toneOfStatus(b.status)}>{b.glyph}</Text>
        <Box flexShrink={1}>
          <Text bold wrap="truncate">{b.title}</Text>
        </Box>
        <Box flexGrow={1} />
        <Box flexShrink={0}>
          {b.isLive ? workClock(`work-box-${b.id}`, b.startedAt, b.endedAt) : workEndView(b.endedAt, b.status, b.status === 'stale')}
        </Box>
      </Box>
    )

    const workPanel = (w: number) => {
      if (workBudget < 1 || isWorkEmpty(fittedWork)) return null
      const inner = Math.max(4, w - 4)
      // Under 40 columns, or with no room for a body: the title, then one line per unit, no frame.
      if (w < WORK_NARROW || workBudget < 3) {
        const lines: RenderChildren[] = [
          <Box key="work-narrow-title" width={w} columnGap={1} overflow="hidden">
            <Text color={toneOfStatus(fittedWork.status)}>{fittedWork.glyph}</Text>
            <Text bold wrap="truncate">{fittedWork.title}</Text>
          </Box>,
          ...fittedWork.entries.map(e => (e.kind === 'box' && e.box ? workBoxHeader(e.box, w) : workEntryView(e, w))),
        ]
        return <Box flexDirection="column" width={w}>{lines.slice(0, Math.max(0, workBudget))}</Box>
      }
      const title = fittedWork.title
      const top = `╭ ${title} ${'─'.repeat(Math.max(0, w - 4 - cellWidth(title)))}╮`
      const bottom = `╰${'─'.repeat(Math.max(0, w - 2))}╯`
      const frame = (key: string, children: RenderChildren) => (
        <Box key={key} width={w}>
          <Text color={C.faint}>│</Text>
          <Box width={1} flexShrink={0} />
          <Box width={inner} overflow="hidden">
            {children}
          </Box>
          <Box width={1} flexShrink={0} />
          <Text color={C.faint}>│</Text>
        </Box>
      )
      const rows: RenderChildren[] = []
      for (const e of fittedWork.entries) {
        if (e.kind === 'box' && e.box) {
          rows.push(frame(`work-head-${e.box.id}`, workBoxHeader(e.box, inner)))
          const pre = treePrefixes(e.box.entries, 0)
          e.box.entries.forEach((c, i) => {
            const v = workEntryView(c, inner, pre[i])
            if (v) rows.push(frame(`work-row-${e.box.id}-${i}`, v))
          })
        } else {
          const v = workEntryView(e, inner)
          if (v) rows.push(frame(`work-row-${rows.length}`, v))
        }
      }
      return (
        <Box flexDirection="column" width={w}>
          <Text color={fittedWork.isLive ? C.main : C.faint} wrap="truncate">
            {top}
          </Text>
          {rows}
          <Text color={fittedWork.isLive ? C.main : C.faint} wrap="truncate">
            {bottom}
          </Text>
        </Box>
      )
    }

    // ---- other loops (workflow agents, forks): ids that match no card
    const loopsPanel = (w: number) => {
      if (lp.length === 0) return null
      const active = lp.filter(l => isLoopActive(l, now)).length
      const dots = lp.slice(-Math.max(4, marksIn(w - 38, isTerminal)))
      const isNarrow = w < 40
      return (
        <Box width={w} columnGap={1}>
          <Text bold>{isNarrow ? 'loops' : 'other loops'}</Text>
          <Text dimColor>{isNarrow ? `${lp.length} · ${active} active` : `${lp.length} seen · ${active} active`}</Text>
          {markRow(
            dots.map(l => (
              <Text color={isLoopActive(l, now) ? C.agent : l.isDone ? C.dim : C.faint}>{isLoopActive(l, now) ? '●' : l.isDone ? '✓' : '○'}</Text>
            )),
            1,
          )}
        </Box>
      )
    }

    // ---- receipt: the turn now, or the last one, with the jobs and consult runs it started
    const receiptPanel = (w: number) => {
      const isReview = t.isReviewing
      const turnJobList = r ? turnJobs(jobsNow, issuedNow, r.since, r.since + r.durationMs) : []
      const turnPanelList = r ? turnConsults(cs?.run ?? null, r.since, r.since + r.durationMs) : []
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={C.main} borderDimColor={!m.isRunning && !isReview} paddingX={1} width={w}>
          {m.isRunning ? (
            <Box width={w - 4} columnGap={1} overflow="hidden">
              <Text color={C.main} wrap="truncate">{'◐ turn'}</Text>
              <Box flexShrink={0}>{clock('turn-clock', t.startedAt, null, C.main)}</Box>
              {w >= 60 ? <Text dimColor wrap="truncate">{`· ${plural(t.edits, 'edit')} · ${plural(t.errors, 'error')}`}</Text> : null}
            </Box>
          ) : r ? (
            <Box flexDirection="column">
              {line(
                [
                  { spans: [{ text: r.reason === 'answer' ? '✓' : '✗', color: r.reason === 'answer' ? C.gate : C.warn }] },
                  { spans: [{ text: receiptSummary(r) }], fill: true },
                  r.costDelta !== null ? { spans: [{ text: `· +${fmtUsd(r.costDelta)}`, color: C.main }] } : null,
                  jobsLabel(r) ? { spans: [{ text: jobsLabel(r), color: C.agent }] } : null,
                ],
                w - 4,
              )}
              {w >= 40 && turnJobList.length > 0 ? (
                <Box flexDirection="column">
                  {turnJobList.slice(0, 4).map(j => {
                    const p = receiptJobParts(j, now)
                    const color = p.isLive ? C.agent : j.status === 'failed' || j.status === 'refused' ? C.warn : C.gate
                    return (
                      <Box key={j.id} width={w - 4} columnGap={2} overflow="hidden">
                        <Text color={color}>{p.glyph}</Text>
                        <Text wrap="truncate">{p.name}</Text>
                        {p.worker ? <Text color={C.dim} wrap="truncate">{`▸ ${p.worker}`}</Text> : null}
                        {p.isLive ? <Box flexShrink={0}>{clock(`receipt-clock-${j.id}`, p.startedAt, null, C.dim, true)}</Box> : <Text dimColor>{p.duration}</Text>}
                        {p.tokens ? <Text dimColor>{p.tokens}</Text> : null}
                        {p.cost ? <Text color={j.cost === 0 ? C.dim : C.agent}>{p.cost}</Text> : null}
                      </Box>
                    )
                  })}
                  {turnJobList.length > 4 ? <Text color={C.faint}>{`+${turnJobList.length - 4} more`}</Text> : null}
                </Box>
              ) : null}
              {w >= 40
                ? turnPanelList.slice(0, 2).map(run => (
                    <Text key={`panel-${run.id}`} dimColor wrap="truncate">
                      {receiptPanelRow(run, now)}
                    </Text>
                  ))
                : null}
            </Box>
          ) : (
            <Text color={C.faint}>no turn finished yet</Text>
          )}
          {isReview ? (
            <Text color={C.arch} wrap="wrap">
              {`${cfg.architectLabel.toLowerCase()} reviewing before done (inferred)`}
            </Text>
          ) : null}
        </Box>
      )
    }

    // ---- consult (external multi-engine consult / debate ring)
    const staticRing = (rows: RingGridRun[][], width: number, height: number) => {
      const face = mono ? { mono: true } : {}
      const nonEmpty: { y: number; groups: { gap: number; items: RingGridRun[] }[] }[] = []
      for (let y = 0; y < height; y += 1) {
        const groups: { gap: number; items: RingGridRun[] }[] = []
        let cursor = 0
        for (const rowRun of rows[y] ?? []) {
          if (rowRun.x >= width || rowRun.x < cursor) continue
          const text = [...rowRun.text].slice(0, width - rowRun.x).join('')
          if (!text) continue
          const gap = rowRun.x - cursor
          const last = groups[groups.length - 1]
          const clipped = { ...rowRun, text }
          if (last && gap === 0) last.items.push(clipped)
          else groups.push({ gap, items: [clipped] })
          cursor = rowRun.x + cellWidth(text)
        }
        if (groups.length > 0) nonEmpty.push({ y, groups })
      }
      return (
        <Box width={width} flexDirection="column" overflow="hidden">
          {nonEmpty.map((rowItem, i) => {
            const prevY = i === 0 ? -1 : nonEmpty[i - 1]!.y
            const topGap = rowItem.y - prevY - 1
            const botGap = i === nonEmpty.length - 1 ? height - 1 - rowItem.y : 0
            return (
              <Box
                width={width}
                overflow="hidden"
                {...(topGap > 0 ? { marginTop: topGap } : {})}
                {...(botGap > 0 ? { marginBottom: botGap } : {})}
              >
                {rowItem.groups.map(grp => (
                  <Box flexShrink={0} {...(grp.gap > 0 ? { marginLeft: grp.gap } : {})}>
                    {grp.items.map(item => (
                      <Text
                        color={item.color}
                        {...(item.bold ? { bold: true } : {})}
                        {...(item.dim ? { dimColor: true } : {})}
                        {...face}
                      >
                        {item.text}
                      </Text>
                    ))}
                  </Box>
                ))}
              </Box>
            )
          })}
        </Box>
      )
    }

    const consultPanel = (w: number) => {
      const run = cs?.run
      if (!run) return null
      const innerW = Math.max(12, w - 4)
      const answered = run.engines.filter(eng => eng.state === 'ok').length
      const total = run.engines.length
      const isNarrow = w < 40 || total > 10
      const grid = isNarrow ? null : buildConsultGrid(run, innerW, C, now)
      // Keep the caption outside the animated Client, as one centred text line.
      const caption = grid?.isDebate ? grid.rows[grid.height - 1]?.[0] : null
      const ringHeight = grid ? grid.height - (caption ? 1 : 0) : 0
      const ringRows = grid?.rows.slice(0, ringHeight) ?? []
      const reasons = run.engines.filter(eng => eng.state === 'failed' && eng.reason).slice(0, 3)
      const summary = run.endedAt !== null ? consultSummaryLine(run, innerW) : ''
      const question = questionLine(run.question, innerW)
      const showLegend = bodyRows - otherPanelRows() >= 3
      return (
        <Box flexDirection="column" borderStyle="round" borderColor={run.stale ? C.amber : C.agent} borderDimColor={run.endedAt !== null} paddingX={1} width={w}>
          <Box justifyContent="space-between">
            <Text color={run.stale ? C.amber : C.agent} bold wrap="truncate">
              {`CONSULT · ${consultKindLabel(run.kind)} · R${run.round}/${run.rounds}`}
            </Text>
            <Box flexShrink={0} columnGap={1}>
              <Text dimColor>{`${answered}/${total}`}</Text>
              <Text dimColor>·</Text>
              {run.stale ? <Text color={C.warn} bold>stopped</Text> : clock('consult-clock', run.startedAt, run.endedAt, C.dim)}
            </Box>
          </Box>
          {isNarrow
            ? run.engines.map(eng => {
                const gChar = consultGlyph(eng.state)
                const gColor = eng.state === 'ok' ? C.gate : eng.state === 'running' ? C.agent : eng.state === 'failed' ? C.warn : eng.state === 'skipped' ? C.amber : C.faint
                const dur = consultEngineDuration(eng, run, now)
                const maxName = innerW < 28 ? Math.min(12, Math.max(5, innerW - 9)) : 12
                const name = shortConsultEngine(eng.name, maxName)
                const reason = eng.state !== 'skipped' && eng.reason ? shorten(eng.reason, Math.max(8, innerW - 4)) : ''
                const fixedW = 1 + 1 + cellWidth(name) + (dur ? 1 + cellWidth(dur) : 0)
                const canFill = Boolean(reason) && innerW - fixedW >= 4
                return line(
                  [
                    { spans: [{ text: gChar, color: gColor }] },
                    { spans: [{ text: name, color: eng.state === 'queued' ? C.faint : C.text }] },
                    dur ? { spans: [{ text: dur, dim: true }] } : null,
                    canFill ? { fill: true, spans: [{ text: reason, color: eng.state === 'failed' ? C.warn : C.dim }] } : null,
                  ],
                  innerW,
                  1,
                )
              })
            : grid
              ? cfg.motion && hasRing
                ? (
                    <els.Client
                      key="consult-ring"
                      module="./ring.tsx"
                      width={innerW}
                      height={ringHeight}
                      props={{
                        active: grid.active,
                        width: innerW,
                        height: ringHeight,
                        mono,
                        rows: ringRows,
                        paths: grid.paths,
                        spinners: grid.spinners,
                      }}
                    />
                  )
                : staticRing(ringRows, innerW, ringHeight)
              : null}
          {caption ? (
            <Box justifyContent="center" width={innerW}>
              <Text color={caption.color} dimColor wrap="truncate">
                {caption.text}
              </Text>
            </Box>
          ) : null}
          {question ? (
            <Text dimColor wrap="truncate">
              {question}
            </Text>
          ) : null}
          {showLegend
            ? line(
                [
                  { spans: [{ text: '●', color: C.gate }, { text: ' done', dim: true }] },
                  { spans: [{ text: '◐', color: C.agent }, { text: ' running', dim: true }] },
                  { spans: [{ text: '○', color: C.faint }, { text: ' queued', dim: true }] },
                  { spans: [{ text: '✗', color: C.warn }, { text: ' failed', dim: true }] },
                  { spans: [{ text: '⊘', color: C.amber }, { text: ' locked', dim: true }] },
                ],
                innerW,
                2,
              )
            : null}
          {!isNarrow
            ? reasons.map(eng => (
                <Text color={C.warn} wrap="truncate">
                  {`✗ ${shortConsultEngine(eng.name)}: ${shorten(eng.reason ?? '', Math.max(8, innerW - 16))}`}
                </Text>
              ))
            : null}
          {summary ? (
            <Text dimColor wrap="truncate">
              {summary}
            </Text>
          ) : null}
        </Box>
      )
    }

    // ---- log: whatever rows the other panels leave, 4 to 8
    // The pane's header, the main card's fixed rows and the gap above the log are rows each; the work
    // tree takes the rows it was given before the log is sized.
    const used =
      1 +
      4 +
      (hasFeedA && f ? Math.ceil(Math.min(f.gem.length, MAX_GEM) / 2) : 0) +
      (meshTasks.length > 0 ? 1 + planFit.rows.length + (planFit.more > 0 ? 1 : 0) : hasFeedB && f && f.task ? 1 : 0) +
      1 +
      (showArchitect ? 6 : 0) +
      (showConsult && cfg.panels.includes('consult') ? 15 : 0) +
      6 +
      (v.gateOpen ? 5 : 0) +
      (cards.length > cfg.maxCards ? 3 + Math.min(6, cards.length) : 8) +
      (expandedCard ? 8 : 0) +
      (lp.length ? 1 : 0) +
      drawnWorkRows +
      3
    const nLog = logRows(bodyRows, used)
    const shownLines = (viewed ? lines.filter(l => l.agentId === viewed) : lines).slice(-nLog)
    const colorOf = (l: LogLine) =>
      l.kind === 'error' ? C.warn : l.kind === 'consult' ? C.arch : l.who === 'main' ? C.main : l.who === 'gate' ? C.gate : l.who === 'you' ? C.text : C.agent
    // Below 40 columns a line keeps its minute, not its second, and a shorter name.
    const logPanel = (w: number) => (
      <Box flexDirection="column" borderStyle="round" borderColor={C.faint} paddingX={1} marginTop={1} width={w}>
        <Text dimColor wrap="truncate">
          {viewed ? 'session log · this agent' : 'session log'}
        </Text>
        {shownLines.length === 0 ? <Text color={C.faint}>nothing yet</Text> : null}
        {shownLines.map(l => (
          <Box>
            <Box width={w < 40 ? 6 : 9} flexShrink={0}>
              <Text color={C.faint}>{w < 40 ? fmtClock(l.at).slice(0, 5) : fmtClock(l.at)}</Text>
            </Box>
            <Box width={w < 40 ? 9 : 13} flexShrink={0}>
              <Text color={colorOf(l)} bold wrap="truncate">
                {l.who}
              </Text>
            </Box>
            <Text color={l.kind === 'error' ? C.warn : C.text} wrap="truncate">
              {l.text}
            </Text>
          </Box>
        ))}
      </Box>
    )

    const draw = (p: Panel, w: number) =>
      p === 'main'
        ? mainPanel(w)
        : p === 'work'
          ? workPanel(w)
          : p === 'architect'
            ? architectPanel(w)
            : p === 'consult'
              ? consultPanel(w)
              : p === 'gate'
                ? gatePanel(w)
                : p === 'agents'
                  ? agentsPanel(w)
                  : p === 'loops'
                    ? loopsPanel(w)
                    : p === 'receipt'
                      ? receiptPanel(w)
                      : logPanel(w)

    // Panels with the flow between them; the agents panel draws its own rails.
    const column = (ps: Panel[], w: number) => (
      <Box flexDirection="column" width={w}>
        {ps.map((p, i) => {
          const prev = ps[i - 1]
          const link =
            i === 0 || p === 'agents' || prev === 'agents' || p === 'consult' || prev === 'consult' || p === 'log' || p === 'loops' || prev === 'loops'
              ? null
              : rail(`link-${p}`, p === 'architect' ? advising : m.isRunning, p === 'architect' ? C.arch : C.main, w)
          return (
            <Box flexDirection="column">
              {link}
              {draw(p, w)}
              {p === 'agents' ? expandedPanel(w) : null}
            </Box>
          )
        })}
      </Box>
    )

    // Desktop draws the agents' time axis as SVG under the panels.
    const svgLanes =
      e.surface !== 'terminal' && cards.length > 0
        ? (() => {
            const { Svg } = $.ui.resolve(e)
            const rowH = 18
            const pxW = 520
            const geo = lanes(cards.slice(-10), now, 100)
            const rects = cards
              .slice(-10)
              .map((c, i) => {
                const gm = geo[i]
                const x = 150 + ((gm?.before ?? 0) / 100) * (pxW - 160)
                const wpx = Math.max(3, ((gm?.bar ?? 1) / 100) * (pxW - 160))
                const fill = c.status === 'running' ? SVG_COLORS.running : c.status === 'done' ? SVG_COLORS.done : c.status === 'failed' ? SVG_COLORS.failed : SVG_COLORS.other
                const label = shorten(cardTitle(c), 22).replace(/[<&>]/g, '')
                return `<text x="4" y="${i * rowH + 13}" font-size="11" fill="${SVG_COLORS.label}">${label}</text><rect x="${x}" y="${i * rowH + 4}" width="${wpx}" height="10" rx="3" fill="${fill}"/>`
              })
              .join('')
            const svgH = Math.min(10, cards.length) * rowH + 4
            // No width or height on the element: it takes the markup's own width up to the pane's and
            // scales down to fit a narrow one, rather than running past it at 520 pixels.
            return (
              <Svg
                source={`<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${svgH}" viewBox="0 0 ${pxW} ${svgH}">${rects}</svg>`}
                alt={`${cards.length} agents on a time axis`}
              />
            )
          })()
        : null

    // Inline above the prompt (the terminal's main screen), the pane is a summary of at most 8 rows.
    const isMini = layout === 'mini' || (layout === 'auto' && e.props.placement === 'inline')
    const miniWorkRow = (item: WorkBox | WorkLeaf, w: number) => {
      const isBox = 'entries' in item
      const label = (
        isBox
          ? item.title
          : item.kind === 'consult'
            ? `${item.name}${item.note ? ` ${item.note}` : ''}`
            : `${item.role && !item.name.toLowerCase().startsWith(item.role.toLowerCase()) ? `${item.role} ` : ''}${item.isRealRepo ? '◇' : ''}${item.name}`
      ).trim()
      return (
        <Box key={`mini-work-${item.id}`} width={w} columnGap={1} overflow="hidden">
          <Text color={toneOfStatus(item.status)}>{item.glyph}</Text>
          <Box flexShrink={1} overflow="hidden">
            <Text bold={isBox} dimColor={!isBox && !item.isLive} wrap="truncate">
              {label}
            </Text>
          </Box>
          {!isBox && item.worker ? (
            <Box flexShrink={1} overflow="hidden">
              <Text dimColor wrap="truncate">
                {`▸ ${item.worker}`}
              </Text>
            </Box>
          ) : null}
          <Box flexGrow={1} />
          <Box flexShrink={0}>
            {item.isLive
              ? workClock(`mini-clock-${item.id}`, item.startedAt, item.endedAt)
              : workEndView(item.endedAt, item.status, isBox ? item.status === 'stale' : item.isStale)}
          </Box>
        </Box>
      )
    }
    if (isMini) {
      const mg = ctxFill.pct !== null ? gauge(ctxFill.pct, 6) : null
      const counts = `${s.rule} allowed · ${s.cleared} ${decider}${s.ask > 0 ? ` · ${s.ask} pending` : ''} · ${s.deny} denied`
      const strip = g.recent.slice(-Math.max(4, marksIn(W - cfg.gateLabel.length - 2 - counts.length, isTerminal)))

      const vitals: Piece[] = []
      if (mg && ctxFill.pct !== null) {
        vitals.push({
          spans: [
            { text: 'ctx ', dim: true },
            { text: mg.on, color: ctxFill.pct >= 80 ? C.warn : C.main },
            { text: mg.off, color: C.faint },
            { text: ` ${Math.round(ctxFill.pct)}%`, ...(ctxFill.pct >= 80 ? { color: C.warn } : {}), bold: true },
            ...(u.compactions > 0 ? [{ text: ` ${compactMark(u)}`, color: C.amber }] : []),
          ],
        })
      } else if (u.compactions > 0) {
        vitals.push({ spans: [{ text: compactMark(u), color: C.amber }] })
      }
      u.limits.slice(0, 2).forEach((l, i) => {
        vitals.push(meter(limitLabel(l.kind), l.pct, l.resetsAt ?? null, W, vitals.length > 0 || i > 0 ? 2 : 0))
      })
      if (u.costUsd !== null) {
        vitals.push({ spans: [{ text: fmtUsd(u.costUsd), color: C.text, bold: true }] })
      } else if (hasFeedA && f && f.dsCny !== null) {
        vitals.push({ spans: [{ text: 'DS ', dim: true }, { text: fmtCny(f.dsCny), color: C.text, bold: true }] })
      }
      if (showMode) {
        vitals.push({ spans: [{ text: shortMode(m.mode), dim: true }] })
      }
      if (cfg.panels.includes('architect') && showArchitect) {
        vitals.push({
          spans: [{ text: `${vitals.length > 0 ? '· ' : ''}${cfg.architectLabel.toLowerCase()} ${advising ? 'advising' : a.consults.length}`, color: C.arch }],
        })
      }

      const planTasks = meshTasks.filter(task => task.id)
      const doingIdx = doingTask ? planTasks.indexOf(doingTask) : -1
      const nextTask =
        (doingIdx >= 0 ? planTasks.slice(doingIdx + 1).find(task => isTodoStatus(task.status)) : undefined) ??
        planTasks.find(task => isTodoStatus(task.status))
      const planHead = `${planDone}/${meshTasks.length}`
      const planStripCap = Math.max(1, marksIn(Math.max(1, W - (5 + planHead.length) - (nextTask ? 3 : 1)), isTerminal))
      const planStripTasks = fitPlan(meshTasks, planStripCap).rows

      const showGate = cfg.panels.includes('gate') && strip.length > 0
      const hasWork = !isWorkEmpty(work)
      const workItems = hasWork ? flattenWork(work) : []
      let showReceipt = !m.isRunning && r !== null
      let showAgy = Boolean(hasFeedA && f && f.gem.length > 0)
      let showPlan = meshTasks.length > 0 || Boolean(hasFeedB && f && f.task)

      // 8-row hard budget: count rows 1-4 (plus optional gate) and receipt first; drop receipt,
      // then agy, then plan when full so the work section always keeps at least 1 row.
      const fixedRows = () =>
        1 +
        (vitals.length > 0 ? 1 : 0) +
        (showAgy ? 1 : 0) +
        (showPlan ? 1 : 0) +
        (showGate ? 1 : 0) +
        (hasWork ? 1 : 0) +
        (showReceipt ? 1 : 0)
      const minWorkBody = hasWork ? (workItems.length > 1 ? 2 : 1) : 0
      while (fixedRows() + minWorkBody > 8) {
        if (showReceipt) {
          showReceipt = false
          continue
        }
        if (showAgy) {
          showAgy = false
          continue
        }
        if (showPlan) {
          showPlan = false
          continue
        }
        break
      }
      const workRoom = hasWork ? Math.min(4, Math.max(1, 8 - fixedRows())) : 0
      const workCut = hasWork && workItems.length > workRoom
      const shownWork = workCut ? workItems.slice(0, Math.max(1, workRoom - 1)) : workItems.slice(0, workRoom)
      const cutCount = workItems.length - shownWork.length

      const costText = r && r.costDelta !== null ? `· +${fmtUsd(r.costDelta)}` : ''
      const jobsText = r ? jobsLabel(r).trimStart() : ''
      const costFits = Boolean(costText) && 11 + cellWidth(costText) <= W
      const jobsFits = Boolean(jobsText) && 10 + (costFits ? 1 + cellWidth(costText) : 0) + 1 + cellWidth(jobsText) <= W

      return (
        <Box flexDirection="column" width={W}>
          <Box width={W} justifyContent="space-between" columnGap={1} overflow="hidden">
            <Box flexShrink={1} columnGap={1} overflow="hidden">
              <Box flexShrink={0}>
                <Text color={C.main} bold>{modelName.toUpperCase()}</Text>
              </Box>
              <Text color={C.dim} bold>·</Text>
              {doingTask ? (
                <Text color={toneOfStatus(doingTask.status)} bold wrap="truncate">
                  {`${planGlyph(doingTask.status)} ${headerTaskText(doingTask)}`}
                </Text>
              ) : (
                <Text bold wrap="truncate">{m.isRunning ? 'working' : 'idle'}</Text>
              )}
            </Box>
            {m.isRunning && t.startedAt > 0 ? (
              <Box flexShrink={0}>{clock('main-clock', t.startedAt, null, C.dim, true)}</Box>
            ) : null}
          </Box>
          {vitals.length > 0 ? line(vitals, W) : null}
          {showAgy && f
            ? line([{ spans: [{ text: 'agy', dim: true }] }, ...f.gem.slice(0, MAX_GEM).map(gm => meter(feedLabel(gm.label), gm.pct, null, W, 2))], W)
            : null}
          {showPlan
            ? meshTasks.length > 0
              ? line(
                  [
                    { spans: [{ text: 'plan ', dim: true }, { text: planHead, bold: true }] },
                    ...(planStripTasks.length > 0
                      ? [{ spans: planStripTasks.map(task => ({ text: planGlyph(task.status), color: toneOfStatus(task.status) })) }]
                      : []),
                    nextTask
                      ? { fill: true, spans: [{ text: `next ${nextTask.id}${nextTask.subject ? ` ${nextTask.subject}` : ''}`, dim: true }] }
                      : null,
                  ],
                  W,
                )
              : f?.task
                ? line([{ spans: [{ text: 'task', dim: true }] }, { fill: true, spans: [{ text: f.task, color: C.text }] }], W)
                : null
            : null}
          {showGate ? (
            <Box columnGap={1}>
              <Text dimColor>{cfg.gateLabel.toLowerCase()}</Text>
              {markRow(strip.map(checkMark))}
              <Text color={s.deny > 0 ? C.warn : s.ask > 0 ? C.amber : C.dim} wrap="truncate">
                {counts}
              </Text>
            </Box>
          ) : null}
          {hasWork ? (
            <Box width={W} columnGap={1} overflow="hidden">
              <Text color={toneOfStatus(fittedWork.status)} bold>{fittedWork.glyph}</Text>
              <Text color={toneOfStatus(fittedWork.status)} bold wrap="truncate">{fittedWork.title}</Text>
            </Box>
          ) : null}
          {shownWork.map(item => miniWorkRow(item, W))}
          {workCut ? <Text color={C.faint} wrap="truncate">{`+${cutCount} more · /flightdeck open for the tree`}</Text> : null}
          {showReceipt && r
            ? line(
                [
                  { spans: [{ text: r.reason === 'answer' ? '✓' : '✗', color: r.reason === 'answer' ? C.gate : C.warn }] },
                  { spans: [{ text: receiptSummary(r) }], fill: true },
                  costFits ? { spans: [{ text: costText, color: C.main }] } : null,
                  jobsFits ? { spans: [{ text: jobsText, color: C.agent }] } : null,
                ],
                W,
              )
            : null}
        </Box>
      )
    }

    const body = isWide ? (
      <Box flexDirection="column">
        <Box columnGap={2}>
          {column(panels.filter(p => p === 'main' || p === 'work' || p === 'architect' || p === 'gate'), colW)}
          {column(panels.filter(p => p === 'agents' || p === 'loops' || p === 'receipt'), colW)}
        </Box>
        {panels.includes('consult') ? consultPanel(W) : null}
        {panels.includes('log') ? logPanel(W) : null}
      </Box>
    ) : (
      column(panels, W)
    )

    return (
      <Box flexDirection="column" width={W}>
        {/* Below 40 columns the frame's own title names the pane, so the header starts at the model.
            One line: the model, then the doing task (or idle/working), with main's clock on the right. */}
        <Box width={W} justifyContent="space-between" columnGap={1} overflow="hidden">
          <Box flexShrink={1} columnGap={1} overflow="hidden">
            <Box flexShrink={0}>
              <Text color={C.main} bold>{`${W >= 40 ? 'FLIGHTDECK · ' : ''}${modelName.toUpperCase()}`}</Text>
            </Box>
            <Text color={C.dim} bold>·</Text>
            {doingTask ? (
              <Text color={toneOfStatus(doingTask.status)} bold wrap="truncate">
                {`${planGlyph(doingTask.status)} ${headerTaskText(doingTask)}`}
              </Text>
            ) : (
              <Text bold wrap="truncate">{m.isRunning ? 'working' : 'idle'}</Text>
            )}
          </Box>
          {m.isRunning && t.startedAt > 0 ? (
            <Box flexShrink={0}>{clock('main-clock', t.startedAt, null, C.dim, true)}</Box>
          ) : null}
        </Box>
        {body}
        {svgLanes}
      </Box>
    )
  }).catch(($, e, next) => {
    // Without this a failed draw leaves the engine's empty pane.
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" width={Math.max(20, e.props.bodyColumns)}>
        <Text bold>FLIGHTDECK</Text>
        <Text color={C.warn} wrap="wrap">{`draw failed (${next.error.kind}): ${next.error.message ?? 'no message'}`}</Text>
      </Box>
    )
  })
}
