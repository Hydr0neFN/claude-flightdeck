# Changelog

## 0.9.6

- The `agy` feed meters draw no reset timer (`↻`). The Claude 5h / weekly meters keep it.

## 0.9.5

- The external feed starts before `next(e)` and the resume seed in `session.start`, so its rows show with the pane instead of one start-up later (about 20 s). The first poll no longer blocks the start.

## 0.9.4

- The feed may carry four quota meters (`MAX_GEM`, was two), drawn as two `agy` rows of two. `feedLabel` keeps weekly and 5h apart: `gem`, `g5h`, `arg`, `cl`, `cl5`.

## 0.9.3

- The `work` box draws one row per consult run. Older consult calls with no bound run also matched the newest run, so one run showed as four `◎ consult` rows; the bound call now wins.

## 0.9.2

- The consult ring shows the whole model name under each engine (owner): the vendor path, `:free` and `-preview` are dropped (`shortModel`), and the name may take up to 26 cells on a pane of 56 columns or more. A narrow pane keeps the label width + 4 limit.

## 0.9.1

- Every `consult` ring spoke now aims its arrowhead directly into the 8-adjacent `MAIN` hub-border cell (`╭ ─ ╮ │ ╰ ╯`) it adjoins instead of following the spoke's last step direction, and queued engines keep their faint arrowhead so their spokes never end in a gap.
- When more side engines need the hub's left or right wall than its rows hold without 4-neighbouring arrowheads (such as 9- and 10-engine rings), the `MAIN` box grows taller with empty interior rows (e.g. a 5-row box with `MAIN` on the middle row) so each side engine ends straight on its own wall row with `→` / `←` instead of crowding below the corners.
- README: redrew the 60-column 9-engine `consult` ring example from a real render.

## 0.9.0

- The pane is one status picture: colour means status everywhere — running blue (`agent`), done green (`gate`), stopped and partial amber, failed and a dead runner red (`warn`), to-do and queued faint — and the role is written as text (`sub-main`, `farmer`, `helper`, `consult`). Glyphs follow the same states: `◐` running, `●`/`✓` done, `◑` stopped/partial, `✗` failed, `⊘` locked/dead, `○` to do. The header's `■ main ■ agents ■ gate` colour legend and the work tree's glyph legend line are gone.
- The header is `FLIGHTDECK · <model> · <glyph> <doing task id + title>` with main's elapsed on the right; with no plan, `FLIGHTDECK · <model> · idle|working`.
- The `main` card is a `╭ main ─…╮` frame with two status rows: `ctx` gauge, percent, tokens and effort; then the `5h`/`7d` windows with resets and session spend. The permission mode shows only when it is not the default, short (`bypass`). `cwd`, `last ttft`, `req`, the feed `task` row when a plan exists and the `tasks` strip row are gone. Below it, `plan <done>/<total>` and one row per mesh task with its title, the doing task's elapsed and `→ sub-main` when a sub-main's brief names it; a tight pane keeps the doing task and the next to-do rows, then `+N done`. Without mesh tasks the feed's `task` is one row.
- The `work` box is titled `running <N> · waiting <M>` and shows only live work, waiting work and work that ended under 60 s ago. A sub-main is a header row (`◐ sub-main · t4 tests`) with its workers in a `├ └` tree and one `N steps left: …` row; main's loose workers, a live consult (`◎ consult · 7 engines · 4/7`) and ended rows (`done 30s ago`; `failed …` in red) follow. A worker row is glyph, role, name, `▸ model` and elapsed. Ended rows leave after 60 s (`DONE_KEEP_MS`), failed rows stay until the next `turn.start`, and a running card with no event for 10 minutes or a job whose runner pid is gone draws `⊘ stale` and leaves after 60 s. Nothing to show and the box is not drawn.
- The `consult` ring draws every spoke as one continuous 8-connected stroke from its engine label to the arrowhead by the hub; side engines sit on the hub's middle row and their spoke is a straight horizontal line, and arrowheads of different spokes never sit in 4-neighbouring cells. One dim model row sits under each label (`engines[].model`, or the part after the first `:` in `agy:gemini-4-argon-high`), centred and truncated to the label's width + 4. A locked or skipped engine is red and keeps a faint broken spoke (`·  ·  ·`) ending in `⊘`; it shows no clock and no lock text (owner choice). The question draws only its first sentence (up to `:`, `.`, `?` or a newline) and only when it fits whole; the glyph legend is left out when the box has under 3 spare rows; an ended run draws one summary line (`✓ 8/9 answered · ⊘ codex`) and never its raw `[consult] mode: …` text.
- `ConsultEngine.model` is a new optional field, read from the run file; a `name` of the form `agy:gemini-4-argon-high` or `nim:nvidia/…` names its model after the first colon.
- `AgentCard.lastAt` records when an event last touched a card, so a running card with no event for 10 minutes turns `⊘ stale`.
- README: the panel table and the `main`, `work` and `consult` renders are redrawn from the new pane.

## 0.8.4

- Leaf glyphs in the `work` tree draw inside the `Button` as coloured `Text` (`agent` running, `gate` done, `amber` stopped/partial, `warn` failed, `faint` to-do).
- Done job clocks recover their real start time from the `-YYYYMMDD-HHMMSS` jobid suffix (local time), falling back to the earliest of `ts` and the probe's `job.log` / dir `mtime` (`jobStartOf`), instead of `0s`.
- `TaskStop` with a `task_id` ends the matching card (by id, name or description) as `stopped` (`◑`, amber) so stopped agents no longer stay `◐`.
- Ended leaves and collapsed done boxes drop from the tree 2 minutes (`DONE_KEEP_MS`) after their end (kept in probes and the turn receipt); `done` mesh tasks draw no row once their leaves drop, and when every task is done and nothing is live the body shows `all done · <N> tasks`.
- The work tree header draws `◐` while anything is live, `●` (gate colour) when every task is done and nothing is live, and `○` otherwise.

## 0.8.3

- Mesh task rows show their text again: the `task_*` tools name it `title`, and the parser read only `subject`, so a row drew as a bare `t2`.

## 0.8.2

- A worker line's clock sits at the right edge, in one column with its box header's clock.
- A live job row on the turn receipt uses the compact clock (`25s`, `1m12s`) like the work tree.

## 0.8.1

- Work tree clocks use the compact form (`16m`, `1m12s`, `1h05m`) in place of the card clock's `16:00`; the cards keep `m:ss`.
- Box bodies draw as a tree: `├` before an item with a later sibling, `└` before the last, `│` before the detail rows under a non-last item (`treePrefixes`). A sub-main box gets glyphs on every worker, plan step and `+N more` line; main's box on the workers under a task.

## 0.8.0

- New `work` panel: the whole delegation as one live tree rooted at main. Main's box (`WORK · main's tasks`) holds the mesh tasks with their workers, a box per sub-main and a closing line of the tasks still to do; a sub-main's box (`sub-main · t4`) starts with its checkpoint's last step and holds its workers and `open:` plan steps. Workers are farmer jobs, agy-job calls, consult runs (`◎ panel consult R1  5/7`) and Claude subagents that spawn nothing. Running first, then to-do, then at most two dimmed done lines, then `+N more`. The default `panels` becomes `main,work,consult,architect,loops,receipt` (`agents` stays valid).
- Every box has a strip — one glyph per unit (`●` done `◑` partial `✗` failed `◐` running `○` to do), at most 12 then `+N`, and `<done>/<total>`: mesh task items for main, checkpoint plan steps plus workers for a sub-main. Worker lines name their farmer model (`▸ Hydrogen xhigh`), keep a live clock, and a running leaf gets one `now · work` detail line from 56 columns; the selected leaf expands to its `stage`, `now`, `work`, `think`, `last`, `next` and `status`/`tests` rows. Ended leaves keep one line and a box whose work is all done collapses to its header line 60 s after the last end. The top `main` card gains one `tasks` row (`tasks  ●●◐○○ 2/5 ▸ t3 …`) whenever mesh tasks exist.
- The tree is fitted to the pane on every render (no cached layout): the other shown panels take their rows first and the tree gets the rest, dropping detail lines, dimmed done lines, to-do lines (into `+N more`) and nested box bodies until the pane's body height holds every panel. Below 56 columns detail lines are left out; below 40 every box is one line. Boxes nest two levels at most, indent one cell per level, and never wrap.
- Claude subagents' checkpoints reach the pane: the file is found from the brief (`report:` / `handoff:`, a `.handoffs/<name>.md` token, or `.handoffs/<agent name>.md` for a builder), or from an ended agent's `HANDOFF:` / `REPORT:` line, and a local python probe reads its last 8 KB every 10 s (`last ✔ step 2 jobs probe (exit 0)`, `next`, `open:` bullets, `status`, `tests`). A missing or >256 KB file leaves the rows out.
- The interim job lines are gone from the `agents` panel, which is cards and lanes again. A job the probe sees but no Bash call bound belongs to main; main's direct workers hang under the mesh task that was `doing` when they were issued, a sub-main's under its brief's `task:` line.
- Farmer jobs reach the pane. New option `jobsDir` (default `""` = `~/.claude/state/ds-jobs`) is read by a python probe (`jobsProbe`) every 3 s while a job is live and every 20 s otherwise: live jobs, and jobs whose `state.json` changed in the last 30 minutes, newest first, at most 8. A live job whose recorded pid is gone is marked `⊘`. Each job is a worker line in the tree, with one `now · work` detail line under a running one.
- Who issued what, as the pure exported model the tree reads: a `tool.call` Bash command running `ds-job.py run|batch`, `agy-job.py run` or `consult-cli.js` registers a pending job for its issuer (main, or the subagent whose call it was); the tool result's `jobid:` line binds the job dir, and a consult call binds the newest run file started after it. A job dir the probe sees but no call bound belongs to main. A sub-main's brief `task: t<N>` line and main's `doing` mesh item attribute work to its task.
- Live farmer rows with no model calls: the runner stage from `job.log` and `state.json` (`copy` from `copied N files`, `toolbox:`, `model` while a `trying` file has no result, `apply`, `check`, `handoff`), and `attempts` so a backend switch can draw `model ×2`. For an agy worker the conversation SQLite store is opened read-only and the latest tool call (`edit hooks/register.tsx`, `run npm test`), edited files, step and command counts and the last model thought come from its `steps` blobs; a locked, missing or unreadable db leaves those rows out. Other workers fall back to the newest work-tree file against `<jobdir>/base` and a count of changed files.
- `agy-job.py run` leaves (`◇`, a real repo with no scrubbed copy): bound from the Bash call itself (name `--job`, repo `--repo`, worker `--model`), live rows from the same agy reader matched by the real repo path, and `verify pending` while `~/.claude/state/agy-verify-pending/<job>.json` exists. No thought line: those jobs are private. The receipt counts them as a job, `free`.
- Turn receipt: jobs and consult panel runs started inside the turn now count. `last turn 4m12s · 0 agents · 2 jobs · 1 panel · 3 edits · 0 errors`, with one dim row per job (glyph, name, worker, duration, `12k→5k` tokens from the handoff `ds:` line, cost or `free`) and per consult run (`◎ panel debate R2  3/5 answered · 1 failed · 1m12s`), four job rows and two panel rows at most, then `+N more`; below 40 columns the summary alone. A receipt without jobs reads as before.
- Windows: probes try `python3`, then `python`, then `py -3` (cached); home is python's `expanduser("~")`; pid liveness uses `OpenProcess`/`GetExitCodeProcess` (259 = active) on Windows in `jobsProbe` and the existing `consultProbe`; a job's work tree is derived from its dir (`state.json`/`job.log`, else the tempdir) and matched in the agy store with `/` and JSON-escaped `\\` separators; every file is read as utf-8 with replacement.

## 0.7.0

- New `consult` panel (in `PANELS` after `architect`, full width in the wide layout) showing live external `consult-cli` runs as an ellipse of engines around `( MAIN )`, polling `consultDir` (default `~/.claude/state/consult-runs`) every 2 s while live and 15 s otherwise.
- Round 1 (`all`, `first`, `debate` R1) draws spokes from each engine into `MAIN` (animated packets while running, solid when done, faint dotted when queued, absent when failed/skipped); round 2+ (`debate`, `round2`) draws clockwise ring arcs between participating engines with `⟳ R2/3` under `MAIN` and `answers pass round the ring` below.
- New surface module `hooks/ring.tsx` animates running spinners (`◐◓◑◒`) and travelling packets every ~110 ms, falling back cleanly to a static grid when `motion` is off or `Client` faults/is absent.
- Below the ring: question line, legend (`● done  ◐ running  ○ queued  ✗ failed  ⊘ locked`), up to 3 failed/skipped reasons, active quota locks (`⊘ <engine> locked until HH:MM`), and end summary; hides automatically 10 min after ending, and falls back to a compact list below 40 columns or above 10 engines.

## 0.6.7 (yu)

- A finished job names the model whose work was kept (`state.json` `backend`), not its last attempt: a job that fell back to an agy last-resort model which failed showed that model. A card that just ended is probed once more.
- `backend:` and `jobdir:` lines are read also from Read-tool output with line numbers.
- New option `ctxBudget` (default 0; the owner's settings set 300000): the context gauge measures against it when it is smaller than the host's window. 0 = the host's window.

## 0.6.6 (yu)

- A resumed session fills the main box at start, not at its first request: the model (`$.session.model()`), the effort (`effortLevel`) and the permission mode (`permissions.defaultMode`) from the settings. The context gauge shows a local estimate (`~59k/400k`, no request sent) until the first response gives the real count, so you can see how full a resumed session is before you send anything.

## 0.6.5 (yu)

- An agent card names the model that does its work, not only the agent's own model. A wrapper agent that hands its job to a job runner (`ds-job.py`) shows `farmer ▸ Hydrogen`, `▸ Argon`, `▸ DS Flash`, `▸ GPT 6.1` and so on. The card reads the runner's `backend:` line, and while the job runs, the job dir's `trying` file (polled every 10 s), so a fallback to the next model shows. The expanded card shows the full backend label.
- The card shows that job's cost when its report gives `cost_cny_est` (`free` for a subscription quota, CNY at 0.14 USD, Azure in USD). The turn receipt adds `jobs +$0.05` (or `jobs free`) beside Claude's own spend; it follows the cards, so a job that ends after the turn still counts.

## 0.6.1

- On Claude Code before 2.1.299 the pane no longer empties, session log and all, once the first prompt is sent. Since 0.5.1 the connectors between panels asked for `Text`'s monospaced face (`mono`), which Claude Code has only from 2.1.299, and the first connector is drawn when a turn starts. Flightdeck now asks for that face only where `$.session.version()` reports 2.1.299 or later. Older versions draw the connectors in the default face, so on a graphical surface a running connector's right end may jitter again, as before 0.5.1. ([#29](https://github.com/scasella/claude-flightdeck/pull/29); [#28](https://github.com/scasella/claude-flightdeck/issues/28), thanks @Bexxs75 for tracing it to 0.5.1)
- Flightdeck needs Claude Code 2.1.289 or later, and the README now says so; it said 2.1.287. Since 0.5.0 Flightdeck hooks `ui.fault`, to draw a connector or clock that faulted as plain text, and that event came in 2.1.289. On 2.1.287 and 2.1.288 the session says `flightdeck: hooks module did not load: … "ui.fault" is not an event` and nothing of Flightdeck runs. ([#30](https://github.com/scasella/claude-flightdeck/pull/30))
- CI runs `claude plugin validate` and the tests on that floor, 2.1.289, as well as on 2.1.309, so a prop or event newer than the floor fails CI instead of a session. The tests that check the connectors' monospaced face ask the engine running them whether it draws that face. ([#30](https://github.com/scasella/claude-flightdeck/pull/30))

## 0.6.0

- Under a Team or Enterprise login, or on a machine with managed settings, the session no longer shows `flightdeck: its session.append hook was skipped`. The hook now takes only the response rows it reads, not the attachment, hook-context and compaction rows that Claude Code's built-in guard keeps from user plugins. ([#21](https://github.com/scasella/claude-flightdeck/pull/21), thanks @jeanfbrito; [#23](https://github.com/scasella/claude-flightdeck/issues/23), thanks @guglielmo)
- README: Troubleshooting says what that guard costs Flightdeck. It never runs a user plugin's `classic.*` or `session.compact` hooks, so the permission mode shows only from a subagent's start. ([#23](https://github.com/scasella/claude-flightdeck/issues/23))
- Under that guard, compactions are estimated rather than left at zero. Claude Code reports no context fill until the first response after a compaction, so a main-loop request that finds none after a response came back counts as one. The main box marks the count `↺~`, with `(estimated)` when there's room, and the log says `context compacted (estimated)`. Wherever `session.compact` runs, its count replaces the estimate. A rewind to the first prompt also counts. ([#23](https://github.com/scasella/claude-flightdeck/issues/23), thanks @guglielmo)
- A compaction that comes back skipped, vetoed by a plugin or a blocking `PreCompact` hook, is no longer counted in `↺` or logged as `context compacted`: the conversation stays as it was. ([#26](https://github.com/scasella/claude-flightdeck/pull/26))

## 0.5.1

- The main box's `last req` line shows only the time to first token. Its tokens per second divided the reported output tokens, which include thinking, by the time from the first streamed piece, so when thinking wasn't streamed it read thousands of tokens a second. It is gone rather than wrong. ([#19](https://github.com/scasella/claude-flightdeck/pull/19))
- On the desktop app the connector between panels no longer jitters at its right end while work runs. It is drawn in the surface's monospaced face, where its dashes and moving dot are each one cell, and clipped at its width. In a terminal it looks the same. ([#19](https://github.com/scasella/claude-flightdeck/pull/19))

## 0.5.0

- The context gauge, its `tokens/window` and the status line's `ctx N%` measure against the compaction window when the session compacts in a smaller one than the model's, whether `autoCompactWindow` (global or per model) or Claude Code sets it. Auto-compaction runs a little before 100%, and the figure reads higher than Claude Code's own status-line percentage, which measures against the model's window. The window comes from a local `summary` breakdown (no request sent), read once per model. ([#9](https://github.com/scasella/claude-flightdeck/issues/9), thanks @DrWBlow)
- A subagent resumed with `SendMessage` runs again on its card: ◐ running from its next request, `resumed` in the log, and counted in the status line's `agents N/M`. Its clock still counts from the first spawn; the log's `done · …` times each run. A second spawn under the same id resumes the card rather than adding another. ([#8](https://github.com/scasella/claude-flightdeck/issues/8), thanks @momchilon; [#12](https://github.com/scasella/claude-flightdeck/pull/12), thanks @Alendro305)
- A subagent's turn start no longer logs its prompt as yours or resets the main turn's receipt.
- `paneColumns` sets the width the docked pane asks for (default 66, at least 40; Claude Code caps the dock at 45% of the terminal). ([#6](https://github.com/scasella/claude-flightdeck/issues/6), thanks @matheusmaais)
- The pane draws at its real width down to 24 columns, the narrowest dock Claude Code seats, instead of never narrower than 40, so a narrow desktop pane or terminal dock no longer has the right side of every box cut off. Below 40 columns the agents header, the lanes, other loops and the session log take shorter forms, and the gate's file, shell and other buttons wrap. From 40 columns up the pane draws as before.
- On the desktop app, lines of several colours stay on one line. They are rows of pieces a gap apart, as the session log's lines are, rather than nested Texts the desktop app wrapped; a piece that doesn't fit is left out, and the gate's totals fall back to numbers alone. In a terminal these lines read as before wherever they fit.
- On graphical surfaces (desktop, VS Code, mobile) the gate strip and the other rows of marks hold fewer marks, since a mark draws wider than a cell there, and still end on the newest; the legend keeps a row of air above the panels; the agents' time axis scales down to a narrow pane. ([#10](https://github.com/scasella/claude-flightdeck/pull/10), thanks @bhpdev1; also found in [#11](https://github.com/scasella/claude-flightdeck/pull/11) by @darrentmorgan)
- A draw that fails shows `draw failed (…)` in the pane instead of an empty box, and a surface module that faults, such as the cut-off `flightdeck: Client hooks/rail.tsx: …` line in the desktop app, is drawn as plain text on that surface while the rest keeps animating. ([#12](https://github.com/scasella/claude-flightdeck/pull/12), thanks @Alendro305; [#7](https://github.com/scasella/claude-flightdeck/issues/7), thanks @NathanAB)
- README: the `pluginConfigs` key is the plugin's id, `flightdeck@claude-flightdeck` when installed and `flightdeck` with `--plugin-dir`, and project settings aren't read ([#13](https://github.com/scasella/claude-flightdeck/issues/13), thanks @jangerhard). Troubleshooting notes that the VS Code extension may show no mod pane yet ([#5](https://github.com/scasella/claude-flightdeck/issues/5), thanks @jonathon-lawlor798). A statuslin.es badge ([#7](https://github.com/scasella/claude-flightdeck/issues/7)).
- CI runs `claude plugin validate`, the tests and `tsc` on every pull request and on `main`.

## 0.4.0

- The main box shows the time left until each rate-limit window resets (`5h ▰▱▱▱▱ 19% ↻3h10m`), from the `resetsAt` the session already reports. Below 56 columns the gauges stay as they were. ([#3](https://github.com/scasella/claude-flightdeck/pull/3), thanks @vihrea1337)
- The main box shows the last main-loop request's time to first token and decode speed (`last req  ttft 0.8s · 60 tok/s`), timed as its response streams past. ([#1](https://github.com/scasella/claude-flightdeck/issues/1))
- The session log has a one-row gap above it, in both layouts. ([#2](https://github.com/scasella/claude-flightdeck/issues/2))

## 0.3.2

- A background architect's advice is read from its `SubagentHandback` tool call, where the report actually arrives, with the hand-back text as a fallback. Bold markers no longer leak into the advice line.
- README: no longer promises that counters survive every update; a change to the state's shape may reset them once.

## 0.3.1

- The main box shows the model and effort as soon as a request starts, not after the first one finishes.
- Advice from a background architect agent (such as `fable-advisor`) now reaches the architect's `»` line; it arrives as a hand-back message, not as the agent's own answer.
- New README media showing the Flightdeck header; plainer wording about opening on start.
- More gate tests (24 in all).

## 0.3.0

First public release.

- Panels: main vitals (context, compactions, cost, rate limits), architect timeline, permission gate strip with per-family drill-down, agent cards and swimlanes, other loops, turn receipt, session log.
- Layouts: docked one- or two-column, and an 8-row inline summary for the main screen. Cards fall back to swimlanes when they don't fit.
- Theme colours by default, with a `pastel` palette option.
- Animated connectors and live clocks as surface modules, only while work flows.
- Works on the terminal, desktop app, VS Code and mobile surfaces.
- Config for the architect pattern, labels, panels, layout, card limit, motion, moments, palette, opening on start and the status line.
- `/clear` and `/flightdeck reset` start the pane fresh; reads tolerate missing or older fields.
