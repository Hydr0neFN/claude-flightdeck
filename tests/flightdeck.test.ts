import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Plugin, TestBody } from 'claude-code/testing'

import {
  DEFAULT_ARCHITECT,
  DEFAULT_GATE,
  DEFAULT_TURN,
  DEFAULT_USAGE,
  COMPACT_TRIES,
  addCard,
  cellWidth,
  piecesThatFit,
  afterCompactRead,
  claimCompactRead,
  faultKey,
  forgetCompactRead,
  knowsMono,
  resumeCard,
  afterCall,
  applyStep,
  compactWindowOf,
  consultTimeline,
  contextFill,
  describeInput,
  endConsult,
  fitLegend,
  fmtResetIn,
  fmtSpeed,
  gateSummary,
  lanes,
  limitLabel,
  limitOf,
  logRows,
  marksIn,
  momentOf,
  normalizeCard,
  normalizeGate,
  normalizeLog,
  titleLines,
  parseConfig,
  parseFeed,
  parseFeedCommand,
  prettyModel,
  promptLine,
  handbackOf,
  adviceLine,
  receiptOf,
  recordCheck,
  redact,
  settleCheck,
  trimRecent,
  startConsult,
  stepSpeed,
  noteJob,
  parseJobText,
  parseJobCost,
  CNY_USD,
  fmtWorkerCost,
  jobsCost,
  shortWorker,
  workerProbe,
  CONSULT_HIDE_AFTER_MS,
  PALETTES,
  activeConsultLocks,
  buildConsultGrid,
  consultProbe,
  isConsultLive,
  isConsultShown,
  parseConsult,
  ringLayout,
  shortConsultEngine,
} from '../hooks/core'

test('a context budget smaller than the window is what the gauge measures against', () => {
  const u = { tokens: 150_000, window: 1_000_000, compactWindow: null }
  expect(contextFill(u, 300_000)).toEqual({ window: 300_000, pct: 50 })
  expect(contextFill(u, 0).window).toBe(1_000_000)
  expect(contextFill({ ...u, compactWindow: 200_000 }, 300_000).window).toBe(200_000)
})

test('job lines are read from Read-tool output with line numbers too', () => {
  expect(parseJobText('     5\tbackend: paid-flash\n    12\tjobdir: /j').backend).toBe('paid-flash')
  expect(parseJobText('5→backend: agy:gemini-4-argon-high').backend).toBe('agy:gemini-4-argon-high')
})

test("the probe prefers a finished job's kept backend over its last attempt", () => {
  const argv = workerProbe('python3', '/j')
  expect(argv[0]).toBe('python3')
  expect(argv[3]).toBe('/j')
  // state.json first: its backend wins once the status is no longer running or parked.
  expect(argv[2]!.indexOf('state.json')).toBeLessThan(argv[2]!.indexOf('trying'))
  expect(argv[2]).toContain('("running","parked",None)')
})

test('a job runner backend reads as a short model name', () => {
  expect(shortWorker('agy:gemini-4-hydrogen-high')).toBe('Hydrogen')
  expect(shortWorker('agy:gemini-4-hydrogen-xhigh')).toBe('Hydrogen')
  expect(shortWorker('agy:gemini-4-argon-high')).toBe('Argon')
  expect(shortWorker('gemini-3.5-pro')).toBe('Gemini 3.5')
  expect(shortWorker('agy:claude-sonnet-5-5-high')).toBe('Sonnet 5.5')
  expect(shortWorker('azure:gpt-6.1-sol')).toBe('GPT 6.1')
  expect(shortWorker('paid-flash')).toBe('DS Flash')
  expect(shortWorker('opencode:opencode/qwen3-coder-free')).toBe('qwen3-coder')
  expect(shortWorker('')).toBe('')
})

test("a card learns its worker and job dir from job runner output; the newest wins", () => {
  let c = normalizeCard({ id: 'a', type: 'farmer', model: 'claude-haiku-5-5' })
  c = noteJob(c, 'ds_status: running\nphase: launcher\njobdir: /x/ds-jobs/j1\nnext: poll')
  expect(c.jobdir).toBe('/x/ds-jobs/j1')
  expect(c.worker).toBe('')
  c = noteJob(c, 'ds_status: done\nagy: failed (quota)\nbackend: azure:gpt-6.1-sol\njobdir: /x/ds-jobs/j1')
  expect(c.worker).toBe('azure:gpt-6.1-sol')
  expect(noteJob(c, 'plain output')).toBe(c)
  expect(parseJobText('backend: rm -rf / ; echo').backend).toBe('')
})

test("a job's cost follows its worker: free on a quota, CNY converted, USD as given", () => {
  expect(parseJobCost('ds: turns=1 cost_cny_est=0 (agy subscription quota)')).toBe(0)
  expect(Math.round(parseJobCost('ds: turns=69 cost_cny_est=0.5 (assumed price)')! * 1e6)).toBe(Math.round(0.5 * CNY_USD * 1e6))
  expect(Math.round(parseJobCost('ds: turns=3 cost_cny_est=USD 0.0420 (Azure credit)')! * 1e6)).toBe(Math.round(0.042 * 1e6))
  expect(parseJobCost('ds: turns=? cost_cny_est=?')).toBeNull()
  let c = normalizeCard({ id: 'a', type: 'farmer', spawnedAt: 10 })
  c = noteJob(c, 'backend: paid-flash\nds: cost_cny_est=1.0 (x)\njobdir: /j')
  expect(fmtWorkerCost(c.workerCost)).toBe('$0.14')
  const free = noteJob(normalizeCard({ id: 'b', spawnedAt: 10 }), 'backend: agy:gemini-4-hydrogen-high\nds: cost_cny_est=0 (agy)')
  expect(fmtWorkerCost(free.workerCost)).toBe('free')
  expect(Math.round(jobsCost([c, free], 5)! * 100)).toBe(14)
  expect(jobsCost([c, free], 20)).toBeNull()
  expect(jobsCost([free], 5)).toBe(0)
})
import type { Check } from '../types'

// ---------------------------------------------------------------- pure behaviour

test('redaction masks credentials before anything is stored', () => {
  expect(redact('curl -H "Authorization: Bearer abc.def.ghi123" x')).not.toContain('abc.def')
  expect(redact('export OPENAI_API_KEY=sk-proj-1234567890abcdef')).not.toContain('1234567890')
  expect(redact('gh auth --token ghp_abcdefghijklmnop')).not.toContain('abcdefghijklmnop')
  expect(redact('psql postgres://bob:hunter2@db/x')).not.toContain('hunter2')
  expect(redact('password=hunter2 ls')).not.toContain('hunter2')
  expect(redact('ls -la src/')).toBe('ls -la src/')
  expect(describeInput('Read', { file_path: 'C:\\Users\\me\\proj\\src\\main.ts' })).toBe('Read → src/main.ts')
})

const check = (id: string, verdict: Check['verdict'], bucket: Check['bucket'] = 'shell'): Check => ({
  id,
  tool: 'Bash',
  bucket,
  verdict,
  inSubagent: false,
  detail: 'Bash → ls',
  at: 1,
})

test('an ask is settled by the call that follows: cleared if it ran, deny if refused', () => {
  let g = recordCheck(DEFAULT_GATE, check('a', 'ask'))
  g = recordCheck(g, check('b', 'ask'))
  g = recordCheck(g, check('c', 'rule', 'file'))
  g = settleCheck(g, 'a', true)
  g = settleCheck(g, 'b', false)
  g = settleCheck(g, 'zzz', true) // not an ask: unchanged
  const s = gateSummary(g)
  expect([s.rule, s.ask, s.cleared, s.deny, s.total]).toEqual([1, 0, 1, 1, 3])
  expect(g.recent.map(c => c.verdict)).toEqual(['cleared', 'deny', 'rule'])
})

test('the gate tallies a mixed run of verdicts per family', () => {
  let g = DEFAULT_GATE
  g = recordCheck(g, check('r1', 'rule', 'file'))
  g = recordCheck(g, check('a1', 'ask', 'shell'))
  g = recordCheck(g, check('a2', 'ask', 'shell'))
  g = recordCheck(g, check('d1', 'deny', 'other'))
  g = settleCheck(g, 'a1', true)
  g = settleCheck(g, 'a2', false)
  expect(g.totals.file).toEqual({ rule: 1, ask: 0, cleared: 0, deny: 0 })
  expect(g.totals.shell).toEqual({ rule: 0, ask: 0, cleared: 1, deny: 1 })
  expect(g.totals.other.deny).toBe(1)
  expect(gateSummary(g)).toEqual({ rule: 1, ask: 0, cleared: 1, deny: 2, total: 4 })
  expect(gateSummary(DEFAULT_GATE).total).toBe(0)
})

test('a v1-shaped gate reads as empty, then records normally', () => {
  const g = normalizeGate({ file: { allow: 3, ask: 1, deny: 0, cleared: 2 }, shell: null })
  expect(gateSummary(g).total).toBe(0)
  const next = recordCheck(g, check('n1', 'rule', 'file'))
  expect(next.totals.file.rule).toBe(1)
  expect(next.recent.length).toBe(1)
})

test('a pending ask is never trimmed out before it settles', () => {
  let g = recordCheck(DEFAULT_GATE, check('old-ask', 'ask'))
  for (let i = 0; i < 120; i += 1) g = recordCheck(g, check(`r${i}`, 'rule', 'file'))
  expect(g.recent.length).toBe(80)
  expect(g.recent.some(c => c.id === 'old-ask')).toBe(true)
  g = settleCheck(g, 'old-ask', true)
  expect(gateSummary(g).ask).toBe(0)
  expect(trimRecent([check('a', 'rule'), check('b', 'rule')], 5).length).toBe(2)
})

test('edits count from every loop; errors only from the main loop', () => {
  const t = { ...DEFAULT_TURN, errorStreak: 1 }
  expect(afterCall(t, { inSubagent: true, hasFailed: false, isEdit: true }).edits).toBe(1)
  expect(afterCall(t, { inSubagent: true, hasFailed: true, isEdit: false }).errorStreak).toBe(1)
  expect(afterCall(t, { inSubagent: false, hasFailed: true, isEdit: false })).toEqual({ ...t, errorStreak: 2, errors: 1 })
  expect(momentOf(afterCall(DEFAULT_TURN, { inSubagent: true, hasFailed: false, isEdit: true }))).toBe('before done')
  expect(momentOf({ edits: 0, errorStreak: 2 })).toBe('error repeats')
})

test("a card's context is its latest step's whole input; output adds up", () => {
  let c = normalizeCard({ id: 'x' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, output_tokens: 500 }, stopReason: 'tool_use' })
  c = applyStep(c, { model: 'claude-sonnet-5-5', usage: { input_tokens: 5, cache_read_input_tokens: 40_000, output_tokens: 700 }, stopReason: 'max_tokens' })
  expect([c.ctx, c.out, c.steps, c.lastStop, c.model]).toEqual([40_005, 1200, 2, 'max_tokens', 'claude-sonnet-5-5'])
})

test('a resumed agent runs again on its own card instead of adding a second', () => {
  const a = { ...normalizeCard({ id: 'a', description: 'first', spawnedAt: 5, model: 'claude-sonnet-5-5' }), status: 'done' as const, endedAt: 100, steps: 4, out: 900 }
  const b = normalizeCard({ id: 'b' })
  const cards = addCard(addCard(addCard([], a), b), { ...normalizeCard({ id: 'a', description: 'again', spawnedAt: 200 }) })
  expect(cards.map(c => `${c.id}:${c.description}`)).toEqual(['a:again', 'b:'])
  expect(cards[0] && [cards[0].status, cards[0].endedAt, cards[0].steps, cards[0].out, cards[0].spawnedAt]).toEqual(['running', null, 4, 900, 5])
  expect([resumeCard(a).status, resumeCard(a).endedAt]).toEqual(['running', null])
  // Spawned again on another model, the card names it; a spawn that names none keeps the card's.
  expect(addCard([a], normalizeCard({ id: 'a', model: 'claude-opus-5-5' }))[0]?.model).toBe('claude-opus-5-5')
  expect(addCard([a], normalizeCard({ id: 'a' }))[0]?.model).toBe('claude-sonnet-5-5')
})

test('consults open, close by id, and draw on a shared timeline', () => {
  let a = startConsult(DEFAULT_ARCHITECT, { id: 's1', at: 0, moment: 'before a plan', via: 'advisor tool' })
  a = startConsult(a, { id: 's1', at: 5, moment: 'before a plan', via: 'again' }) // same id: ignored
  a = endConsult(a, 10, null, 's1')
  a = startConsult(a, { id: 's2', at: 90, moment: 'before done', via: 'advisor tool' })
  expect(a.consults.length).toBe(2)
  expect(a.consults[0]?.endAt).toBe(10)
  const tl = consultTimeline(a, 100, 11)
  expect(tl.length).toBe(11)
  expect(tl.startsWith('◆━')).toBe(true)
  expect(tl.split('◆').length - 1).toBe(2)
})

test('config is read leniently: bad values fall back to defaults', () => {
  const d = parseConfig({})
  expect([d.maxCards, d.paneColumns, d.layout, d.motion, d.moments, d.panels.length]).toEqual([3, 66, 'auto', true, true, 8])
  expect(d.panels[2]).toBe('consult')
  expect(d.architect.test('fable-advisor:fable-advisor')).toBe(true)
  const c = parseConfig({ architectPattern: '([', maxCards: 99, layout: 'diagonal', panels: 'log, gate ,nope,gate', motion: 'off' })
  expect(c.architect.test('advisor')).toBe(true) // invalid regex → default
  expect([c.maxCards, c.layout, c.motion]).toEqual([6, 'auto', false])
  expect([46.4, 12, Number.NaN, '90'].map(n => parseConfig({ paneColumns: n }).paneColumns)).toEqual([46, 40, 66, 66])
  expect(c.panels).toEqual(['log', 'gate'])
})

test('state saved under an older shape still reads', () => {
  expect(normalizeLog([{ at: '08:00:00', who: 'jev', text: 'x' }])[0]).toEqual({ at: 0, who: 'jev', text: 'x', agentId: null, kind: 'info' })
  const g = normalizeGate({ file: { allow: 1 } }) // v1 gate shape
  expect(g.recent).toEqual([])
  expect(g.totals.shell.rule).toBe(0)
  expect(normalizeCard({ id: 'a', status: 'done' }).tools).toEqual([])
})

test('layout math: lanes share one axis, the log gets 4-8 rows, the legend never wraps', () => {
  const cards = [
    { ...normalizeCard({}), id: 'a', spawnedAt: 1000, endedAt: 1050 },
    { ...normalizeCard({}), id: 'b', spawnedAt: 1050, endedAt: null },
  ]
  const [a, b] = lanes(cards, 1100, 20)
  expect(a).toEqual({ id: 'a', before: 0, bar: 10, after: 10 })
  expect(b?.before).toBe(10)
  expect((b?.before ?? 0) + (b?.bar ?? 0) + (b?.after ?? 0)).toBe(20)
  expect([logRows(10, 40), logRows(50, 40), logRows(200, 40)]).toEqual([4, 7, 8])
  expect(fitLegend([{ label: 'main' }, { label: 'agents' }, { label: 'architect' }], 20).map(x => x.label)).toEqual(['main', 'agents'])
  expect([marksIn(64, true), marksIn(64, false), marksIn(6, false)]).toEqual([64, 42, 4])
  expect(limitLabel('five_hour')).toBe('5h')
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 1M')
  expect(prettyModel('us.anthropic.claude-sonnet-4-5-20250929-v1:0')).toBe('Sonnet 4.5')
  expect(prettyModel('claude-3-5-haiku-20241022')).toBe('Haiku 3.5')
  expect(prettyModel('claude-opus-4-20250514')).toBe('Opus 4')
  expect(prettyModel('claude-3-opus-20240229')).toBe('Opus 3')
  expect(prettyModel('z-ai/glm-5.3-flash-with-a-long-name')).toBe('z-ai/glm-5.3-flash-wi…')
  expect(prettyModel('')).toBe('—')
  expect(promptLine('fix the parser')).toEqual({ who: 'you', text: 'fix the parser' })
  const hb = '<agent-message from="a1940a83d593229d5">\n[Subagent hand-back] The text below is the final report. The report follows:\n  Add gate tests: redaction edge cases.\n  - more\n</agent-message>'
  expect(handbackOf(hb)).toEqual({ from: 'a1940a83d593229d5', body: 'Add gate tests: redaction edge cases.' })
  expect(handbackOf('<agent-message from="x">\nPlain report line\n</agent-message>')).toEqual({ from: 'x', body: 'Plain report line' })
  expect(handbackOf('fix the parser')).toBe(null)
  expect(adviceLine('## Ship it after one more gate test.\n- details')).toBe('Ship it after one more gate test.')
  expect(adviceLine('[Subagent hand-back] header\n\n**Fix card overflow first**')).toBe('Fix card overflow first')
  expect(adviceLine('')).toBe('')
  expect(promptLine('<agent-message from="a1492260715f3be7b"> [Subagent hand-back]')).toEqual({ who: 'engine', text: 'agent message from a1492260' })
  expect(receiptOf({ ...DEFAULT_TURN, costAtStart: 5 }, { durationMs: 1, agentsSince: 0, costNow: 5, reason: 'answer' }).costDelta).toBe(null)
  expect(titleLines('Write tinyqueue test suite', 13, 16)).toEqual(['Write', 'tinyqueue test…'])
  expect(titleLines('Short', 13, 16)).toEqual(['Short', ''])
  expect(receiptOf({ ...DEFAULT_TURN, costAtStart: 1, edits: 2 }, { durationMs: 1000, agentsSince: 3, costNow: 1.5, reason: 'answer' }).costDelta).toBe(0.5)
})

test('a request\'s speed is its time to the first piece of response, and no output rate', () => {
  expect(stepSpeed(1000, 1800)).toEqual({ ttftMs: 800 })
  expect(stepSpeed(1000, null)).toBe(null) // no response arrived
  expect(fmtSpeed({ ttftMs: 1250 })).toBe('ttft 1.3s')
  // State saved by 0.5.0 still carries a rate: it is not drawn.
  expect(fmtSpeed({ ttftMs: 800, tokPerS: 9844 } as { ttftMs: number })).toBe('ttft 0.8s')
})

test('a window keeps its reset time, drawn as the time left', () => {
  expect(limitOf({ kind: 'five_hour', percentUsed: 19, resetsAt: '1970-01-01T03:10:00.000Z' })).toEqual({ kind: 'five_hour', pct: 19, resetsAt: 11_400_000 })
  expect(limitOf({ kind: 'seven_day', percentUsed: 3 }).resetsAt).toBe(null)
  expect(limitOf({ kind: 'spend_limit', percentUsed: 1, resetsAt: 'soon' }).resetsAt).toBe(null)
  expect([fmtResetIn(11_400_000, 0), fmtResetIn(25 * 60_000 + 5_000, 0), fmtResetIn(4 * 86_400_000 + 2 * 3_600_000, 0)]).toEqual(['3h10m', '25m', '4d2h'])
  expect([fmtResetIn(null, 0), fmtResetIn(undefined, 0), fmtResetIn(5, 10)]).toEqual(['', '', ''])
})

// ---------------------------------------------------------------- drawing

const engine = (on: On) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return clock
}

const pane = (bodyColumns: number) => ({
  plugin: 'flightdeck',
  component: 'Pane' as const,
  requestId: 'flightdeck',
  props: {
    title: 'Flightdeck',
    isFocused: true,
    bodyColumns,
    placement: 'dock' as const,
    scroll: { offset: 0, bodyRows: 70 },
    view: {},
  },
})

let spawnN = 0
const spawn = (subagentType: string, description: string) => ({
  prompt: description,
  description,
  subagentType,
  tool_use_id: `tu${++spawnN}`,
  provider: { plugin: 'engine', tier: 'core' as const },
  parentModel: 'claude-opus-5-5',
  background: true,
  fork: false,
})

test('a fresh session draws on every surface and width, empty panels hidden', async ($, on) => {
  engine(on)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (const cols of [40, 60, 86, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      expect(await ui.find({ text: /· main$/ })).toBeDefined()
      expect(await ui.find({ text: /session log/ })).toBeDefined()
      expect(await ui.find({ text: /agents ·/ })).toBeUndefined() // no subagents: no agents panel
      expect(await ui.find({ text: /permissions/ })).toBeUndefined() // no checks yet: no gate panel
      await ui.unmount()
    }
  }
})

test('inline above the prompt, the pane is a summary of at most 8 rows', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `m${++n}` }))
  on('tool.check', () => ({ decision: 'allow' }))
  await $.turn.start({ text: 'go', turnId: 'M1' })
  for (const d of ['one', 'two', 'three', 'four', 'five']) await $.agent.spawn(spawn('general-purpose', `task ${d}`))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'm-k1' })
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement: 'inline' as const }, surface })
    const root = (await ui.drawn()) as { children?: unknown[] }
    expect((root.children ?? []).filter(Boolean).length <= 8).toBe(true)
    expect(await ui.find({ text: /\+2 more agents/ })).toBeDefined()
    expect(await ui.find({ text: /1 allowed/ })).toBeDefined()
    expect(await ui.find({ text: /session log/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('/clear starts the pane fresh', async ($, on) => {
  engine(on)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'c1' }))
  await $.turn.start({ text: 'go', turnId: 'C1' })
  await $.agent.spawn(spawn('Explore', 'look around'))
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /look around/ })).toBeUndefined()
  await ui.unmount()
})

test('colours come from the theme by default, raw hex only when asked', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  const title = await ui.find({ text: /· main$/ })
  expect(title?.props.color).toBe('claude')
  await ui.unmount()
})

test('pastel keeps the fixed dark-terminal colours', { options: { palette: 'pastel' } }, async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect((await ui.find({ text: /· main$/ }))?.props.color).toBe('#7dd3fc')
  await ui.unmount()
})

test('subagents become cards, then swimlanes past the card limit; a card expands on its hotkey', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: `ag${++n}` }))
  await $.turn.start({ text: 'fan out', turnId: 'T1' })
  await $.agent.spawn(spawn('general-purpose', 'Write the parser tests'))
  await $.agent.spawn(spawn('Explore', 'Map the call sites'))

  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /Write the parser/ })).toBeDefined()
  expect(await ui.find({ text: /Sonnet 5\.5/ })).toBeDefined() // differs from main: shown
  await ui.press({ key: 'card-ag1' })
  expect(await ui.find({ text: /^Write the parser tests$/ })).toBeDefined() // the expanded panel, full title
  await ui.unmount()

  await $.agent.spawn(spawn('general-purpose', 'Implement the parser'))
  await $.agent.spawn(spawn('general-purpose', 'Review the parser'))
  for (const surface of ['terminal', 'desktop'] as const) {
    const lanesUi = await $.ui.mount({ ...pane(64), surface })
    expect(await lanesUi.find({ text: /4 total/ })).toBeDefined()
    expect(await lanesUi.find({ text: /━/ })).toBeDefined()
    await lanesUi.unmount()
  }
})

test('the server-side advisor is read from assistant rows: consulting, then on call', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'plan it', turnId: 'T2' })
  const row = (content: unknown[]) =>
    $.session
      .append({
        message: { type: 'assistant', role: 'assistant', content: content as never },
        door: 'response',
        origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
        uuid: `u${++spawnN}`,
      })
      .catch(() => undefined) // the test has no transcript to store rows in
  await row([{ type: 'server_tool_use', id: 'srv1', name: 'advisor', input: {} }])
  const mid = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await mid.find({ text: /ARCHITECT · advising/ })).toBeDefined()
  expect(await mid.find({ text: /◆ before a plan/ })).toBeDefined()
  await mid.unmount()

  await row([{ type: 'advisor_tool_result', tool_use_id: 'srv1', content: { type: 'advisor_redacted_result' } }])
  const after = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await after.find({ text: /ARCHITECT · on call/ })).toBeDefined()
  expect(await after.find({ text: /^1$/ })).toBeDefined()
  await after.unmount()
})

// The built-in guard passes user plugins over on the attachment, hook-context and compaction doors,
// so the hook subscribes to the response door alone, which is where the assistant's rows come in.
test('the server-side advisor is read only from rows that come in by the response door', async ($, on) => {
  engine(on)
  await $.turn.start({ text: 'plan it', turnId: 'T5' })
  const row = (door: 'response' | 'hook-context', id: string) =>
    $.session
      .append({
        message: { type: 'assistant', role: 'assistant', content: [{ type: 'server_tool_use', id, name: 'advisor', input: {} }] as never },
        door,
        origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
        uuid: `u${++spawnN}`,
      })
      .catch(() => undefined) // the test has no transcript to store rows in
  await row('hook-context', 'srvH')
  const before = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await before.find({ text: /ARCHITECT · advising/ })).toBeUndefined()
  await before.unmount()

  await row('response', 'srvR')
  const after = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await after.find({ text: /ARCHITECT · advising/ })).toBeDefined()
  await after.unmount()
})

test('the gate strip fills from checks and a row opens its redacted drill-down', async ($, on) => {
  engine(on)
  on('tool.check', (_$, e) => ({ decision: e.tool === 'Read' ? 'allow' : 'ask' }))
  await $.tool.check({ tool: 'Read', input: { file_path: '/a/b.ts' }, tool_use_id: 'k1' })
  await $.tool.check({ tool: 'Bash', input: { command: 'curl -H "Authorization: Bearer abcdefgh12345" api' }, tool_use_id: 'k2' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /2 checks/ })).toBeDefined()
  expect(await ui.find({ text: /1 pending/ })).toBeDefined()
  await ui.press({ key: 'gate-shell' })
  expect(await ui.find({ text: /Authorization: Bearer •••/ })).toBeDefined()
  expect(await ui.find({ text: /abcdefgh12345/ })).toBeUndefined()
  await ui.unmount()
})

test('config changes labels, hides panels and turns the moments off', { options: { architectLabel: 'REVIEWER', panels: 'main,architect,agents,log', moments: false } }, async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: `r${++n}` }))
  await $.turn.start({ text: 'review it', turnId: 'T3' })
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review'))
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /REVIEWER · advising/ })).toBeDefined()
  expect(await ui.find({ text: /permissions/ })).toBeUndefined()
  expect(await ui.find({ text: /before a plan/ })).toBeUndefined()
  await ui.unmount()
})

test('a consult whose start and result share one row closes, and its review flag with it', async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'go', turnId: 'T4' })
  // An edit first, so the consult is inferred as "before done" and sets the review flag.
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b' } as never)
  await $.session
    .append({
      message: {
        type: 'assistant',
        role: 'assistant',
        content: [
          { type: 'server_tool_use', id: 'srv9', name: 'advisor', input: {} },
          { type: 'advisor_tool_result', tool_use_id: 'srv9', content: { type: 'advisor_redacted_result' } },
        ] as never,
      },
      door: 'response',
      origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
      uuid: 'one-row',
    })
    .catch(() => undefined)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /ARCHITECT · on call/ })).toBeDefined()
  expect(await ui.find({ text: /◆ before done/ })).toBeDefined()
  expect(await ui.find({ text: /reviewing before done/ })).toBeUndefined()
  await ui.unmount()
})

test('with no architect anywhere, the panel, legend entry and status field stay hidden', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /ARCHITECT/ })).toBeUndefined()
  expect(await ui.find({ text: /^ architect$/ })).toBeUndefined()
  await ui.unmount()
})

test('cards that cannot fit the pane fall back to lanes', async ($, on) => {
  engine(on)
  let n = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++n}` }))
  await $.turn.start({ text: 'go', turnId: 'W1' })
  for (const d of ['alpha', 'beta', 'gamma']) await $.agent.spawn(spawn('Explore', `task ${d}`))
  const narrow = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect(await narrow.find({ text: /━/ })).toBeDefined() // lanes
  await narrow.unmount()
  const wide = await $.ui.mount({ ...pane(70), surface: 'terminal' })
  expect(await wide.find({ text: /━/ })).toBeUndefined() // three cards fit in 70
  expect(await wide.find({ text: /task gamma/ })).toBeDefined()
  await wide.unmount()
})

test("a background architect's advice is read from its hand-back", async ($, on) => {
  engine(on)
  on('agent.spawn', () => ({ model: 'claude-fable-5-1', agentId: 'fab1' }))
  await $.turn.start({ text: 'review it', turnId: 'H1' })
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review'))
  await $.turn.complete({ answer: '', durationMs: 10, isAborted: false, turnId: 'H1', agentId: 'fab1', reason: 'answer' })
  await $.turn.start({
    text: '<agent-message from="fab1">\n[Subagent hand-back] The report follows:\n  Ship it after one more gate test.\n</agent-message>',
    turnId: 'H2',
  })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /» Ship it after one more gate test\./ })).toBeDefined()
  await ui.unmount()
})

test('each rate-limit window shows the time to its reset where the main panel has room', async ($, on) => {
  engine(on)
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const at = (ms: number) => new Date(ms).toISOString()
  await $.session.measure({
    context: { window: 200_000 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 19, resetsAt: at(3 * 3_600_000 + 10 * 60_000) },
      { kind: 'seven_day', percentUsed: 3, resetsAt: at(4 * 86_400_000 + 2 * 3_600_000) },
    ],
    changed: ['rateLimits'],
  })
  for (const cols of [64, 120]) {
    const ui = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
    expect(await ui.find({ text: /19% ↻ 3h10m/ })).toBeDefined()
    expect(await ui.find({ text: /3% ↻ 4d2h/ })).toBeDefined()
    await ui.unmount()
  }
  const justBelow = await $.ui.mount({ ...pane(57), surface: 'terminal' })
  expect(await justBelow.find({ text: /19%/ })).toBeDefined()
  expect(await justBelow.find({ text: /↻/ })).toBeUndefined()
  await justBelow.unmount()
  const narrow = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect(await narrow.find({ text: /19%/ })).toBeDefined()
  expect(await narrow.find({ text: /↻/ })).toBeUndefined() // no room: the gauges stay whole
  await narrow.unmount()
})

test("the main box shows the last request's time to first token, and no tokens per second", async ($, on) => {
  const clock = engine(on)
  // The model beneath: 800 ms to its first words, then 2 s more to stop after 120 tokens.
  on('turn.step', async function* () {
    await clock.sleep(800)
    yield { kind: 'text' as const, index: 0, text: 'hello' }
    await clock.sleep(2000)
    const usage = { input_tokens: 10, output_tokens: 120, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage }
    return { turnId: 'S1', index: 0, answer: 'hello', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  const before = await $.ui.mount({ ...pane(40), surface: 'terminal' })
  expect(await before.find({ text: /ttft/ })).toBeUndefined() // nothing measured yet: no line
  await before.unmount()
  const s = $.turn.step({ turnId: 'S1', index: 0, model: 'claude-opus-5-5', messageCount: 1 })
  const first = s.next()
  await clock.advance(800)
  expect((await first).value).toEqual({ kind: 'text', index: 0, text: 'hello' })
  const stop = s.next()
  await clock.advance(2000)
  await stop
  for await (const _ of s) void _
  await s.result
  for (const cols of [40, 64, 120]) {
    const ui = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
    expect(await ui.find({ text: /ttft 0\.8s$/ })).toBeDefined()
    expect(await ui.find({ text: /tok\/s/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('on a graphical surface, rows of marks hold fewer marks, keep the newest and clip at their box', async ($, on) => {
  engine(on)
  // The newest check is the one refused: its ✗ must stay in sight.
  on('tool.check', (_$, e) => ({ decision: e.tool_use_id === 'g29' ? 'deny' : 'allow' }))
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  on('turn.step', async function* () {
    return { turnId: 'G1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  for (let i = 0; i < 30; i += 1) await $.tool.check({ tool: 'Read', input: { file_path: `/f${i}.ts` }, tool_use_id: `g${i}` })
  // A loop that is no card and no architect: a dot on the "other loops" row.
  const s = $.turn.step({ turnId: 'G1', index: 0, model: 'claude-opus-5-5', messageCount: 1, agentId: 'wf1' })
  for await (const _ of s) void _
  await s.result
  await $.session
    .append({
      message: { type: 'assistant', role: 'assistant', content: [{ type: 'server_tool_use', id: 'srvG', name: 'advisor', input: {} }] as never },
      door: 'response',
      origin: { kind: 'model', model: 'claude-opus-5-5' } as never,
      uuid: 'marks-row',
    })
    .catch(() => undefined)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (const cols of [40, 64, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      // A terminal draws all 30 marks; a graphical surface draws fewer where 30 would not fit
      // (24 in the 36 cells of a 40-column pane), always ending on the newest.
      const strip = await ui.find({ type: 'Text', text: /^[■✗]{2,}$/ })
      expect(strip?.props.wrap).toBe('truncate-start')
      expect(strip?.text.length).toBe(surface !== 'terminal' && cols === 40 ? 24 : 30)
      expect(strip?.text.endsWith('✗')).toBe(true)
      expect((await ui.find({ type: 'Text', text: /^●$/ }))?.props.wrap).toBe('truncate-start')
      expect((await ui.find({ type: 'Text', text: /^[─━◆]+$/ }))?.props.wrap).toBe('truncate-middle')
      expect((await ui.find({ key: 'legend' }))?.props.marginBottom).toBe(surface === 'terminal' ? 0 : 1)
      await ui.unmount()
    }
  }
})

test("the inline summary's strip holds fewer marks on a graphical surface and keeps the newest", async ($, on) => {
  engine(on)
  on('tool.check', (_$, e) => ({ decision: e.tool_use_id === 'n59' ? 'deny' : 'allow' }))
  for (let i = 0; i < 60; i += 1) await $.tool.check({ tool: 'Bash', input: { command: `ls ${i}` }, tool_use_id: `n${i}` })
  for (const surface of ['terminal', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...pane(80), props: { ...pane(80).props, placement: 'inline' as const }, surface })
    // 80 columns less "gate " and " 59 allowed · 0 you · 1 denied" leave 45: 45 marks in a terminal, 30 elsewhere.
    const strip = await ui.find({ type: 'Text', text: /^[■✗]{2,}$/ })
    expect(strip?.props.wrap).toBe('truncate-start')
    expect(strip?.text.length).toBe(surface === 'terminal' ? 45 : 30)
    expect(strip?.text.endsWith('✗')).toBe(true)
    expect(await ui.find({ text: /59 allowed/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a draw that fails says why instead of leaving the pane empty', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  on('clock.now', () => {
    throw new Error('boom')
  })
  for (const cols of [40, 64, 120]) {
    const ui = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
    expect(await ui.find({ text: /^draw failed \(throw\)/ })).toBeDefined()
    await ui.unmount()
  }
})

test('a finished agent that takes another step (resumed by SendMessage) runs again, in the pane and the status line', async ($, on) => {
  // engine(on), with a status line that keeps what it was told
  mock.clock(on)
  const status: (string | undefined)[] = []
  on('ui.status', (_$, e) => (status.push(e.text), { value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'r1' }))
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' }
  on('turn.step', async function* () {
    return { turnId: 'R1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  const step = async () => {
    const s = $.turn.step({ turnId: 'R1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'r1' })
    for await (const _ of s) void _
    await s.result
  }
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.agent.spawn(spawn('general-purpose', 'Audit the parser'))
  await step()
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'R1', agentId: 'r1', reason: 'answer' })
  expect(status[status.length - 1]).toMatch(/agents 0\/1/)
  await step()
  expect(status[status.length - 1]).toMatch(/agents 1\/1/)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /◐ running/ })).toBeDefined()
  expect(await ui.find({ text: /✓ done/ })).toBeUndefined()
  expect(await ui.find({ text: /^resumed$/ })).toBeDefined()
  expect(await ui.find({ text: /ctx 10 · out 10 · 2 st/ })).toBeDefined()
  await ui.unmount()
})

test('the docked pane asks for the width set in paneColumns', { options: { paneColumns: 46 } }, async ($, on) => {
  engine(on)
  const asked: (number | undefined)[] = []
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', (_$, e) => (asked.push(e.columns), { value: { isPlaced: true as const } }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(asked).toEqual([46])
})

test('the context gauge measures against a compaction window set below the model window', () => {
  const u = { ...DEFAULT_USAGE, tokens: 200_000, window: 1_000_000, compactWindow: 400_000 }
  // From the real reading, not the model's percentage: 200k of 400k.
  expect(contextFill(u)).toEqual({ pct: 50, window: 400_000 })
  expect(contextFill({ ...u, tokens: 100_000 })).toEqual({ pct: 25, window: 400_000 })
  // None set, or not below the model's window: the model's window.
  expect(contextFill({ ...u, compactWindow: null })).toEqual({ pct: 20, window: 1_000_000 })
  expect(contextFill({ ...u, compactWindow: 1_000_000 })).toEqual({ pct: 20, window: 1_000_000 })
  expect(contextFill({ ...u, compactWindow: 1_500_000 })).toEqual({ pct: 20, window: 1_000_000 })
  expect(contextFill({ ...u, compactWindow: 0 })).toEqual({ pct: 20, window: 1_000_000 })
  // No reading yet, no gauge; and none from a window not yet known.
  expect(contextFill({ ...u, tokens: null })).toEqual({ pct: null, window: 400_000 })
  expect(contextFill(DEFAULT_USAGE)).toEqual({ pct: null, window: 0 })
  expect(contextFill({ ...DEFAULT_USAGE, tokens: 5 }).pct).toBeNull()
})

test('a breakdown names a compaction window only when auto-compaction is on and it is below the model window', () => {
  const on = { rawMaxTokens: 400_000, isAutoCompactEnabled: true }
  expect(compactWindowOf(on, 1_000_000)).toBe(400_000)
  expect(compactWindowOf({ ...on, isAutoCompactEnabled: false }, 1_000_000)).toBeNull()
  expect(compactWindowOf({ ...on, rawMaxTokens: 1_000_000 }, 1_000_000)).toBeNull() // the model's own limit
  expect(compactWindowOf(on, 200_000)).toBeNull() // a model switch to a smaller window
  expect(compactWindowOf({ ...on, rawMaxTokens: 0 }, 1_000_000)).toBeNull()
  expect(compactWindowOf(undefined, 1_000_000)).toBeNull() // no breakdown: unknown
  expect(compactWindowOf(null, 1_000_000)).toBeNull()
})

/** A session whose `session.usage` answers as a host does: the breakdown only to a call that asks for one. */
const compactHost = (on: On, o: { window: () => number; compact: number | null; isEnabled?: boolean; tokens?: number }) => {
  const asked: (string | undefined)[] = []
  on('session.usage', (_$, e) => {
    asked.push(e.breakdown)
    const window = o.window()
    const breakdown =
      e.breakdown && o.compact !== null
        ? { rawMaxTokens: o.compact, isAutoCompactEnabled: o.isEnabled ?? true, totalTokens: 123, percentage: 99 }
        : undefined
    return { value: { startedAt: 0, rateLimits: [], context: { window, ...(o.tokens !== undefined ? { tokens: o.tokens } : {}), ...(breakdown ? { breakdown: breakdown as never } : {}) } } }
  })
  return asked
}

test('the gauge, status and inline summary measure against the compaction window, read once per model window', async ($, on) => {
  mock.clock(on)
  let status: string | undefined
  on('ui.status', (_$, e) => {
    status = e.text
    return { value: undefined }
  })
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  let window = 1_000_000
  const asked = compactHost(on, { window: () => window, compact: 400_000 })
  const measure = (tokens: number) =>
    $.session.measure({ context: { window, tokens, percent: tokens / (window / 100) }, rateLimits: [], changed: ['context'] })
  await measure(100_000)
  await measure(150_000)
  await measure(200_000)
  // Three measurements, one summary breakdown: never `full`, which would send token-count requests.
  expect(asked.filter(Boolean)).toEqual(['summary'])
  expect(status).toBe('ctx 50%') // not the host's 20% of a million
  for (const cols of [40, 64, 120]) {
    const ui = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
    expect(await ui.find({ text: /200k\/400k/ })).toBeDefined()
    expect(await ui.find({ text: / 50%/ })).toBeDefined()
    expect(await ui.find({ text: /1\.0M/ })).toBeUndefined()
    await ui.unmount()
    const mini = await $.ui.mount({ ...pane(cols), props: { ...pane(cols).props, placement: 'inline' as const }, surface: 'terminal' })
    expect(await mini.find({ text: / 50%/ })).toBeDefined()
    await mini.unmount()
  }
  // Past 80% of the compaction window the gauge warns, though the model's window has room.
  await measure(340_000)
  const warn = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect((await warn.find({ type: 'Text', text: /^▰+$/ }))?.props.color).toBe('error')
  expect(await warn.find({ text: / 85%/ })).toBeDefined()
  await warn.unmount()
  // A model with a smaller window: read again, and a compaction window above it no longer counts.
  window = 200_000
  await measure(100_000)
  expect(asked.filter(Boolean)).toEqual(['summary', 'summary'])
  const small = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await small.find({ text: /100k\/200k/ })).toBeDefined()
  await small.unmount()
})

const keepsModelWindow = (name: string, host: { compact: number | null; isEnabled?: boolean }, asks: number) =>
  test(name, async ($, on) => {
    mock.clock(on)
    on('ui.status', () => ({ value: undefined }))
    on('session.measure', (_$, e) => ({ changed: e.changed }))
    const asked = compactHost(on, { window: () => 1_000_000, ...host })
    for (const tokens of [50_000, 100_000, 200_000, 250_000, 300_000]) {
      await $.session.measure({ context: { window: 1_000_000, tokens, percent: tokens / 10_000 }, rateLimits: [], changed: ['context'] })
    }
    // An answer is asked for once; no breakdown (no session bound yet) is asked again, COMPACT_TRIES in all.
    expect(asked.filter(Boolean).length).toBe(asks)
    for (const cols of [40, 64, 120]) {
      const ui = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
      expect(await ui.find({ text: /300k\/1\.0M/ })).toBeDefined()
      expect(await ui.find({ text: / 30%/ })).toBeDefined()
      await ui.unmount()
    }
  })

keepsModelWindow('a host that gives no breakdown keeps the model window and stops asking after 3 tries', { compact: null }, 3)
keepsModelWindow('with auto-compaction off the gauge keeps the model window and is asked once', { compact: 400_000, isEnabled: false }, 1)

test('a resumed session reads its compaction window at start, and /clear leaves the reading alone', async ($, on) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.register', () => ({ value: { command: 'flightdeck' } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  // Resumed with 200k already in context.
  const asked = compactHost(on, { window: () => 1_000_000, compact: 400_000, tokens: 200_000 })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  expect(asked).toEqual([undefined, 'summary'])
  const resumed = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await resumed.find({ text: /200k\/400k/ })).toBeDefined()
  expect(await resumed.find({ text: / 50%/ })).toBeDefined()
  await resumed.unmount()
  // The gauge waits for the next measurement after a /clear; the compaction window is not asked again.
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  expect(asked).toEqual([undefined, 'summary'])
  const cleared = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await cleared.find({ text: /100k\/400k/ })).toBeDefined()
  expect(await cleared.find({ text: / 25%/ })).toBeDefined()
  await cleared.unmount()
})

test('a resumed session shows its model, effort, mode and an estimated context before its first request', async ($, on) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('command.register', () => ({ value: { command: 'flightdeck' } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.turns', () => ({ value: 12 }))
  // A read of one key is the read of the whole object, projected by the engine.
  on('settings.read', () => ({ value: { effortLevel: 'medium', permissions: { defaultMode: 'bypassPermissions' } } as never }))
  // The host has no fill yet; the local summary breakdown says 123 tokens of a 400k compaction window.
  compactHost(on, { window: () => 1_000_000, compact: 400_000 })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /OPUS 5\.5/ })).toBeDefined()
  expect(await ui.find({ text: /^medium$/ })).toBeDefined()
  expect(await ui.find({ text: /bypassPermissions/ })).toBeDefined()
  expect(await ui.find({ text: /^~123\/400k$/ })).toBeDefined()
  await ui.unmount()
  // A measurement with no count keeps the estimate; the first real count replaces it.
  await $.session.measure({ context: { window: 1_000_000 }, rateLimits: [], changed: ['context'] } as never)
  const kept = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await kept.find({ text: /^~123\/400k$/ })).toBeDefined()
  await kept.unmount()
  await $.session.measure({ context: { window: 1_000_000, tokens: 100_000, percent: 10 }, rateLimits: [], changed: ['context'] })
  const real = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await real.find({ text: /^100k\/400k$/ })).toBeDefined()
  await real.unmount()
})

test('a compaction-window read that fails is asked again at the next measurement', async ($, on) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  let reads = 0
  on('session.usage', (_$, e) => {
    if (e.breakdown && ++reads === 1) return { deny: 'not bound yet' }
    const breakdown = e.breakdown ? { rawMaxTokens: 400_000, isAutoCompactEnabled: true } : undefined
    return { value: { startedAt: 0, rateLimits: [], context: { window: 1_000_000, ...(breakdown ? { breakdown: breakdown as never } : {}) } } }
  })
  const measure = (tokens: number) =>
    $.session.measure({ context: { window: 1_000_000, tokens, percent: tokens / 10_000 }, rateLimits: [], changed: ['context'] })
  await measure(100_000)
  const failed = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await failed.find({ text: /100k\/1\.0M/ })).toBeDefined()
  await failed.unmount()
  await measure(200_000)
  await measure(300_000)
  expect(reads).toBe(2) // the failed read once more, then not again
  const read = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await read.find({ text: /300k\/400k/ })).toBeDefined()
  expect(await read.find({ text: / 75%/ })).toBeDefined()
  await read.unmount()
})

test('a compaction-window read is claimed once per model window, missed reads retried up to a cap, stale ones dropped', () => {
  const b = { rawMaxTokens: 400_000, isAutoCompactEnabled: true }
  const fresh = { ...DEFAULT_USAGE, window: 1_000_000 }
  const first = claimCompactRead(fresh, 1_000_000)
  expect([first.isClaimed, first.usage.compactFor]).toEqual([true, 1_000_000])
  expect(claimCompactRead(first.usage, 1_000_000).isClaimed).toBe(false) // already claimed
  expect(afterCompactRead(first.usage, 1_000_000, b).compactWindow).toBe(400_000)
  // A read for a window no longer claimed (the model switched while it ran) changes nothing.
  const switched = claimCompactRead({ ...first.usage, window: 1_000_000 }, 200_000).usage
  expect(afterCompactRead(switched, 1_000_000, b)).toBe(switched)
  // A miss (no breakdown, or a failed call) gives the claim back and counts; COMPACT_TRIES misses stop asking.
  let u = first.usage
  for (let i = 0; i < COMPACT_TRIES; i += 1) {
    const c = claimCompactRead(u, 1_000_000)
    expect(c.isClaimed || i === 0).toBe(true)
    u = afterCompactRead(c.isClaimed ? c.usage : u, 1_000_000, i % 2 ? null : undefined)
  }
  expect([u.compactFor, u.compactMisses, u.compactWindow]).toEqual([0, COMPACT_TRIES, null])
  expect(claimCompactRead(u, 1_000_000).isClaimed).toBe(false)
  // Another model window, or another model, starts afresh.
  expect(claimCompactRead(u, 200_000).isClaimed).toBe(true)
  expect(claimCompactRead(forgetCompactRead({ ...u, compactWindow: 400_000 }), 1_000_000).isClaimed).toBe(true)
  expect(forgetCompactRead({ ...u, compactWindow: 400_000 }).compactWindow).toBe(null)
})

// Claude Code's built-in guard keeps session.compact from user plugins. Claude Code reports no fill
// until the first response after a new session, a /clear or a compaction, so a main-loop request that
// finds none after a response came back follows a compaction: counted, marked as an estimate.
const fillHost = ($: Parameters<TestBody>[0], on: On) => {
  engine(on)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  let veto: string | undefined
  on('session.compact', (_$, e) => (veto ? { skip: veto } : { messages: e.messages }))
  let fill: number | undefined
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [], context: { window: 1_000_000, ...(fill !== undefined ? { tokens: fill } : {}) } } }))
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 60_000, cache_creation_input_tokens: 0, model: 'x' }
  on('turn.step', async function* () {
    return { turnId: 'C1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  return {
    /** One model request: the fill Claude Code reports as it goes out, then its response. */
    request: async (tokens: number | undefined, agentId?: string) => {
      fill = tokens
      const s = $.turn.step({ turnId: 'C1', index: 0, model: 'claude-opus-5-5', messageCount: 1, ...(agentId ? { agentId } : {}) })
      for await (const _ of s) void _
      await s.result
    },
    measure: (tokens: number) => $.session.measure({ context: { window: 1_000_000, tokens, percent: tokens / 10_000 }, rateLimits: [], changed: ['context'] }),
    /** Compactions from here on come back skipped with this reason, as a blocking PreCompact hook's do; undefined lets them run. */
    vetoCompactions: (why: string | undefined) => {
      veto = why
    },
    /** The compaction mark the main box shows, whether it says `(estimated)`, and how many log lines say compacted. */
    shown: async () => {
      const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
      const mark = (await ui.find({ type: 'Text', text: /^↺/ }))?.text ?? null
      const isEstimated = (await ui.find({ type: 'Text', text: /^\(estimated\)$/ })) !== undefined
      const logged = (await ui.findAll({ type: 'Text', text: /^context compacted/ })).map(n => n.text)
      await ui.unmount()
      return { mark, isEstimated, logged }
    },
  }
}

test('under the built-in guard a request that finds the context emptied counts an estimated compaction', async ($, on) => {
  const h = fillHost($, on)
  await h.measure(60_000)
  await h.request(undefined) // a new session's first request: nothing to have emptied
  await h.request(60_000)
  expect(await h.shown()).toEqual({ mark: null, isEstimated: false, logged: [] })
  await h.request(undefined)
  expect(await h.shown()).toEqual({ mark: '↺~1', isEstimated: true, logged: ['context compacted (estimated)'] })
  // Compacted again after one response, as auto-compaction can within a turn; a subagent's own window is not the main one.
  await h.request(undefined)
  await h.request(undefined, 'sub1')
  expect((await h.shown()).mark).toBe('↺~2')
  // The label is left out where the line is short; nothing spills.
  const spills: string[] = []
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [24, 28, 32, 36, 40, 64, 120]) {
      for (const placement of ['dock', 'inline'] as const) {
        const ui = await $.ui.mount({ ...pane(cols), props: { ...pane(cols).props, placement }, surface })
        for (const s of spillsOf(await ui.drawn(), cols)) spills.push(`${surface} ${placement} ${cols}: ${s}`)
        await ui.unmount()
      }
    }
  }
  expect(spills).toEqual([])
  // A /clear empties the context too, and isn't a compaction.
  await $.session.end({ reason: 'clear', sessionId: 's' } as never)
  await h.request(undefined)
  await h.measure(30_000)
  expect((await h.shown()).mark).toBe('↺~2')
  // So can a /resume into another conversation, before its first response.
  await $.session.end({ reason: 'resume', sessionId: 's' } as never)
  await h.request(undefined)
  expect((await h.shown()).mark).toBe('↺~2')
})

test('once session.compact reaches Flightdeck its count is the real one: estimates before it are dropped, none after', async ($, on) => {
  const h = fillHost($, on)
  await h.measure(60_000)
  await h.request(60_000)
  await h.request(undefined) // a rewind to the first prompt reads like a compaction
  expect((await h.shown()).mark).toBe('↺~1')
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'the summary', toolUses: [] }] })
  await h.request(undefined)
  await h.request(60_000)
  await h.request(undefined)
  expect(await h.shown()).toEqual({ mark: '↺1', isEstimated: false, logged: ['context compacted (estimated)', 'context compacted (auto)'] })
})

test('a compaction that comes back skipped is neither counted nor logged', async ($, on) => {
  const h = fillHost($, on)
  await h.measure(60_000)
  const compact = () => $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'the summary', toolUses: [] }] })
  h.vetoCompactions('a PreCompact hook blocked it')
  await compact()
  expect(await h.shown()).toEqual({ mark: null, isEstimated: false, logged: [] })
  h.vetoCompactions(undefined)
  await compact()
  expect(await h.shown()).toEqual({ mark: '↺1', isEstimated: false, logged: ['context compacted (manual)'] })
})

test("a surface module's fault key is the same for the hook's path, either separator, and the drawing's name", () => {
  expect(faultKey('desktop', 'hooks/rail.tsx')).toBe('desktop:rail.tsx')
  expect(faultKey('desktop', 'hooks\\rail.tsx')).toBe(faultKey('desktop', 'rail.tsx'))
  expect(faultKey('terminal', 'hooks/elapsed.tsx')).not.toBe(faultKey('desktop', 'hooks/elapsed.tsx'))
})

test("Text's monospaced face is asked of 2.1.299 and later only, read from the release", () => {
  const at = (version: string, base?: string) => knowsMono({ version, ...(base !== undefined ? { base } : {}) })
  expect([at('2.1.287', '2.1.287'), at('2.1.295', '2.1.295'), at('2.1.298', '2.1.298')]).toEqual([false, false, false])
  expect([at('2.1.299', '2.1.299'), at('2.1.309', '2.1.309'), at('2.2.0', '2.2.0'), at('3.0.0', '3.0.0')]).toEqual([true, true, true, true])
  expect([at('2.0.999', '2.0.999'), at('1.9.400', '1.9.400')]).toEqual([false, false])
  // A development build: its base names the release, its version the build.
  expect(at('2.1.300-dev.20261001.t101500.sha1a2b3c4', '2.1.300-dev')).toBe(true)
  expect(at('2.1.296-dev.20260920.t101500.sha1a2b3c4', '2.1.296-dev')).toBe(false)
  // No base: the version itself, when it is spelled as a release.
  expect([at('2.1.310'), at('2.1.290')]).toEqual([true, false])
  // Nothing to read: no face.
  expect([at('local'), at(''), knowsMono(null), knowsMono(undefined)]).toEqual([false, false, false, false])
})

test('switching to another model with the same window reads its compaction window afresh', async ($, on) => {
  mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  let compact = 400_000
  let reads = 0
  on('session.usage', (_$, e) => {
    if (e.breakdown) reads += 1
    const breakdown = e.breakdown ? { rawMaxTokens: compact, isAutoCompactEnabled: true } : undefined
    return { value: { startedAt: 0, rateLimits: [], context: { window: 1_000_000, ...(breakdown ? { breakdown: breakdown as never } : {}) } } }
  })
  const usage = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'x' }
  on('turn.step', async function* () {
    return { turnId: 'M1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  const step = async (model: string) => {
    const s = $.turn.step({ turnId: 'M1', index: 0, model, messageCount: 1 })
    for await (const _ of s) void _
    await s.result
  }
  const measure = (tokens: number) =>
    $.session.measure({ context: { window: 1_000_000, tokens, percent: tokens / 10_000 }, rateLimits: [], changed: ['context'] })
  await step('claude-opus-5-5[1m]')
  await measure(300_000)
  await step('claude-opus-5-5[1m]')
  await measure(360_000)
  expect(reads).toBe(1) // the same model: not asked again
  // Another 1M model whose own autoCompactWindow (modelSettings) is 700k.
  compact = 700_000
  await step('claude-sonnet-5-5[1m]')
  await measure(360_000)
  expect(reads).toBe(2)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /360k\/700k/ })).toBeDefined()
  expect(await ui.find({ text: / 51%/ })).toBeDefined()
  await ui.unmount()
})

test('a resume through agent.spawn logs once, whether its spawn or its first step lands first; "done" times the run', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'claude-sonnet-5-5' }
  on('turn.step', async function* () {
    return { turnId: 'R1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  const step = async () => {
    const s = $.turn.step({ turnId: 'R1', index: 0, model: 'claude-sonnet-5-5', messageCount: 1, agentId: 'r1' })
    for await (const _ of s) void _
    await s.result
  }
  // A resumed agent may take its first step before its spawn's own hooks have finished.
  let isStepFirst = false
  on('agent.spawn', async (_$, e) => {
    if (e.resume && isStepFirst) await step()
    return { model: 'claude-sonnet-5-5', agentId: e.resume?.agentId ?? 'r1' }
  })
  const complete = (durationMs: number) =>
    $.turn.complete({ answer: 'ok', durationMs, isAborted: false, turnId: 'R1', agentId: 'r1', reason: 'answer' })
  const lines = async (re: RegExp) => {
    const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
    const n = (await ui.findAll({ text: re })).length
    await ui.unmount()
    return n
  }
  await $.turn.start({ text: 'go', turnId: 'T1' })
  await $.agent.spawn(spawn('general-purpose', 'Audit the parser'))
  await step()
  await clock.advance(60_000)
  await complete(60_000)
  // Idle half an hour, then resumed: the spawn first, then its step.
  await clock.advance(30 * 60_000)
  await $.agent.spawn({ ...spawn('general-purpose', 'Audit it again'), resume: { agentId: 'r1' } })
  await step()
  expect(await lines(/^resumed$/)).toBe(1)
  await clock.advance(90_000)
  await complete(90_000)
  // Resumed again, its first step landing inside the spawn.
  isStepFirst = true
  await $.agent.spawn({ ...spawn('general-purpose', 'And once more'), resume: { agentId: 'r1' } })
  expect(await lines(/^resumed$/)).toBe(2)
  expect(await lines(/^Audit the parser$/)).toBe(0) // one card, the latest task
  // Each run timed on its own, not from the first spawn.
  expect(await lines(/^done · 1m00s$/)).toBe(1)
  expect(await lines(/^done · 1m30s$/)).toBe(1)
})

test("a subagent's turn start is its own: no prompt line, and the main turn keeps its count", async ($, on) => {
  engine(on)
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  await $.turn.start({ text: 'refactor it', turnId: 'T1' })
  await $.tool.call({ tool: 'Edit', file_path: '/x.ts', old_string: 'a', new_string: 'b' } as never)
  await $.turn.start({ text: 'Look at the parser again', turnId: 'A1', agentId: 'sub1' })
  await $.turn.complete({ answer: '', durationMs: 1000, isAborted: false, turnId: 'T1', reason: 'answer' })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /Look at the parser again/ })).toBeUndefined()
  expect(await ui.find({ text: /refactor it/ })).toBeDefined()
  expect(await ui.find({ text: /· 1 edit ·/ })).toBeDefined()
  await ui.unmount()
})

test('a line keeps the pieces that fit, in order, counting each lead and the gaps between them', () => {
  const pieces = [{ width: 5 }, { width: 5, lead: 2 }, { width: 3 }]
  expect([piecesThatFit(pieces, 13, 1), piecesThatFit(pieces, 12, 1), piecesThatFit(pieces, 17, 1), piecesThatFit(pieces, 4, 1)]).toEqual([2, 1, 3, 0])
  expect([cellWidth('■ ▰▱ 48%'), cellWidth('')]).toEqual([8, 0])
})

// ---------------------------------------------------------------- width check

// The kit lays nothing out, so this measures the drawn tree as a row layout would: the fewest cells
// each element needs without spilling (a truncating Text or a clipping Box needs none, a Text that
// asks to wrap its longest word, any other Text its whole length, a plain Button with a hotkey `1: `
// more than its label), and checks that every Box given a width holds what it contains.
type Drawn = { type: string; props?: Record<string, unknown>; children?: unknown[] }
const isDrawn = (n: unknown): n is Drawn => typeof n === 'object' && n !== null && typeof (n as Drawn).type === 'string'
const cellsOf = (s: string) => [...s].length
const textOf = (n: unknown): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : isDrawn(n) ? (n.children ?? []).map(textOf).join('') : ''
const spaceOf = (v: unknown) => (typeof v === 'number' ? v : v === undefined ? 0 : 1)
const longestWord = (s: string) => Math.max(0, ...s.split(/\s+/).map(cellsOf))
const needs = (n: unknown, out: string[], path: string): number => {
  if (typeof n === 'string') return longestWord(n)
  if (!isDrawn(n)) return 0
  const p = n.props ?? {}
  const here = `${path}/${String(p.key ?? n.type)}`
  if (n.type === 'Text') return p.wrap === undefined ? cellsOf(textOf(n)) : p.wrap === 'wrap' ? longestWord(textOf(n)) : 1
  if (n.type === 'Button') return cellsOf(String(p.label ?? '')) + (p.plain ? (p.hotkey ? 3 : 0) : 4)
  if (n.type === 'Client') return typeof p.width === 'number' ? p.width : 5
  if (n.type !== 'Box') return 0
  const kids = (n.children ?? []).filter(c => c !== null && c !== undefined && c !== false && c !== '')
  const inner = kids.map((c, i) => needs(c, out, `${here}[${i}]`))
  const isColumn = p.flexDirection === 'column' || p.flexDirection === 'column-reverse'
  const content =
    isColumn || p.flexWrap === 'wrap'
      ? Math.max(0, ...inner)
      : inner.reduce((a, b) => a + b, 0) + spaceOf(p.columnGap ?? p.gap) * Math.max(0, inner.length - 1)
  const need = content + (p.borderStyle ? 2 : 0) + 2 * spaceOf(p.paddingX ?? p.padding)
  const margin = spaceOf(p.marginLeft) + spaceOf(p.marginRight) + 2 * spaceOf(p.marginX)
  // A Box with a width must hold its contents, clipping or not; one without clips to nothing if it may.
  if (typeof p.width === 'number') {
    if (need > p.width) out.push(`${here}: needs ${need} in ${p.width}`)
    return p.width + margin
  }
  return (p.overflow === 'hidden' ? 0 : need) + margin
}

/**
 * What a graphical surface needs of a line of text: no `truncate` Text nests Texts (the desktop app wraps the
 * nested pieces, or lays truncating ones out as blocks of their own), and no Text placed in a Box starts or
 * ends with a space (it collapses spaces, so a gap between pieces is the Box's, not the text's).
 */
const desktopFaults = (n: unknown, out: string[], path = '', parent = ''): string[] => {
  if (!isDrawn(n)) return out
  const p = n.props ?? {}
  const here = `${path}/${String(p.key ?? n.type)}`
  const kids = (n.children ?? []).filter(isDrawn)
  if (n.type === 'Text') {
    const text = textOf(n)
    if (p.wrap === 'truncate' && kids.some(k => k.type === 'Text')) out.push(`${here}: truncates nested Texts "${text}"`)
    if (parent === 'Box' && text !== text.trim()) out.push(`${here}: edge spaces "${text}"`)
    return out
  }
  kids.forEach((k, i) => desktopFaults(k, out, `${here}[${i}]`, n.type))
  return out
}
const spillsOf = (tree: unknown, columns: number) => {
  const out: string[] = []
  const need = needs(tree, out, '')
  if (need > columns) out.push(`root: needs ${need} in ${columns}`)
  return out
}

/** A session with every panel busy: a compaction window, limits, consults with advice, checks of every kind, agents, a loop. */
const busySession = async ($: Parameters<TestBody>[0], on: On) => {
  const clock = engine(on)
  await clock.advance(3_600_000) // clocks draw as m:ss, as in a session, not as the '—' of an unknown start
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('tool.check', (_$, e) => ({ decision: (e.tool_use_id ?? '').endsWith('7') ? 'deny' : 'allow' }))
  on('tool.call', () => ({ result: {}, text: 'ok' }))
  let n = 0
  on('agent.spawn', (_$, e) => ({ model: 'claude-sonnet-5-5', agentId: e.subagentType.includes('advisor') ? 'adv1' : `b${++n}` }))
  const usage = { input_tokens: 4000, output_tokens: 900, cache_read_input_tokens: 120_000, cache_creation_input_tokens: 0, model: 'claude-opus-5-5' }
  on('turn.step', async function* () {
    yield { kind: 'text' as const, index: 0, text: 'ok' }
    yield { kind: 'stop' as const, stopReason: 'end_turn' as const, usage }
    return { turnId: 'B1', index: 0, answer: 'ok', toolUses: [], stopReason: 'end_turn' as const, usage }
  })
  const step = async (agentId?: string) => {
    const s = $.turn.step({ turnId: 'B1', index: 0, model: 'claude-opus-5-5[1m]', messageCount: 1, ...(agentId ? { agentId } : {}) })
    for await (const _ of s) void _
    await s.result
  }
  await $.session.measure({
    context: { window: 1_000_000, tokens: 360_000, percent: 36 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 82, resetsAt: new Date(3 * 3_600_000).toISOString() },
      { kind: 'seven_day_opus', percentUsed: 40, resetsAt: new Date(4 * 86_400_000).toISOString() },
    ],
    cost: { usd: 123.45 },
    changed: ['context', 'rateLimits', 'cost'],
  } as never)
  await $.turn.start({ text: 'Refactor the configuration loader and keep every public name stable please', turnId: 'B1' })
  await step()
  const tools = [
    { tool: 'Bash', input: { command: 'npm run test -- --reporter=verbose --coverage packages/configuration-loader' } },
    { tool: 'Read', input: { file_path: '/Users/someone/projects/a-very-long-repository-name/src/configuration/loader.ts' } },
    { tool: 'WebFetch', input: { url: 'https://example.com/a/very/long/documentation/path/for/the/loader' } },
  ]
  for (let i = 0; i < 60; i += 1) await $.tool.check({ ...tools[i % 3]!, tool_use_id: `k${i}` })
  await $.tool.call({ tool: 'Edit', file_path: '/x/loader.ts', old_string: 'a', new_string: 'b', tool_use_id: 'edit1' } as never)
  await $.agent.spawn(spawn('fable-advisor:fable-advisor', 'final review of the loader'))
  await $.turn.complete({
    answer: 'Ship it once the configuration loader keeps its public names and the migration test covers the old shape',
    durationMs: 9000, isAborted: false, turnId: 'A1', agentId: 'adv1', reason: 'answer',
  })
  for (const d of ['Write the configuration loader regression tests', 'Map every call site of the old loader', 'Review the migration path for saved state']) {
    await $.agent.spawn(spawn('general-purpose', d))
  }
  await step('b1')
  await step('wf-unclaimed-loop')
  await clock.advance(95_000)
  await $.turn.complete({ answer: '', durationMs: 95_000, isAborted: false, turnId: 'B1', reason: 'answer' })
  return clock
}

test('every panel fits the pane at every width from 24 columns, on every surface and placement, in lines a graphical surface keeps whole', { timeoutMs: 60_000 }, async ($, on) => {
  await busySession($, on)
  const failures: string[] = []
  const check = async (label: string) => {
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
      for (let cols = 24; cols <= 40; cols += 1) {
        for (const placement of ['dock', 'inline'] as const) {
          const ui = await $.ui.mount({ ...pane(cols), props: { ...pane(cols).props, placement }, surface })
          for (const s of spillsOf(await ui.drawn(), cols)) failures.push(`${label} ${surface} ${placement} ${cols}: ${s}`)
          await ui.unmount()
        }
      }
      for (const cols of [64, 120]) {
        const ui = await $.ui.mount({ ...pane(cols), surface })
        for (const s of spillsOf(await ui.drawn(), cols)) failures.push(`${label} ${surface} dock ${cols}: ${s}`)
        await ui.unmount()
      }
    }
  }
  await check('lanes, finished')
  // The gate drill-down and an expanded card open, and a turn running.
  const opener = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  await opener.press({ key: 'gate-shell' })
  await opener.press({ key: 'card-b1' })
  await opener.unmount()
  await $.turn.start({ text: 'and once more', turnId: 'B2' })
  await check('drill-down, expanded, running')
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [24, 32, 40, 64, 120]) {
      for (const placement of ['dock', 'inline'] as const) {
        const ui = await $.ui.mount({ ...pane(cols), props: { ...pane(cols).props, placement }, surface })
        for (const f of desktopFaults(await ui.drawn(), [])) failures.push(`${surface} ${placement} ${cols}: ${f}`)
        await ui.unmount()
      }
    }
  }
  // One line per panel and width that spills, the surface left out (they draw the same boxes).
  expect([...new Set(failures.map(f => f.replace(/ (terminal|desktop|vscode|mobile) /, ' ')))]).toEqual([])
})

test('a single agent card fits from 24 columns, and the time axis scales to the pane', async ($, on) => {
  const clock = engine(on)
  await clock.advance(3_600_000)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'one' }))
  await $.turn.start({ text: 'go', turnId: 'O1' })
  await $.agent.spawn(spawn('general-purpose', 'Write the configuration loader regression tests'))
  const failures: string[] = []
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (let cols = 24; cols <= 40; cols += 1) {
      const ui = await $.ui.mount({ ...pane(cols), surface })
      for (const s of spillsOf(await ui.drawn(), cols)) failures.push(`${surface} ${cols}: ${s}`)
      if (surface !== 'terminal') {
        // No pixel width of its own: the surface draws it at the markup's width, down to the pane's.
        const svg = await ui.find({ type: 'Svg' })
        expect([svg !== undefined, svg?.props.width, svg?.props.height]).toEqual([true, undefined, undefined])
      }
      await ui.unmount()
    }
  }
  expect(failures).toEqual([])
})

/** The engine's answer to `$.session.version()`: a release, or a refusal; a function is asked at each call. */
const engineAt = (on: On, version: string | null | (() => string | null)) =>
  on('session.version', () => {
    const v = typeof version === 'function' ? version() : version
    return v === null ? { deny: 'no version here' } : { value: { version: v, base: v } }
  })

/** A plugin whose pane is one Text in the monospaced face, for `kitHasMono`. */
const monoProbe: Plugin = {
  name: 'mono-probe',
  register(on) {
    on('ui.render', { component: 'Pane', requestId: 'mono-probe' }, ($, e) => {
      const { Text } = $.ui.resolve(e)
      return h(Text, { mono: true }, '─') as RenderElement
    })
  },
}

/**
 * Whether the engine `claude plugin test` runs on draws `Text`'s `mono` (2.1.299 and later), as CI runs the
 * tests on the oldest Claude Code the README names as well as a newer one. Nothing in the kit answers
 * `$.session.version()` (a test pins it with engineAt), so a drawing is asked instead: `monoProbe`'s, which
 * the test loads in `plugins`. False when the engine refuses the prop. It is a call on `$`, so the test's
 * hooks go in before it.
 */
const kitHasMono = async ($: Parameters<TestBody>[0]): Promise<boolean> => {
  try {
    const ui = await $.ui.mount({ ...pane(24), plugin: 'mono-probe', requestId: 'mono-probe', surface: 'terminal' })
    await ui.drawn()
    await ui.unmount()
    return true
  } catch (err) {
    if (/Text prop "mono" is not allowed/.test(String(err))) return false
    throw err
  }
}

test('a running connector keeps its length every frame: one face, clipped at its width, the dot still moving', { plugins: [monoProbe] }, async ($, on) => {
  engine(on)
  // The monospaced face where the engine running the tests has it; before 2.1.299 an engine of that age, and none.
  let hasMono = false
  engineAt(on, () => (hasMono ? '2.1.309' : '2.1.295'))
  on('tool.check', () => ({ decision: 'allow' }))
  hasMono = await kitHasMono($)
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'r1' })
  await $.turn.start({ text: 'go', turnId: 'R1' }) // a turn running: the connectors animate
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...pane(64), surface })
    expect((await ui.find({ key: 'link-gate' }))?.type).toBe('Client')
    const heads = new Set<number>()
    for (let frame = 0; frame < 30; frame += 1) {
      const tree = (await ui.drawn({ in: 'link-gate' })) as Drawn
      const texts: Drawn[] = []
      const walk = (n: unknown) => {
        if (!isDrawn(n)) return
        if (n.type === 'Text') texts.push(n)
        else (n.children ?? []).forEach(walk)
      }
      walk(tree)
      const line = texts.map(textOf).join('')
      // The box is the line's width and clips; its text is that width and four spare cells, every frame.
      expect([tree.type, tree.props?.width, tree.props?.overflow]).toEqual(['Box', 64, 'hidden'])
      expect(cellsOf(line)).toBe(64 + 4)
      expect(texts.every(t => t.props?.mono === (hasMono ? true : undefined))).toBe(true)
      expect(/^[─●•┬┴]+$/.test(line)).toBe(true)
      const head = [...line].slice(0, 64).indexOf('●')
      if (head >= 0) heads.add(head)
      await ui.advance(110)
    }
    expect(heads.size > 5).toBe(true) // the dot travels along the line
    await ui.unmount()
  }
})

/** Every Text in a drawing that names `mono`, true or false: an engine before 2.1.299 has no such prop. */
const monoTexts = (n: unknown, out: string[], path: string): string[] => {
  if (!isDrawn(n)) return out
  const here = `${path}/${String(n.props?.key ?? n.type)}`
  if (n.type === 'Text' && n.props !== undefined && 'mono' in n.props) out.push(here)
  ;(n.children ?? []).forEach((c, i) => monoTexts(c, out, `${here}[${i}]`))
  return out
}

/**
 * A turn running with a check in the gate, on an engine at `version` (null: one that won't say; a function:
 * the release to pin, told whether the engine running the tests draws the face, with `monoProbe` loaded),
 * drawn at 64 columns on the terminal and the desktop app for a few frames: the Texts that name `mono`, in
 * the pane and in its animated connectors, the connectors' lines (each a Client, or a still Text with motion
 * off), and what kitHasMono said when it was asked.
 */
const facesAt = async ($: Parameters<TestBody>[0], on: On, version: string | null | ((hasMono: boolean) => string)) => {
  engine(on)
  let pinned = typeof version === 'function' ? null : version
  engineAt(on, () => pinned)
  on('tool.check', () => ({ decision: 'allow' }))
  let hasMono: boolean | undefined
  if (typeof version === 'function') {
    hasMono = await kitHasMono($)
    pinned = version(hasMono)
  }
  await $.tool.check({ tool: 'Read', input: { file_path: '/a' }, tool_use_id: 'r1' })
  await $.turn.start({ text: 'go', turnId: 'R1' })
  const named: string[] = []
  const lines: string[] = []
  const walkLines = (n: unknown) => {
    if (!isDrawn(n)) return
    if (n.type === 'Text' && /^─{64}$/.test(textOf(n))) lines.push(textOf(n))
    else (n.children ?? []).forEach(walkLines)
  }
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...pane(64), surface })
    for (let frame = 0; frame < 3; frame += 1) {
      const tree = await ui.drawn()
      monoTexts(tree, named, surface)
      walkLines(tree)
      for (const key of ['link-gate', 'link-receipt']) {
        if ((await ui.find({ key }))?.type !== 'Client') continue
        const rail = await ui.drawn({ in: key })
        monoTexts(rail, named, `${surface}:${key}`)
        lines.push(textOf(rail))
      }
      await ui.advance(110)
    }
    await ui.unmount()
  }
  return { named, lines, hasMono }
}

// #28: on 2.1.295 the pane went empty at the first prompt, when the first connector was drawn with `mono`.
test('on an engine before 2.1.299 nothing asks for the monospaced face, and the connectors still run', async ($, on) => {
  const { named, lines } = await facesAt($, on, '2.1.295')
  expect(named).toEqual([])
  // Both connectors, on both surfaces, every frame: still animated, still clipped at 64 from 68 cells.
  expect(lines.length).toBe(2 * 2 * 3)
  expect(lines.every(l => cellsOf(l) === 64 + 4 && /^[─●•┬┴]+$/.test(l))).toBe(true)
  expect(lines.some(l => /[●•]/.test(l))).toBe(true)
})

test('an engine that will not say its version gets no monospaced face either', async ($, on) => {
  expect((await facesAt($, on, null)).named).toEqual([])
})

test('with motion off, the still connector is drawn without the face before 2.1.299', { options: { motion: 'off' } }, async ($, on) => {
  const { named, lines } = await facesAt($, on, '2.1.295')
  expect(named).toEqual([])
  expect(lines.length).toBe(2 * 2 * 3)
})

test('with motion off, the still connector keeps the face from 2.1.299', { plugins: [monoProbe], options: { motion: 'off' } }, async ($, on) => {
  // An engine running the tests that predates the face refuses it: there, one of that age, and no face.
  const { named, lines, hasMono } = await facesAt($, on, kit => (kit ? '2.1.299' : '2.1.295'))
  expect(lines.length).toBe(2 * 2 * 3)
  expect(named.length).toBe(hasMono ? lines.length : 0)
})

// ---------------------------------------------------------------- external feed

test('parseFeed validates types, caps gem at 2, clamps pct 0-100, and rejects bad JSON', () => {
  const good = parseFeed(
    JSON.stringify({
      task: 'step 2/4 build feed',
      cwd: '~/Claude',
      branch: 'yu*',
      ds_cny: 57.7,
      extra: 'ignored',
      gem: [
        { label: 'gem pro', pct: 38, resets_at: '1970-01-01T03:10:00.000Z' },
        { label: 'gem flash', pct: 120, resets_at: 'bad-date' },
        { label: 'gem third', pct: 50 },
      ],
    }),
    1234,
  )
  expect(good).toEqual({
    task: 'step 2/4 build feed',
    cwd: '~/Claude',
    branch: 'yu*',
    dsCny: 57.7,
    gem: [
      { label: 'gem pro', pct: 38, resetsAt: 11_400_000 },
      { label: 'gem flash', pct: 100, resetsAt: null },
    ],
    at: 1234,
  })
  expect(parseFeed('not json')).toBeNull()
  expect(parseFeed('[]')).toBeNull()
  expect(parseFeed('null')).toBeNull()
  expect(
    parseFeed(
      JSON.stringify({
        task: 42,
        cwd: null,
        branch: {},
        ds_cny: '57.7',
        gem: ['bad', { label: '', pct: 10 }, { label: 'ok', pct: 'x' }, { label: 'neg', pct: -5 }],
      }),
    ),
  ).toEqual({
    task: '',
    cwd: '',
    branch: '',
    dsCny: null,
    gem: [{ label: 'neg', pct: 0, resetsAt: null }],
    at: 0,
  })
  expect([
    parseFeedCommand(''),
    parseFeedCommand('not json'),
    parseFeedCommand('{}'),
    parseFeedCommand('[]'),
    parseFeedCommand('["", "a"]'),
    parseFeedCommand('[123]'),
    parseFeedCommand('["node", "feed.mjs"]'),
  ]).toEqual([[], [], [], [], [], [], ['node', 'feed.mjs']])
})

test('external feed polls on start and every 30s, keeps last good on error, skips overlap, and renders in main panel', { options: { feedCommand: '["feed-cmd","--json"]', panels: 'main,architect,gate,agents,loops,receipt,log' } }, async ($, on) => {
  const clock = engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.id', () => ({ value: 'sess-1' }))
  on('session.cwd', () => ({ value: '/work/proj' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))

  const calls: { argv: string[]; stdin?: string; timeoutMs?: number }[] = []
  let mode: 'good' | 'fail' | 'bad-json' | 'empty-fields' | 'hang' = 'good'
  let releaseHang: () => void = () => {}
  on('process.run', async (_$, e) => {
    calls.push({ argv: [...e.argv], stdin: e.init?.stdin, timeoutMs: e.init?.timeoutMs })
    if (mode === 'fail') return { value: { exitCode: 1, stdout: '', stderr: 'err' } } as never
    if (mode === 'bad-json') return { value: { exitCode: 0, stdout: '{oops', stderr: '' } } as never
    if (mode === 'empty-fields') return { value: { exitCode: 0, stdout: '{}', stderr: '' } } as never
    if (mode === 'hang') {
      await new Promise<void>(resolve => {
        releaseHang = resolve
      })
      return { value: { exitCode: 0, stdout: JSON.stringify({ ds_cny: 12.5 }), stderr: '' } } as never
    }
    return {
      value: {
        exitCode: 0,
        stdout: JSON.stringify({
          task: 'step 2/4 build feed',
          cwd: '~/Claude',
          branch: 'yu*',
          ds_cny: 57.7,
          gem: [
            { label: 'gem pro', pct: 85, resets_at: new Date(109 * 60_000).toISOString() },
            { label: 'gem fl', pct: 38, resets_at: new Date(65 * 60_000).toISOString() },
          ],
        }),
        stderr: '',
      },
    } as never
  })

  await $.session.start({ cwd: '/work/proj', surface: 'terminal', isInteractive: true })
  expect(calls.length).toBe(1)
  expect(calls[0]?.argv).toEqual(['feed-cmd', '--json'])
  expect(calls[0]?.timeoutMs).toBe(20_000)
  expect(JSON.parse(calls[0]?.stdin ?? '{}')).toEqual({
    session_id: 'sess-1',
    cwd: '/work/proj',
    model: { display_name: 'Opus 5.5' },
  })

  // Renders line A and line B at >= 58 with `↻ 1h49m`; narrow omits reset time and drops pieces cleanly.
  const ui = await $.ui.mount({ ...pane(70), surface: 'terminal' })
  expect(await ui.find({ text: /DS ¥57\.7/ })).toBeDefined()
  expect(await ui.find({ text: /85% ↻ 1h49m/ })).toBeDefined()
  expect(await ui.find({ text: /38% ↻ 1h05m/ })).toBeDefined()
  const gauges = await ui.findAll({ type: 'Text', text: /^▰+$/ })
  expect(gauges.map(g => g.props.color)).toEqual(['error', 'claude'])
  expect(await ui.find({ text: /step 2\/4 build feed/ })).toBeDefined()
  expect(await ui.find({ text: /^~\/Claude$/ })).toBeDefined()
  expect(await ui.find({ text: /^yu\*$/, color: 'claude' })).toBeDefined()
  expect(await ui.find({ text: /^pro / })).toBeDefined() // `gem pro` cut to the meter's 3-cell name
  expect(await ui.find({ text: /^agy$/ })).toBeDefined()
  await ui.unmount()

  // Below 58 columns, gem keeps its gauge and percent without the reset marker.
  const narrow = await $.ui.mount({ ...pane(57), surface: 'terminal' })
  expect(await narrow.find({ text: /85%/ })).toBeDefined()
  expect(await narrow.find({ text: /↻/ })).toBeUndefined()
  await narrow.unmount()

  // Width check across surfaces and placements (mini remains unchanged).
  const failures: string[] = []
  for (const surface of ['terminal', 'desktop'] as const) {
    for (const cols of [24, 32, 40, 64, 120]) {
      for (const placement of ['dock', 'inline'] as const) {
        const checkUi = await $.ui.mount({ ...pane(cols), props: { ...pane(cols).props, placement }, surface })
        for (const s of spillsOf(await checkUi.drawn(), cols)) failures.push(`${surface} ${placement} ${cols}: ${s}`)
        for (const f of desktopFaults(await checkUi.drawn(), [])) failures.push(`${surface} ${placement} ${cols}: ${f}`)
        if (placement === 'inline') expect(await checkUi.find({ text: /DS ¥57\.7/ })).toBeUndefined()
        await checkUi.unmount()
      }
    }
  }
  expect(failures).toEqual([])

  // Failure and bad JSON keep the last good value.
  mode = 'fail'
  await clock.advance(30_000)
  expect(calls.length).toBe(2)
  mode = 'bad-json'
  await clock.advance(30_000)
  expect(calls.length).toBe(3)
  const kept = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await kept.find({ text: /DS ¥57\.7/ })).toBeDefined()
  await kept.unmount()

  // Never run two at once: a tick while one is in flight is skipped.
  mode = 'hang'
  await clock.advance(30_000)
  expect(calls.length).toBe(4)
  await clock.advance(30_000)
  expect(calls.length).toBe(4) // skipped while in flight
  releaseHang()
  await Promise.resolve()
  await Promise.resolve()

  const updated = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await updated.find({ text: /DS ¥12\.5/ })).toBeDefined()
  await updated.unmount()

  // Empty fields omit both feed lines.
  mode = 'empty-fields'
  await clock.advance(30_000)
  const emptyUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await emptyUi.find({ text: /DS ¥/ })).toBeUndefined()
  await emptyUi.unmount()
})

test('when feedCommand is empty, no process is run and no feed lines render', { options: { panels: 'main,architect,gate,agents,loops,receipt,log' } }, async ($, on) => {
  const clock = engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  let ran = 0
  on('process.run', () => {
    ran += 1
    return { value: { exitCode: 0, stdout: '{"ds_cny":10}', stderr: '' } } as never
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(60_000)
  expect(ran).toBe(0)
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /DS ¥/ })).toBeUndefined()
  await ui.unmount()
})

// ---------------------------------------------------------------- consult ring

const ARROWS = new Set(['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'])

const expected8WayArrow = (vx: number, vy: number): string => {
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

const gridMatrix = (grid: ReturnType<typeof buildConsultGrid>): string[][] => {
  const buf = Array.from({ length: grid.height }, () => Array.from({ length: grid.width }, () => ' '))
  for (let y = 0; y < grid.rows.length; y += 1) {
    for (const r of grid.rows[y] ?? []) {
      const chs = [...r.text]
      for (let k = 0; k < chs.length; k += 1) {
        if (r.x + k >= 0 && r.x + k < grid.width) buf[y]![r.x + k] = chs[k]!
      }
    }
  }
  return buf
}

test('ringLayout fits 3, 7 and 10 nodes cleanly without overlap and connects spokes & clockwise arcs', () => {
  for (const n of [3, 7, 10]) {
    const rows = n <= 6 ? 11 : 13
    for (const cols of [40, 62, 116]) {
      const nodes = Array.from({ length: n }, (_, i) => {
        const label = `● eng${i} ${10 + i}s`
        return { label, width: cellWidth(label) }
      })
      const L = ringLayout(nodes, cols, rows)
      expect(L.rows).toBe(rows)
      expect(L.nodes.length).toBe(n)
      // Angles start at top (0) and advance clockwise.
      expect(L.nodes[0]?.angle).toBe(0)
      expect(L.nodes[0]?.labelY).toBe(0)
      for (let i = 1; i < n; i += 1) expect(L.nodes[i]!.angle).toBeGreaterThan(L.nodes[i - 1]!.angle)

      // Fit inside 1-cell side margins, right-aligned on left half, left-aligned on right half, no centre overlap.
      for (const nd of L.nodes) {
        expect(nd.labelX >= 1 && nd.labelX + nd.width <= cols - 1).toBe(true)
        expect(nd.labelY >= 0 && nd.labelY < rows).toBe(true)
        if (nd.align === 'left') expect(nd.labelX).toBeGreaterThan(nd.anchorX)
        if (nd.align === 'right') expect(nd.labelX + nd.width - 1).toBeLessThan(nd.anchorX)
        const overlapsCentre =
          nd.labelY >= L.centre.y &&
          nd.labelY < L.centre.y + L.centre.height &&
          !(nd.labelX + nd.width <= L.centre.x || nd.labelX >= L.centre.x + L.centre.width)
        expect(overlapsCentre).toBe(false)
      }

      // No two labels overlap.
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          const a = L.nodes[i]!
          const b = L.nodes[j]!
          if (a.labelY === b.labelY) {
            expect(a.labelX + a.width <= b.labelX || b.labelX + b.width <= a.labelX).toBe(true)
          }
        }
      }

      // Every spoke fits, stays clear of labels, and ends next to centre with an arrowhead pointing at it.
      expect(L.spokes.length).toBe(n)
      const cMidX = L.centre.x + (L.centre.width - 1) / 2
      const cMidY = L.centre.y + (L.centre.height - 1) / 2
      const usedArrows = new Set<string>()
      for (const sp of L.spokes) {
        expect(sp.length).toBeGreaterThan(0)
        for (let k = 0; k < sp.length - 1; k += 1) expect(sp[k]!.glyph).toBe('·')
        const last = sp[sp.length - 1]!
        expect(ARROWS.has(last.glyph)).toBe(true)
        expect(usedArrows.has(`${last.x},${last.y}`)).toBe(false)
        usedArrows.add(`${last.x},${last.y}`)
        const dx =
          last.x < L.centre.x
            ? L.centre.x - last.x
            : last.x >= L.centre.x + L.centre.width
              ? last.x - (L.centre.x + L.centre.width - 1)
              : 0
        const dy =
          last.y < L.centre.y
            ? L.centre.y - last.y
            : last.y >= L.centre.y + L.centre.height
              ? last.y - (L.centre.y + L.centre.height - 1)
              : 0
        expect(Math.max(dx, dy)).toBe(1)
        // Arrowhead points toward hub centre (8-way rounded).
        expect(last.glyph).toBe(expected8WayArrow(cMidX - last.x, cMidY - last.y))
        for (const c of sp) {
          expect(c.x >= 0 && c.x < cols && c.y >= 0 && c.y < rows).toBe(true)
          for (const nd of L.nodes) {
            expect(c.y === nd.labelY && c.x >= nd.labelX && c.x < nd.labelX + nd.width).toBe(false)
          }
        }
      }

      // Ring arcs connect neighbours clockwise with arrowheads.
      expect(L.arcs.length).toBe(n)
      for (let i = 0; i < n; i += 1) {
        const arc = L.arcs[i]!
        const curr = L.nodes[i]!
        const next = L.nodes[(i + 1) % n]!
        expect(arc.length).toBeGreaterThan(0)
        expect(arc[0]!.x === curr.anchorX && arc[0]!.y === curr.anchorY).toBe(true)
        const end = arc[arc.length - 1]!
        expect(Math.max(Math.abs(end.x - next.anchorX), Math.abs(end.y - next.anchorY))).toBeLessThanOrEqual(1)
        expect(arc.some(c => ARROWS.has(c.glyph))).toBe(true)
        for (let k = 1; k < arc.length; k += 1) {
          const prev = arc[k - 1]!
          const cur = arc[k]!
          expect(Math.max(Math.abs(cur.x - prev.x), Math.abs(cur.y - prev.y))).toBeLessThanOrEqual(1)
        }
      }
    }
  }
})

test('consult ring spokes use straight · lines, unique 8-way arrowheads, and hub rounded box', () => {
  for (const n of [4, 6, 7, 9, 10]) {
    const rows = n <= 6 ? 11 : 13
    for (const cols of [36, 42, 60, 66, 116]) {
      const nodes = Array.from({ length: n }, (_, i) => {
        const glyph = '●'
        const name = `engine${i}`
        const dur = `${10 + i}s`
        const label = `${glyph} ${name} ${dur}`
        return { label, width: cellWidth(label), glyph, name, dur }
      })
      const L = ringLayout(nodes, cols, rows)
      const cMidX = L.centre.x + (L.centre.width - 1) / 2
      const cMidY = L.centre.y + (L.centre.height - 1) / 2
      const arrowCells = new Set<string>()

      for (let i = 0; i < n; i += 1) {
        const sp = L.spokes[i]!
        const nd = L.nodes[i]!
        expect(sp.length).toBeGreaterThanOrEqual(2)
        expect(sp[0]!.x === nd.anchorX && sp[0]!.y === nd.anchorY).toBe(true)
        const bodyArrows = sp.slice(0, -1).filter(c => c.glyph !== '·')
        expect(bodyArrows).toEqual([])
        for (let k = 1; k < sp.length; k += 1) {
          expect(Math.max(Math.abs(sp[k]!.x - sp[k - 1]!.x), Math.abs(sp[k]!.y - sp[k - 1]!.y))).toBeLessThanOrEqual(1)
        }
        const arrows = sp.filter(c => ARROWS.has(c.glyph))
        expect(arrows.length).toBe(1)
        const last = sp[sp.length - 1]!
        expect(arrows[0]).toBe(last)
        expect(last.glyph).toBe(expected8WayArrow(cMidX - last.x, cMidY - last.y))
        const key = `${last.x},${last.y}`
        expect(arrowCells.has(key)).toBe(false)
        arrowCells.add(key)

        // No spoke overlaps hub box or any label.
        for (const c of sp) {
          const inBox =
            c.x >= L.centre.x &&
            c.x < L.centre.x + L.centre.width &&
            c.y >= L.centre.y &&
            c.y < L.centre.y + L.centre.height
          expect(inBox).toBe(false)
          for (const other of L.nodes) {
            expect(c.y === other.labelY && c.x >= other.labelX && c.x < other.labelX + other.width).toBe(false)
          }
        }
      }
    }
  }

  // Consult hub: 3-row rounded box in C.main, bold MAIN; queued = faint dots without arrowhead; running = dim dots.
  const cRun = parseConsult(
    JSON.stringify({
      run: {
        v: 1,
        id: 'hub-1',
        pid: 1,
        kind: 'all',
        startedAt: 10_000,
        endedAt: null,
        question: 'Q?',
        round: 1,
        rounds: 1,
        engines: [
          { name: 'copilot', state: 'ok', startedAt: 10_000, endedAt: 20_000, reason: null, note: null },
          { name: 'gemini', state: 'running', startedAt: 22_000, endedAt: null, reason: null, note: null },
          { name: 'codex', state: 'queued', startedAt: null, endedAt: null, reason: null, note: null },
          { name: 'deepseek', state: 'failed', startedAt: 10_000, endedAt: 15_000, reason: 'err', note: null },
        ],
        summary: null,
      },
      locks: {},
    }),
  )!.run!
  const grid = buildConsultGrid(cRun, 60, PALETTES.theme, 34_000)
  const mat = gridMatrix(grid)
  const cx = grid.layout.centre
  expect([cx.width, cx.height]).toEqual([8, 3])
  expect(mat[cx.y]!.slice(cx.x, cx.x + cx.width).join('')).toBe('╭──────╮')
  expect(mat[cx.y + 1]!.slice(cx.x, cx.x + cx.width).join('')).toBe('│ MAIN │')
  expect(mat[cx.y + 2]!.slice(cx.x, cx.x + cx.width).join('')).toBe('╰──────╯')
  const mainRun = (grid.rows[cx.y + 1] ?? []).find(r => r.text === 'MAIN')
  expect(mainRun?.color).toBe(PALETTES.theme.main)
  expect(mainRun?.bold).toBe(true)
  // Queued spoke (index 2): faint dots, no arrowhead.
  const qSpoke = grid.layout.spokes[2]!
  const qLast = qSpoke[qSpoke.length - 1]!
  expect(mat[qLast.y]![qLast.x]).toBe('·')
  const qRun = (grid.rows[qLast.y] ?? []).find(r => qLast.x >= r.x && qLast.x < r.x + cellWidth(r.text))
  expect(qRun?.color).toBe(PALETTES.theme.faint)
  // Running spoke (index 1): dim body dots + animated path.
  const rSpoke = grid.layout.spokes[1]!
  const rBody = rSpoke[0]!
  const rRun = (grid.rows[rBody.y] ?? []).find(r => rBody.x >= r.x && rBody.x < r.x + cellWidth(r.text))
  expect(rRun?.color).toBe(PALETTES.theme.dim)
})

test('consult ring keeps mirror symmetry, 1-cell side margins, and drops duration before truncating name', () => {
  for (const n of [4, 6, 7, 9, 10]) {
    const rows = n <= 6 ? 11 : 13
    for (const cols of [42, 60, 70, 116]) {
      const nodes = Array.from({ length: n }, (_, i) => {
        const glyph = '●'
        const name = 'engine'
        const dur = '12s'
        const label = `${glyph} ${name} ${dur}`
        return { label, width: cellWidth(label), glyph, name, dur }
      })
      const L = ringLayout(nodes, cols, rows)
      // Aspect ratio rx ≈ 2.2 · ry is the minimum when width does not clamp.
      if (cols >= 46) expect(L.rx / L.ry).toBeGreaterThanOrEqual(1.9)
      for (let i = 1; i < n / 2; i += 1) {
        const r = L.nodes[i]!
        const l = L.nodes[n - i]!
        expect(r.anchorY).toBe(l.anchorY)
        expect(r.labelY).toBe(l.labelY)
        expect(r.anchorX + l.anchorX).toBe(2 * L.centre.x + L.centre.width - 1)
        expect(r.anchorX + l.anchorX).toBe(cols - 1)
        if (r.width === l.width) expect(l.labelX).toBe(cols - 1 - (r.labelX + r.width - 1))
      }
      for (const nd of L.nodes) {
        expect(nd.labelX).toBeGreaterThanOrEqual(1)
        expect(nd.labelX + nd.width).toBeLessThanOrEqual(cols - 1)
      }
    }
  }

  // Tight width (46 cols -> inner 42): drops duration first, then truncates name with …, keeping 1-cell side margins.
  const run9 = parseConsult(
    JSON.stringify({
      run: {
        v: 1,
        id: 't1',
        pid: 1,
        kind: 'all',
        startedAt: 10_000,
        endedAt: null,
        question: '',
        round: 1,
        rounds: 1,
        engines: [
          { name: 'copilot', state: 'ok', startedAt: 10_000, endedAt: 20_000, reason: null, note: null },
          { name: 'codex', state: 'skipped', startedAt: null, endedAt: null, reason: 'locked', note: null },
          { name: 'deepseek', state: 'ok', startedAt: 10_000, endedAt: 34_000, reason: null, note: null },
          { name: 'agy', state: 'running', startedAt: 3_000, endedAt: null, reason: null, note: null },
          { name: 'nim', state: 'failed', startedAt: 10_000, endedAt: 28_000, reason: 'err', note: null },
          { name: 'openrouter', state: 'queued', startedAt: null, endedAt: null, reason: null, note: null },
          { name: 'opencode', state: 'running', startedAt: 12_000, endedAt: null, reason: null, note: null },
          { name: 'azure', state: 'ok', startedAt: 10_000, endedAt: 19_000, reason: null, note: null },
          { name: 'gemini', state: 'queued', startedAt: null, endedAt: null, reason: null, note: null },
        ],
        summary: null,
      },
      locks: {},
    }),
  )!.run!
  const g42 = buildConsultGrid(run9, 42, PALETTES.theme, 34_000)
  for (const nd of g42.layout.nodes) {
    expect(nd.labelX).toBeGreaterThanOrEqual(1)
    expect(nd.labelX + nd.width).toBeLessThanOrEqual(41)
  }
  // azure (index 7): drops 9s -> full name "● azure" fits in 7 cells.
  expect(g42.layout.nodes[7]!.label).toBe('● azure')
  // deepseek (index 2): drops 24s, then truncates name with ….
  expect(g42.layout.nodes[2]!.label).toMatch(/^● deep.*…$/)
  expect(g42.layout.nodes[2]!.label).not.toContain('24s')
})

test('ring spokes never share or touch cells except neighbouring arrowheads, at 46 and 70 cols', () => {
  for (const n of [4, 6, 7, 9, 10]) {
    for (const cols of [46, 70]) {
      const nodes = Array.from({ length: n }, (_, i) => {
        const label = `● engine${i} 12s`
        return { label, width: cellWidth(label) }
      })
      const L = ringLayout(nodes, cols, n <= 6 ? 11 : 13)
      for (let i = 0; i < n; i += 1) {
        const sp = L.spokes[i]!
        expect(sp.length).toBeGreaterThanOrEqual(2)
        const from = sp[0]!
        const to = sp[sp.length - 1]!
        const dx = to.x - from.x
        const dy = to.y - from.y
        // All raster cells stay within one cell of their own straight line.
        for (const p of sp) {
          expect(Math.abs((p.x - from.x) * dy - (p.y - from.y) * dx)).toBeLessThanOrEqual(Math.max(Math.abs(dx), Math.abs(dy)))
        }
        for (let j = i + 1; j < n; j += 1) {
          const other = L.spokes[j]!
          for (let a = 0; a < sp.length; a += 1) {
            for (let b = 0; b < other.length; b += 1) {
              const d = Math.abs(sp[a]!.x - other[b]!.x) + Math.abs(sp[a]!.y - other[b]!.y)
              const arrowPair = a === sp.length - 1 && b === other.length - 1
              expect(d > 1 || (d === 1 && arrowPair)).toBe(true)
            }
          }
        }
      }
      for (let i = 1; i < n / 2; i += 1) {
        expect(L.spokes[n - i]).toEqual(L.spokes[i]!.map(p => ({
          x: cols - 1 - p.x,
          y: p.y,
          glyph: p.glyph === '·' ? '·' : expected8WayArrow(p.x - (cols - 1) / 2, L.cy - p.y),
        })))
      }
      if (n >= 6) {
        // The first upper diagonals meet the top corners, not the side rows.
        for (const i of [1, n - 1]) expect(L.spokes[i]![L.spokes[i]!.length - 1]!.y).toBe(L.centre.y - 1)
      }
    }
  }
})

test('wide ring radius grows with room after the longest side labels and keeps their margins', () => {
  for (const n of [4, 6, 7, 9, 10]) {
    const nodes = Array.from({ length: n }, (_, i) => {
      const label = `● engine${i} 12s`
      return { label, width: cellWidth(label) }
    })
    const narrow = ringLayout(nodes, 46, n <= 6 ? 11 : 13)
    const wide = ringLayout(nodes, 70, n <= 6 ? 11 : 13)
    expect(wide.rx).toBeGreaterThan(narrow.rx)
    expect(wide.rx).toBe(19)
    for (const nd of wide.nodes) {
      expect(nd.label).toBe(nodes[wide.nodes.indexOf(nd)]!.label)
      expect(nd.labelX).toBeGreaterThanOrEqual(1)
      expect(nd.labelX + nd.width).toBeLessThanOrEqual(69)
    }
  }
})

test('consult grid has no blank first or last drawing row; debate includes its dim centred caption', () => {
  for (const n of [4, 6, 7, 9, 10]) {
    const engines = Array.from({ length: n }, (_, i) => ({ name: `engine${i}`, state: 'ok', startedAt: 10_000, endedAt: 22_000 }))
    for (const cols of [46, 70]) {
      for (const round of [1, 2]) {
        const run = parseConsult(JSON.stringify({ run: makeRun({ engines, round, rounds: 3 }), locks: {} }))!.run!
        const grid = buildConsultGrid(run, cols, PALETTES.theme, 34_000)
        expect(grid.rows.length).toBe(grid.height)
        expect(grid.rows[0]!.length).toBeGreaterThan(0)
        expect(grid.rows[grid.height - 1]!.length).toBeGreaterThan(0)
        const captions = grid.rows.flat().filter(r => r.text === 'answers pass round the ring')
        expect(captions.length).toBe(round === 2 ? 1 : 0)
        if (round === 2) {
          const caption = captions[0]!
          expect(grid.rows[grid.height - 1]).toEqual([caption])
          expect(grid.rows[grid.height - 2]!.length).toBeGreaterThan(0)
          expect(caption.x).toBe(Math.floor((cols - cellWidth(caption.text)) / 2))
          expect(caption.color).toBe(PALETTES.theme.dim)
          expect(caption.dim).toBe(true)
          expect(grid.paths.some(path => path.cells.some(p => p.y === grid.height - 1))).toBe(false)
        }
      }
    }
  }
})

test('debate ring has 4-row hub, clockwise arrows, and closed 8-connected loop except where labels cut it', () => {
  const arrowAngle = (g: string) => ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'].indexOf(g) * 45

  for (const n of [4, 6, 7, 9, 10]) {
    for (const skipSome of [false, true]) {
      const engines = Array.from({ length: n }, (_, i) => ({
        name: `eng${i}`,
        state: skipSome && i === 1 ? 'skipped' : i % 2 === 0 ? 'ok' : 'running',
        startedAt: 10_000,
        endedAt: i % 2 === 0 ? 20_000 : null,
        reason: null,
        note: null,
      }))
      const run = parseConsult(
        JSON.stringify({
          run: { v: 1, id: 'd', pid: 1, kind: 'debate', startedAt: 10_000, endedAt: null, question: '', round: 2, rounds: 3, engines, summary: null },
          locks: {},
        }),
      )!.run!
      const grid = buildConsultGrid(run, 60, PALETTES.theme, 34_000)
      const mat = gridMatrix(grid)
      const cx = grid.layout.centre
      expect(cx.height).toBe(4)
      expect(mat[cx.y]!.slice(cx.x, cx.x + cx.width).join('')).toMatch(/^╭─+╮$/)
      expect(mat[cx.y + 1]!.slice(cx.x, cx.x + cx.width).join('')).toMatch(/^│ +MAIN +│$/)
      expect(mat[cx.y + 2]!.slice(cx.x, cx.x + cx.width).join('')).toMatch(/^│ +⟳ R2\/3 +│$/)
      expect(mat[cx.y + 3]!.slice(cx.x, cx.x + cx.width).join('')).toMatch(/^╰─+╯$/)

      const isLabel = (x: number, y: number) =>
        grid.layout.nodes.some(nd => y === nd.labelY && x >= nd.labelX && x < nd.labelX + nd.width)
      const inBox = (x: number, y: number) => x >= cx.x && x < cx.x + cx.width && y >= cx.y && y < cx.y + cx.height

      // No stray cells (spokes) outside labels, hub box, ellipse loop, and caption.
      const loop = grid.layout.arcs.flat()
      const loopSet = new Set(loop.map(p => `${p.x},${p.y}`))
      expect(grid.rows[grid.height - 1]![0]!.text).toBe('answers pass round the ring')
      for (let y = 0; y < grid.height - 1; y += 1) {
        for (let x = 0; x < grid.width; x += 1) {
          const ch = mat[y]![x]!
          if (ch !== ' ' && !isLabel(x, y) && !inBox(x, y)) {
            expect(loopSet.has(`${x},${y}`)).toBe(true)
            expect(ch === '·' || ARROWS.has(ch)).toBe(true)
          }
        }
      }

      // Full ellipse is 8-connected; rendered visible cells form a closed 8-connected loop except where labels cut it.
      const drawnArrows: { x: number; y: number; g: string; ang: number }[] = []
      const cMidX = cx.x + (cx.width - 1) / 2
      const visibleIdx: number[] = []
      for (let k = 0; k < loop.length; k += 1) {
        const cur = loop[k]!
        const nxt = loop[(k + 1) % loop.length]!
        expect(Math.max(Math.abs(nxt.x - cur.x), Math.abs(nxt.y - cur.y))).toBeLessThanOrEqual(1)
        const ch = mat[cur.y]![cur.x]!
        if (isLabel(cur.x, cur.y)) {
          // Label cell is never overwritten by · or arrow.
          expect(ch === '·' || ARROWS.has(ch)).toBe(false)
        } else {
          expect(ch === '·' || ARROWS.has(ch)).toBe(true)
          visibleIdx.push(k)
          if (ARROWS.has(ch)) {
            const ang = (Math.atan2((cur.x - cMidX) / grid.layout.rx, -(cur.y - grid.layout.cy) / grid.layout.ry) * 180) / Math.PI
            const cwAng = (ang + 360) % 360
            drawnArrows.push({ x: cur.x, y: cur.y, g: ch, ang: cwAng })
          }
        }
      }
      for (let v = 0; v < visibleIdx.length; v += 1) {
        const i0 = visibleIdx[v]!
        const i1 = visibleIdx[(v + 1) % visibleIdx.length]!
        const p0 = loop[i0]!
        const p1 = loop[i1]!
        if (Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)) > 1) {
          for (let step = (i0 + 1) % loop.length; step !== i1; step = (step + 1) % loop.length) {
            expect(isLabel(loop[step]!.x, loop[step]!.y)).toBe(true)
          }
        }
      }

      // One arrow per participating neighbour pair, ordered clockwise and matching tangent direction.
      const partCount = engines.filter(e => e.state !== 'failed' && e.state !== 'skipped').length
      expect(drawnArrows.length).toBe(partCount)
      const cxMid = cx.x + (cx.width - 1) / 2
      for (let k = 0; k < drawnArrows.length; k += 1) {
        const a = drawnArrows[k]!
        if (k > 0) expect(a.ang).toBeGreaterThan(drawnArrows[k - 1]!.ang)
        const expected = expected8WayArrow(-(a.y - grid.layout.cy) / grid.layout.ry, (a.x - cxMid) / grid.layout.rx)
        expect(a.g).toBe(expected)
        // Arrow glyph angle roughly matches clockwise tangent (cwAng + 90 deg in screen atan2).
        const diff = Math.abs((((arrowAngle(a.g) - a.ang + 540) % 360) - 180))
        expect(diff).toBeLessThanOrEqual(45)
      }
    }
  }
})

const makeRun = (over: Record<string, unknown> = {}) => ({
  v: 1,
  id: '1000-42',
  pid: 42,
  kind: 'all',
  startedAt: 10_000,
  endedAt: null,
  question: 'Which architecture best separates the parser from IO?',
  round: 1,
  rounds: 1,
  engines: [
    { name: 'copilot:gpt-5', state: 'ok', startedAt: 10_000, endedAt: 22_000, reason: null, note: null },
    { name: 'gemini/pro', state: 'running', startedAt: 10_000, endedAt: null, reason: null, note: null },
    { name: 'codex', state: 'queued', startedAt: null, endedAt: null, reason: null, note: null },
    { name: 'deepseek', state: 'failed', startedAt: 10_000, endedAt: 15_000, reason: 'HTTP 502 from upstream', note: null },
    { name: 'qwen:very-long-model-name-here', state: 'skipped', startedAt: null, endedAt: null, reason: 'quota locked', note: null },
  ],
  summary: null,
  ...over,
})

test('consult probe parsing handles live, ended, stale, missing file and bad JSON', () => {
  const argv = consultProbe('python3', '/tmp/runs')
  expect(argv[0]).toBe('python3')
  expect(argv[3]).toBe('/tmp/runs')
  expect(argv[2]).toContain('os.kill')
  expect(argv[2]).toContain('consult-locks.json')

  const live = parseConsult(JSON.stringify({ run: makeRun(), locks: {} }))
  expect(live?.run?.stale).toBe(false)
  expect(isConsultLive(live)).toBe(true)
  expect(shortConsultEngine('copilot:gpt-5')).toBe('copilot')
  expect(shortConsultEngine('openrouter/deepseek:r1')).toBe('openrouter')
  expect(shortConsultEngine('superlongenginenamehere')).toBe('superlongen…')

  const ended = parseConsult(JSON.stringify({ run: makeRun({ endedAt: 50_000, summary: '3 ok · 1 failed · 1 skipped' }), locks: {} }))
  expect(ended?.run?.endedAt).toBe(50_000)
  expect(ended?.run?.stale).toBe(false)
  expect(isConsultLive(ended)).toBe(false)

  const stale = parseConsult(JSON.stringify({ run: makeRun({ stale: true }), locks: {} }))
  expect(stale?.run?.stale).toBe(true)
  expect(isConsultLive(stale)).toBe(false)

  const missing = parseConsult(JSON.stringify({ run: null, locks: {} }))
  expect(missing).toEqual({ run: null, locks: {} })
  expect(isConsultShown(missing, 100_000)).toBe(false)

  expect(parseConsult('not json')).toBeNull()
  expect(parseConsult('{oops')).toBeNull()
  expect(parseConsult('[]')).toBeNull()
  expect(parseConsult('null')).toBeNull()
  expect(parseConsult('{}')).toBeNull()
  expect(parseConsult(JSON.stringify({ run: 'bad', locks: {} }))).toBeNull()

  // Active vs expired locks
  const futureMs = new Date('2026-11-16T22:54:00').getTime()
  const pastMs = futureMs - 60_000
  const parsedLocks = parseConsult(
    JSON.stringify({
      run: null,
      locks: {
        codex: { until: new Date(futureMs).toISOString(), reason: 'rate limit', at: new Date(pastMs).toISOString() },
        old: { until: new Date(pastMs - 10_000).toISOString(), reason: 'old', at: new Date(pastMs - 20_000).toISOString() },
      },
    }),
  )
  const active = activeConsultLocks(parsedLocks?.locks ?? {}, futureMs - 30_000)
  expect(active).toEqual([{ engine: 'codex', hhmm: new Date(futureMs).toTimeString().slice(0, 5), reason: 'rate limit' }])
})

test('consult panel hides when empty or ended > 10 min ago, and uses narrow fallback below 40 cols or > 10 engines', async ($, on) => {
  const clock = engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  let payload = JSON.stringify({ run: null, locks: {} })
  on('process.run', () => ({ value: { exitCode: 0, stdout: payload, stderr: '' } }) as never)

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const emptyUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await emptyUi.find({ text: /CONSULT/ })).toBeUndefined()
  await emptyUi.unmount()

  // Ended run within 10 min is shown; past 10 min is hidden.
  const endedAt = 100_000
  await clock.advance(endedAt)
  payload = JSON.stringify({ run: makeRun({ endedAt, summary: 'all done' }), locks: {} })
  await clock.advance(15_000) // now = 115_000 (15s since ended)
  expect(isConsultShown(parseConsult(payload), endedAt + CONSULT_HIDE_AFTER_MS)).toBe(true)
  expect(isConsultShown(parseConsult(payload), endedAt + CONSULT_HIDE_AFTER_MS + 1)).toBe(false)

  const recentUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await recentUi.find({ text: /CONSULT · consult · R1\/1/ })).toBeDefined()
  expect(await recentUi.find({ text: /all done/ })).toBeDefined()
  await recentUi.unmount()

  await clock.advance(CONSULT_HIDE_AFTER_MS)
  const expiredUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await expiredUi.find({ text: /CONSULT/ })).toBeUndefined()
  await expiredUi.unmount()

  // Narrow fallback (< 40 cols) renders compact list without ring.
  const liveRun = makeRun({ startedAt: 700_000 })
  payload = JSON.stringify({ run: liveRun, locks: {} })
  await clock.advance(15_000)
  for (const cols of [24, 36]) {
    const narrow = await $.ui.mount({ ...pane(cols), surface: 'terminal' })
    expect(await narrow.find({ text: /CONSULT · consult · R1\/1/ })).toBeDefined()
    expect(await narrow.find({ key: 'consult-ring' })).toBeUndefined()
    expect(await narrow.find({ text: /^copilot$/ })).toBeDefined()
    expect(await narrow.find({ text: /MAIN/ })).toBeUndefined()
    await narrow.unmount()
  }

  // > 10 engines also triggers compact list even at 64 cols.
  const eleven = Array.from({ length: 11 }, (_, i) => ({
    name: `eng${i}`,
    state: i === 0 ? 'ok' : 'queued',
    startedAt: i === 0 ? 700_000 : null,
    endedAt: i === 0 ? 705_000 : null,
    reason: null,
    note: null,
  }))
  payload = JSON.stringify({ run: makeRun({ engines: eleven }), locks: {} })
  await clock.advance(2_000)
  const manyUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await manyUi.find({ key: 'consult-ring' })).toBeUndefined()
  expect(await manyUi.find({ text: /^eng10$/ })).toBeDefined()
  await manyUi.unmount()
})

test('consult panel renders consult and debate views, animates ring.tsx, polls 2s/15s, and handles stale, locks, faults & wide layout', { options: { consultDir: '/custom/consult-runs' } }, async ($, on) => {
  const clock = engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))

  const lockUntil = new Date('2026-11-16T22:54:00').getTime()
  const expectedHhmm = new Date(lockUntil).toTimeString().slice(0, 5)
  let pollCount = 0
  let lastDir = ''
  let mode: 'consult' | 'debate' | 'stale' | 'ended' | 'error' | 'hang' = 'consult'
  let releaseHang: () => void = () => {}

  on('process.run', async (_$, e) => {
    pollCount += 1
    lastDir = e.argv[3] ?? ''
    if (mode === 'error') return { value: { exitCode: 1, stdout: '', stderr: 'boom' } } as never
    if (mode === 'hang') {
      await new Promise<void>(resolve => {
        releaseHang = resolve
      })
      return { value: { exitCode: 0, stdout: '{bad', stderr: '' } } as never
    }
    const lockObj = { codex: { until: new Date(lockUntil).toISOString(), reason: '429', at: new Date(0).toISOString() } }
    if (mode === 'consult') {
      return {
        value: {
          exitCode: 0,
          stdout: JSON.stringify({
            run: makeRun({ startedAt: 10_000 }),
            locks: lockObj,
          }),
          stderr: '',
        },
      } as never
    }
    if (mode === 'debate') {
      return {
        value: {
          exitCode: 0,
          stdout: JSON.stringify({
            run: makeRun({
              kind: 'debate',
              round: 2,
              rounds: 3,
              startedAt: 10_000,
              engines: [
                { name: 'copilot', state: 'ok', startedAt: 10_000, endedAt: 18_000, reason: null, note: null },
                { name: 'gemini', state: 'running', startedAt: 10_000, endedAt: null, reason: null, note: null },
                { name: 'codex', state: 'queued', startedAt: null, endedAt: null, reason: null, note: null },
                { name: 'deepseek', state: 'failed', startedAt: 10_000, endedAt: 14_000, reason: 'timeout', note: null },
                { name: 'qwen', state: 'ok', startedAt: 10_000, endedAt: 19_000, reason: null, note: null },
                { name: 'claude', state: 'running', startedAt: 10_000, endedAt: null, reason: null, note: null },
              ],
            }),
            locks: lockObj,
          }),
          stderr: '',
        },
      } as never
    }
    if (mode === 'stale') {
      return {
        value: {
          exitCode: 0,
          stdout: JSON.stringify({ run: makeRun({ kind: 'first', stale: true }), locks: {} }),
          stderr: '',
        },
      } as never
    }
    return {
      value: {
        exitCode: 0,
        stdout: JSON.stringify({
          run: makeRun({
            kind: 'round2',
            round: 2,
            rounds: 2,
            endedAt: 55_000,
            summary: 'Consensus reached: separate parser from IO',
            engines: [
              { name: 'copilot', state: 'ok', startedAt: 10_000, endedAt: 22_000, reason: null, note: null },
              { name: 'gemini', state: 'ok', startedAt: 10_000, endedAt: 24_000, reason: null, note: null },
              { name: 'codex', state: 'ok', startedAt: 10_000, endedAt: 28_000, reason: null, note: null },
            ],
          }),
          locks: {},
        }),
        stderr: '',
      },
    } as never
  })

  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  expect(pollCount).toBe(1)
  expect(lastDir).toBe('/custom/consult-runs')

  // Verify buildConsultGrid spoke/arc rules directly.
  const cRun = parseConsult(JSON.stringify({ run: makeRun({ startedAt: 10_000 }), locks: {} }))!.run!
  const cGrid = buildConsultGrid(cRun, 60, PALETTES.theme, 15_000)
  expect(cGrid.paths.length).toBe(1) // only the running engine spoke is animated
  expect(cGrid.spinners.length).toBe(1)
  const flatC = cGrid.rows.flat().map(r => r.text).join('')
  expect(flatC).toContain('·') // queued dotted spoke
  // Failed (index 3) and skipped (index 4) have no spoke cells rendered.
  for (const idx of [3, 4]) {
    for (const c of cGrid.layout.spokes[idx] ?? []) {
      const hit = (cGrid.rows[c.y] ?? []).some(r => c.x >= r.x && c.x < r.x + cellWidth(r.text))
      expect(hit).toBe(false)
    }
  }

  // Consult view (round 1): animated ring, legend, question, failure reason, lock without emoji.
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ text: /CONSULT · consult · R1\/1/ })).toBeDefined()
  expect(await ui.find({ text: /^1\/5$/ })).toBeDefined()
  expect(await ui.find({ text: /“Which architecture best separates/ })).toBeDefined()
  expect(await ui.find({ text: /done/ })).toBeDefined()
  expect(await ui.find({ text: /deepseek: HTTP 502/ })).toBeDefined()
  expect(await ui.find({ text: new RegExp(`⊘ codex locked until ${expectedHhmm}`) })).toBeDefined()
  expect(await ui.find({ text: /🔒/ })).toBeUndefined()
  expect((await ui.find({ key: 'consult-ring' }))?.type).toBe('Client')

  // Client ring animates spinner (◐◓◑◒) and packet (●) across 110ms frames.
  const spinners = new Set<string>()
  const ringFrames: string[] = []
  for (let f = 0; f < 6; f += 1) {
    const ringTree = await ui.drawn({ in: 'consult-ring' })
    const txt = JSON.stringify(ringTree)
    ringFrames.push(txt)
    for (const ch of ['◐', '◓', '◑', '◒']) if (txt.includes(ch)) spinners.add(ch)
    await ui.advance(110)
  }
  expect(spinners.size).toBe(4)
  expect(new Set(ringFrames).size).toBeGreaterThan(2)
  await ui.unmount()

  // Live polling runs every 2s, and keeps last good state on error or bad JSON.
  const beforePoll = pollCount
  mode = 'error'
  await clock.advance(2_000)
  expect(pollCount).toBe(beforePoll + 1)
  mode = 'hang'
  await clock.advance(2_000)
  expect(pollCount).toBe(beforePoll + 2)
  await clock.advance(2_000)
  expect(pollCount).toBe(beforePoll + 2) // in-flight probe skipped
  releaseHang()
  await Promise.resolve()
  await Promise.resolve()

  // Still kept consult run after error/bad JSON!
  const keptUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await keptUi.find({ text: /CONSULT · consult · R1\/1/ })).toBeDefined()
  await keptUi.unmount()

  // Debate view (round 2/3): centre ⟳ R2/3, answers pass round the ring, clockwise arcs animate.
  mode = 'debate'
  await clock.advance(2_000)
  const debUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await debUi.find({ text: /CONSULT · debate · R2\/3/ })).toBeDefined()
  expect(await debUi.find({ text: /^answers pass round the ring$/ })).toBeDefined()
  const debRing = JSON.stringify(await debUi.drawn({ in: 'consult-ring' }))
  expect(debRing).toContain('⟳')
  expect(debRing).toContain('R2/3')
  expect(debRing).toContain('MAIN')
  await debUi.unmount()

  // Wide layout (W = 120): consult panel takes full width 120, not halved.
  const wideUi = await $.ui.mount({ ...pane(120), surface: 'terminal' })
  const consultTitle = await wideUi.find({ text: /CONSULT · debate · R2\/3/ })
  expect(consultTitle).toBeDefined()
  expect((await wideUi.find({ key: 'consult-ring' }))?.props.width).toBe(116)
  await wideUi.unmount()

  // Width check across 24..40, 64, 120 on terminal and desktop (including vscode static fallback).
  const failures: string[] = []
  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    for (const cols of [24, 32, 39, 40, 64, 120]) {
      const wUi = await $.ui.mount({ ...pane(cols), surface })
      const tree = await wUi.drawn()
      for (const s of spillsOf(tree, cols)) failures.push(`${surface} ${cols}: ${s}`)
      if (surface !== 'vscode') for (const f of desktopFaults(tree, [])) failures.push(`${surface} ${cols}: ${f}`)
      await wUi.unmount()
    }
  }
  expect(failures).toEqual([])

  // Static fallback on surface without Client (vscode) draws ◐ and no packet animation.
  const staticUi = await $.ui.mount({ ...pane(64), surface: 'vscode' })
  expect(await staticUi.find({ key: 'consult-ring' })).toBeUndefined()
  expect(await staticUi.find({ text: /^◐$/ })).toBeDefined()
  await staticUi.unmount()

  // Ended run stops live polling (switches to 15s) and shows summary.
  mode = 'ended'
  await clock.advance(2_000)
  const pAfterEnd = pollCount
  await clock.advance(4_000)
  expect(pollCount).toBe(pAfterEnd) // 2s ticks no longer fire
  await clock.advance(11_000)
  expect(pollCount).toBe(pAfterEnd + 1) // 15s tick fires

  const endUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await endUi.find({ text: /CONSULT · round 2 · R2\/2/ })).toBeDefined()
  expect(await endUi.find({ text: /Consensus reached: separate parser from IO/ })).toBeDefined()
  await endUi.unmount()

  // Stale run shows `stopped` in warn colour.
  mode = 'stale'
  await clock.advance(15_000)
  const staleUi = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await staleUi.find({ text: /CONSULT · first-wins · R1\/1/ })).toBeDefined()
  const stopped = await staleUi.find({ text: /^stopped$/ })
  expect(stopped?.props.color).toBe(PALETTES.theme.warn)
  await staleUi.unmount()
})

test('with motion off, consult ring draws static grid with ◐ and no Client', { options: { motion: 'off' } }, async ($, on) => {
  engine(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({ run: makeRun({ kind: 'debate', round: 2, rounds: 3 }), locks: {} }),
      stderr: '',
    },
  }) as never)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...pane(64), surface: 'terminal' })
  expect(await ui.find({ key: 'consult-ring' })).toBeUndefined()
  expect(await ui.find({ text: /^◐$/ })).toBeDefined()
  expect(await ui.find({ text: /^answers pass round the ring$/ })).toBeDefined()
  await ui.unmount()
  expect(faultKey('desktop', 'hooks/ring.tsx')).toBe('desktop:ring.tsx')
})
