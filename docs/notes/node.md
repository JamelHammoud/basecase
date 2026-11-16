# Node-side notes (electron/, tools/, bench/, vite.config.ts)

Knowledge preserved from code comments. Complements AGENTS.md; nothing here repeats it.

## Frames and units
- Agent/bench frame: Z up, mm, front faces -Y, left is +X. Studio (viewport/GLB) frame is Y up.
- Studio to bench frame is `(x, -z, y)` (`bench/glb.mjs`); CAD to studio is `(x, z, -y)`.
- URDF rpy is fixed-axis roll, pitch, yaw: `R = Rz(yaw) Ry(pitch) Rx(roll)`. Same in `bench/geometry.mjs`, `electron/robot-skeleton.mjs`, `tools/parts/convert-urdf.mjs`.
- `robot-skeleton` MJCF euler: lowercase sequence = intrinsic (post-multiply), uppercase = extrinsic (pre-multiply). Angles are degrees unless the compiler says otherwise. MJCF quaternions are w x y z.
- `robot-skeleton` `forward` is the source axis the robot faces (`+x` by REP-103). Studio left/front are derived from it with z x forward.

## electron/main.mjs
- Window background is `#00000000` so native vibrancy shows through.
- userData (and so localStorage) follows the app name: on first launch after the rename, the old `Robotics 3D Studio` folder is carried over instead of starting fresh.
- Stoplight position must match `LAYOUT` in `theme.ts` (see docs/guide/window-chrome.md §2).
- Stoplights hide in full screen; `enter-full-screen` / `leave-full-screen` are forwarded so the renderer can move the sidebar toggle into their space.
- Links (agent reply sources) always go to the system browser via `setWindowOpenHandler`.

## electron/app-menu.mjs
- Menu state defaults live in `DEFAULT_STATE`; `tabs` lists open scenes for the Window menu (first nine get ⌘1–⌘9).
- Renderer-handled shortcuts use `registerAccelerator: false` through the `item()` helper.
- Dev-only reload and DevTools items are gated on `process.defaultApp`, not `app.isPackaged`: the from-source bundles (`Basecase.app`, `Basecase (Dev).app`) rename the executable, so `isPackaged` is true in dev.

## tools/electron-dev.mjs
- `require('electron')` returns the binary path, not the module API.
- The bundle is rebuilt when a stamp of Electron's version plus the compiled icon changes (`bundleStamp`).
- The clone is `cp -cR` (APFS clone: instant, no extra disk).
- Launch Services registers the cloned bundle on first launch anyway, so no explicit `lsregister` call.
- Editing Electron.app's Info.plist isn't enough: every Electron app shares bundle id `com.github.Electron` and the executable name.

## tools/icon-mesh.mjs
- Seed 7 (grey palette) was picked by comparing candidates through macOS's own renderer, not the raw PNG.

## electron/backend-service.mjs
- Agent env: when the app is launched from inside a Claude Code session, that session's host-auth variables would hijack the agent's login; `agentEnv()` drops them.
- `resolveCommand` swaps `node` for the Node binary that launched us, since Electron's PATH can be minimal.
- Workspace ids travel in bridge URLs, so `safeWorkspace` strips them to `[a-zA-Z0-9_-]`; empty falls back to `main`.
- Bridge: an HTTP server on 127.0.0.1 with a per-launch token. Route is `/<token>/w/<workspace>/agent/<kind>`; the older `/<token>/agent/<kind>` means the default tab.
- `requestRenderer` defaults to a 60 s timeout; without a workspace id it asks the tab in front. Long builds get no fetch header timeout from callers (see bench).
- Offline benchmark mode: `STUDIO_AGENT_OFFLINE=1` turns web tools off for the agent.
- `requestPermission` declines anything outside `SAFE_TOOL_PATTERN`; `fs/write_text_file` is confined to the library folder (path resolved against the workspace root and checked).
- The first tab's session is created with the agent so its first message doesn't wait.
- Session params: no file, shell or edit tools (`tools: ['TodoWrite', ...web]`); thinking is `adaptive` with `display: 'summarized'` so reasoning streams.
- Each tab's MCP server gets its own `CAD_BRIDGE_URL` (`…/w/<workspace>`).
- Resuming a conversation in another tab unbinds it from the old tab (a conversation lives in one tab).
- If the agent can't resume (e.g. offline agent), a fresh session starts and the old transcript stays visible.
- Closed sessions are ended quietly so the Claude process and its tools shut down.
- `steerAcpPrompt` returns `injected`, or `promptRequired` / `unsupported` when the caller must send a normal prompt after the run ends.
- Purchases are app-wide: one STS3215 check serves every scene. Prices are only ever recorded by a person.
- Reference chat images are saved as `ref-N`; numbering continues across sessions so names stay unique.
- Library rewrites with `keepUpdatedAt` (data upgrades) keep the scene's place in the Library list.
- Saving a scene also updates `ai-reference/` so the workspace agent can inspect the latest scene.
- Training runs through `Trainer`, one job per scene tab (see Trainer below).

## electron/acp-3d-agent.mjs (offline tracer)
- Reads the prompt as text or structured JSON blocks; falls back to plain text when JSON parsing fails.
- Writes its output through the ACP client `fs/write_text_file` capability, not directly.
- Synthesizes extra features from keywords in the part name and prompt text.

## electron/trainer.mjs
- `uv` is searched on PATH and its usual install locations because GUI apps don't inherit the shell PATH.
- uv installs the pinned Python, MuJoCo and PyTorch on first use into `library/trainer-env`.
- `OMP_NUM_THREADS=4` keeps torch from oversubscribing the cores MuJoCo's rollout threads use.
- Non-JSON stdout lines are not trainer progress and are ignored.
- On failure the last non-indented Python line (the exception) is shown, not the traceback.
- Stop sends SIGTERM: the trainer saves and evaluates what it has learned before exiting.

## electron/cad-kernel
### sandbox/
- A job over the timeout (default 90 s) or a window over 4 GB kills that window: `process.kill` on its renderer's pid (TerminateProcess on Windows), then `destroy`; a spinning worker can't stop it. Never `forcefullyCrashRenderer`: on Windows it asks crashpad to dump the hung renderer, and with no crash reporter started that ends the whole app with exit code 0xFFFF7003 (crashpad's "not connected"). That code is what the packaged Windows app exited with in the converter self-test, about when its hang probe's window is killed (#54). A fresh one starts on demand. `kernel_warm` starts one early to hide startup cost.
- Each pool slot is its own window, so each has its own renderer process: a killed slot never takes another lane's job with it, and memory is measured per process (`app.getAppMetrics`, polled every 500 ms only while a job runs).
- The main process never closes the app over kernel windows: they're stopped when the main window closes, so `window-all-closed` still fires, and `activate` checks for the main window, not for any window.
- The worker can't fetch, so the page compiles the WASM modules (`compileStreaming`) and posts them; the worker instantiates them through Emscripten's `instantiateWasm`. OpenSCAD's WASM is inlined in its chunk.
- Results are JSON bytes encoded in the worker and written to the bridge response as is, so the main process never parses or stringifies a mesh.
### openscadEngine.mjs
- `$fa = 6; $fs = 0.5;` is prepended on the same line so error line numbers match the user's code.
- A CGAL hull assertion (`applyHull` / `assertion violation`) at low segment counts is retried once with a forced `$fn`.
- Unknown modules, functions and variables ("Ignoring unknown") count as errors: OpenSCAD otherwise silently builds wrong geometry.
- BOSL2 errors put the message on the lines after `ERROR`; `explainErrors` reads up to 5 continuation lines and the first trace line in the user's file, minus the raw assert source.
- The OpenSCAD instance is warmed after each render (libraries already copied) and reused; jobs are chained so an instance and its log buffer are never shared.
### replicadEngine.mjs
- `replicadHints` maps common replicad runtime errors to one-line fixes. Edges are optional (a failed edge extraction doesn't fail the part); volume is kept from the mesh.

## electron/cadImport (the converter in the kernel sandbox)
- The pool stamps every job with its own numeric `id`, so a converter job carries the part's id as `partId`. Passing it as `id` once wrote the pool's number into the GLB's node and mesh names, changing its bytes.
- occt-import-js's embind builds its invokers with the `Function` constructor, so the converter Worker needs `'unsafe-eval'` and runs under the kernel worker's CSP.
- Vite's build replaces `process.env` with `{}` and wraps a dynamic `import()` with a template literal in its preload helper, which needs `window`. The probes reach Node through `globalThis.process` and a plain `import(name)`, or they'd test the bundler instead of the sandbox.
- A Node `worker_threads` thread can be ended mid-loop with `terminate()`, so the Node host stops a hung parse too; it has no memory cap, so the self-test skips the memory probe there.
- The conversions are bit-identical between the old forked Node process, a Node thread and the Chromium Worker (same V8, same WASM); `verify/fixtures/cadimport/expected.json` holds the hashes taken before the move.


## Nightly harness waste evidence

Implementation and coverage: [Benchmark](../guide/bench.md#nightly-experiment-reports) and [Loop](../guide/loop.md#0l-how-agents-land-work).

The synthetic replay on 15 November 2026 uses committed tool rows in `tools/loop/lib/fixtures/harness-waste.json` and comparison attempts in `bench/compare/fixtures/index.jsonl`. The read sequence has two redundant calls consuming 70 recorded milliseconds. An unchanged check adds one redundant call consuming 70 milliseconds, with a mutation preventing another match. A repeated failed tool pair adds one repeated sequence consuming 55 milliseconds. These fixture durations are test data, not production measurements. Held-out records, missing replies and duplicate copies do not add waste evidence. Oversized files are excluded. A passing tune archive with an unreported short screw still produces missed-check evidence through the existing fault probe.

The comparison archive contains five attempts and two distinct successful tasks. All attempts consume 150 tokens and 20 recorded seconds, or 75 tokens and 10 seconds per successful task. Four live attempts consume 100 tokens and 14 seconds for one successful task. One reused baseline attempt contributes 50 historical tokens and six historical seconds. Missing usage produces an unavailable ratio, and zero successes never divide by zero. Usage replay separately links failed build and revision sessions through a rebuilt merged step. Unmatched and unmerged work remain visible.

A local selection probe ran on an Apple M5 Pro with Node v26.13.0. Nine warmed batches each selected among 128 candidates 200 times. The previous fingerprint selector took a median 0.110 ms per selection, with batch means from 0.105 to 0.113 ms. The measured ranking selector took 0.099 ms, from 0.091 to 0.103 ms. Both selectors used identical candidate objects and fingerprint computation. A separate replay of 128 six-event tune archives took a median 12.43 ms, from 8.23 to 13.69 ms, across nine batches of ten replays. It grouped 256 redundant reads, 8,960 fixture milliseconds and 25,600 supporting attempt tokens into one candidate, retaining eight source references. Files were generated from the committed rows in a temporary folder. The scratch probe and raw results remain local as `scratch/harness-overhead.mjs` and `scratch/harness-overhead.json`.

This probe measures selection and bounded local archive replay, excluding GitHub evidence collection, process startup, proposal generation and browser comparisons. It establishes no change in product-task throughput, model quality or weekly allowance. The supplied digest has no valid week-over-week worst measure. No claim is made that this task targets its measured worst number. Existing browser micro-evals still measure experiments, and the complete held-out quality requirement and 30-minute experiment deadline remain unchanged. No browser startup investigation or quarantine condition changes in this reporting refinement.

Review replay exposed four gaps. Partial copies consumed two attempt slots, so 128 partial and complete pairs could replay only 64 attempts. Missed-check harvesting recognized Claude names but lost checks identified by Codex wrappers or dotted titles. Incomplete mutations disappeared from completed-call replay, and repeated failed pairs could have changed replies. Claude usage with missing cache-write measurements still produced a complete token total. Regression fixtures cover all 128 copied attempts, mismatched provider summaries, all three check-name shapes, overlapping and unfinished mutations, changed failure replies and incomplete main or formatting-repair cache usage. These corrections add no model calls or scheduled work.

The efficiency evaluator replay on 15 November 2026 used the five committed archive rows in `bench/compare/fixtures/index.jsonl` to set token totals in the six-task, twelve-attempt paired fixture in `bench/compare/fixtures/efficiency.mjs`. One task fails on both arms. These are representative synthetic archived comparison shapes, not a scheduled agent experiment or evidence of agent improvement. No production comparison archive was available in this checkout. After 20 warmups, nine batches of 100 evaluations on Apple M5 Pro with Node v26.13.0 took a median 1.266 ms per evaluation, with batch means from 1.235 to 1.307 ms. Each evaluation includes 4,000 task bootstrap resamples, work aggregation and identity checks. The probe and raw results remain in `scratch/efficiency-overhead.mjs` and `scratch/efficiency-overhead.json`. There are no new model calls, repetitions, waits or pull request checks. Actual token and elapsed-work improvement requires the existing scheduled experiment and its held-out reports. No comparative worst-lane measurement or subscription allowance saving was measured.

Review replay found that an alias with one attempt answered by `gpt-6-sol` and the rest by `gpt-6.1-sol` still returned `efficiency-win`, with a token reduction of 120 and interval [100, 300]. Comparisons now require the same normalized responding model across all attempts. Cache replay also selected rows by position and overwrote their seed with the requested round. The command regression fixture archives seed 2 before seed 1 for one task and only seed 2 for another. It verifies reuse of the recorded seed 1, a live run for the missing seed 1 and eleven live attempts overall. The slot planner counts distinct valid seeds instead of archive rows. These fixtures add no scheduled model calls or checks. The earlier overhead measurement predates these review corrections.

## Targeted CI diagnostic evidence

Contract and current coverage: [Loop](../guide/loop.md#targeted-ci-diagnostics).

Issue #1271 supplies remote execution for sixteen existing repair owners. The gallery owner #1139 declares `windows-diagnostics`, which the original capability list does not provide. Its acceptance scope includes at least ten Windows runs before and after a fix, unchanged assertions and deadlines, tracing, cleanup and removal of only its own quarantines. The eligibility replay retains those obligations and the dependency text while replacing only the requirement token after verified hosted evidence. #992 and interactive Windows tasks are excluded. No production repair, browser assertion or quarantine entry changes in this integration.

The controlled runner replay uses ten fixture measurement results at one exact SHA. It submits once, receives run ID 42, collects a completed Windows artifact and appends its reference to the existing #1139 handoff. Task identity and decisions survive. The fixture diagnostic job lasts two minutes and the fixture full Check lasts twenty. Both command paths add zero model session starts. These are replay inputs, not hosted performance measurements or evidence of a tenfold production improvement. A separate fast integration test invokes the real Vitest CLI on an existing capability test and reads its exact named JSON result. Other cases cover pending and cancelled jobs, missing artifacts, failed dispatch, nonexistent revisions, malformed selections, credential exclusion, archive expansion and download limits, and claimed or edited issue bodies.

The real CLI check first exposed an all-skipped report with exit code zero. Vitest 5 matches suite and test names joined with ` > `, while its JSON reporter's `fullName` joins them with spaces. The contract now uses the actual CLI name and reconstructs it from `ancestorTitles` and `title` when checking the report. The existing capability test then executes once and passes. All-skipped results continue to fail the diagnostic. The implementation's related check runs 253 tests across 33 files, including this real CLI path, without browser startup.

On 15 November 2026 the read-only jobs response for [Check run 43736502131](https://github.com/JamelHammoud/basecase/actions/runs/43736502131), workload revision `06b63f7f193be38062fcff6e5d769f66a4c4df4e`, contains 28 jobs and 163.717 elapsed job minutes. The six Windows e2e jobs consume 82.267 minutes in total, including failed shards. The Linux unit job consumes 10.483 minutes and the Windows unit job 8.667. These sums include each job's preparation and cleanup. They exclude queue time, billing rounding and platform multipliers. The source response is retained locally in `scratch/diagnostic-full-check-jobs.json`, with the durable Actions reference above. This historical run is a baseline only.

No targeted hosted Windows run or production session-start reduction was measured in the implementation session. The diagnostic workflow is new and unpublished in that session. GitHub requires the workflow on the default branch for [manual dispatch](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), and the agent does not publish. The first hosted verification therefore remains a runner action after publication. Use the guide's gallery selection at the baseline workload SHA, collect its returned ticket with baseline ID `43736502131`, and retain `comparison.json` with its run URL. Report diagnostic job minutes and the selected result separately from the historical full-suite total. Do not infer a repair-rate improvement from one run.

Until a complete matching Windows artifact is retrieved, the runner records no Windows diagnostic readiness and the groomer performs no requirement normalization. Collection checks the workload SHA, exact selection, Windows platform, measurement count and selected-test count. A cancelled run, setup failure, unmatched selection, incomplete report or artifact-limit failure cannot supply readiness. Bounded logs and durable run references retain failure evidence even when reports are missing. This bootstrap condition protects truthful task eligibility without adding a required Check, scheduled lane, automatic retry or waiting loop. Each repair owner still supplies its production cause, traces, repeated before-and-after measurements and quarantine decision.

Review replay reproduced rejection of a valid dispatch when its workflow branch advanced after the pre-dispatch SHA lookup. Collection now pins the returned run's actual revision and checks its workflow path and dispatch event. The runner no longer makes that extra branch lookup. The fixture uses different workload and runner SHAs and retrieves matching evidence. Separate cases reject the wrong workflow, event or ticket.

A stored ZIP fixture containing a file of 1 MiB plus one byte bypassed the extraction limit when its central directory claimed one original byte. Extraction now rejects inconsistent stored-entry sizes before allocation. Job-log retrieval also stopped at its output buffer limit and retained the beginning of a large log. The streaming fixture supplies more than 2 MiB and checks that the final 1 MiB includes cleanup evidence. A failed download rejects partial output. Readiness coverage checks that unverified Windows and verified Linux results cannot enable Windows execution, and capability tests no longer inherit saved readiness from the machine running them. These corrections add no hosted run, model session, polling or retry.

## Loop capability wait evidence

Review of #1263 found that adding a missing capability changes `taskInputSignature`, which includes available capabilities. For an unchanged task declined with both a missing capability and an open pull request in `waitFor`, the changed-signature return in `stepWaiting` bypassed that pull request. The original dependency regression had no input signature, so it missed this case.

`stepState.test.mjs` now covers the combined case with distinct input signatures. Capability availability keeps the task waiting while the named pull request is open and releases it immediately after closure. Tasks with changed definitions still discard the old decision. This is deterministic state coverage and does not require a Windows host or establish diagnostic throughput. Current coverage is listed in [Loop](../guide/loop.md#0l-how-agents-land-work).

Further admission replay reproduced four failures. Five-run Windows before/after measurements, baseline/candidate Windows runs and Windows process-trace capture all passed the gate because inference required a ten-run before/after comparison. A Linux-only measurement was rejected when its Windows-titled task also mentioned quarantine. Sentence-level measurement attribution now preserves that Linux work while recognizing controlled Windows runs at other sample counts and process-trace collection. Static snapshot comparisons remain eligible. A host regression fixture also preserves rejection of execution on an interactive Windows host without rejecting ordinary Windows desktop compatibility descriptions. Admission tests verify refusal before voice or GitHub calls, and the builder test verifies refusal before opening a worktree. These are deterministic admission checks without host execution or throughput measurements.

## Loop publication recovery evidence

Review of #1275 ran `npm run check:changed -- docs/guide/loop.md tools/loop/lanes/build.mjs tools/loop/lanes/build.test.mjs tools/loop/lib/workRecovery.mjs` on 15 November 2026. Formatting, lint, docs and all 62 related tests across eight files passed. Current coverage is listed in [Loop](../guide/loop.md#0l-how-agents-land-work).

The builder fixtures return a completed session and then throw from the publisher. They assert that recovery exists before cleanup, that the next invocation retains the session and receives the failure message, and that two publication failures permit only two model invocations on unchanged inputs. A separate fixture writes a real delivery record before throwing and verifies that builders leave the step to delivery without retaining another model recovery.

The builder tests mock model execution, publication and worktree cleanup. They do not run a real failing commit hook or establish crash safety between operations. The recovery library tests separately exercise real Git merges and autostash conflicts. This review made no live recovery or throughput measurement and changed no quarantine conditions.

## Copy occurrence accounting

Issue #1300 refines the existing Copy job and review evidence for arc #224. The supplied +60 across 188 merged pull requests motivated reason coverage. It is not evidence that those strings were redundant. This change removes no product text and changes no app behavior.

The fixed replay below compares each commit with its first parent. The baseline is the extractor and per-file budget from `9a8a02e26702e7384760d2b302340409fb15f198`, the task's starting `main`. Both implementations receive the same changed source contents. Counts below expand changed wording into one addition and one removal. The sample deliberately includes additions, no-copy geometry work, moved settings controls, deletions, renderer wording changes and native dialog wording changes.

| Merged change | Pinned commit | Baseline + / − | Shipped + / − | Net |
| --- | --- | --- | --- | --- |
| #1293, passive joints | `9a8a02e26702` | 3 / 0 | 3 / 0 | +3 |
| #1298, photo outline baselines | `0572673abbe9` | 0 / 0 | 0 / 0 | 0 |
| #1280, SSH training | `d7cbda0933d5` | 14 / 3 | 11 / 0 | +11 |
| #777, sketch output controls | `3539f9582623` | 0 / 3 | 0 / 3 | −3 |
| #687, contractions | `5dac29e40e7b` | 2 / 2 | 2 / 2 | 0 |
| #90, reference image captions | `983c1a25e0c5` | 0 / 3 | 0 / 3 | −3 |
| #550, actionable errors | `8c0b01da448d` | 2 / 2 | 3 / 3 | 0 |

Extraction differences: #550 now includes `electron/updates.mjs`'s dialog detail change from “Try again later.” at line 141 to “Check again in a minute.” at line 142. #1280 cancels three unchanged controls moved between files. That is occurrence matching, not an extraction change or a product copy reduction. All seven nets remain unchanged. The new JSX literal-child and mixed-fragment handling causes no difference in this sample.

False positives: inspecting the reported source locations found none among these seven changes. This is a bounded sample, not an app-wide audit. Negative-control tests exclude native protocol objects, console and logger payloads, fixture files and catalog records. Existing renderer object keys remain a declared surface heuristic. Static extraction does not trace arbitrary helpers, imported constants, runtime strings or Electron role-generated labels. Those remain review's responsibility.

Runtime measured on the task's macOS host with Node 26.13.0: load the seven pinned source pairs once, warm both extractors once, then alternate execution order over seven measured passes. Median baseline extraction and per-file accounting took 37.30 ms for the whole sample. Median shipped extraction and accounting took 39.03 ms. Reading source pairs through Git took 1.00 s separately. The additional native coverage and occurrence matching cost 1.73 ms across the sample. These are local observations, not a speedup claim or a CI threshold. Unsupported Electron files without a `dialog` identifier bypass parsing unless they are the explicit app-menu file. Each supported source is parsed once per side. No new job, model call, publication wait, retry or timeout was added.

Reproduce the replay by passing each pinned commit and its first parent to `scannedSources`, then `diffCopy` and `copyOccurrences` from `tools/copy-diff.mjs`. For the baseline, load `tools/copy/{extract,budget,surfaces}.mjs` from the pinned starting revision and run its `isScanned`, `extractStrings` and per-file `diffStrings` on those same source pairs. Temporary scripts and complete source-location lists belong in `scratch/`.

Current coverage lives in [Copy](../guide/copy.md#3d-checklist-before-shipping-any-ui-text) and [Loop](../guide/loop.md#review). `tools/copy/publication.test.mjs` uses a temporary Git repository with two added repeated renderer labels and native menu text. It runs the real budget command, rejects missing and partial reasons, accepts complete reasons, and checks identical review evidence. It exercises generated and revised pull bodies and mocked issue and pull voice responses without publishing or calling a model. `tools/copy/issuePublication.test.mjs` also drives ordinary issue creation with the publishing boundary and generator stubbed. There is no browser walkthrough because the app does not change. Linux and Windows observations remain with ordinary CI.


Review of #1303 found that native fields sharing a local initializer collapsed onto its literal node. A source with one `const message` and two dialog calls returned one occurrence at the declaration instead of two at the calls. Native hits now identify both the use and the literal branch, preserving repeated references and conditional branches without changing renderer deduplication. The review also reproduced false outer-initializer extraction through destructured parameters and locals, catch bindings and loop variables. Those bindings now stop outer lookup.

`tools/copy/accounting.test.mjs` checks repeated menu and dialog references, shared fields, conditional branches, use locations and shadowing negative controls. The publication fixture starts with one native reference and adds two more, checking that budget, preflight and review all retain the two additions and require their reason. These are static extraction and temporary-repository checks. They add no publication step, model call or browser run. The replay timings above describe the implementation before these review corrections and were not remeasured.


## Loop product dispatch evidence

Issue #1331 changes capacity selection in arc #224. It leaves #1286's CAD scene reads and held-out harness experiment unchanged. Product scope, ownership, dependencies, acceptance checks, provider quotas and protected overflow remain unchanged.

### Baseline before policy selection

The observation window is 9 November 2026 at 05:36:55.934 UTC through 16 November at the same time. Read-only GitHub merged-pull history returned 830 merges in that window. Title prefixes identify 541 Refine, 76 Feature, 21 Integration, 62 Fix, 77 Repair, 30 Loop, 9 Batch, 6 Lesson, 5 Market and 2 Update merges. One merge has no kind prefix. Direct feature, integration and fix merges total 159, or 19.2 percent. Refine merges account for 65.2 percent. Batch members are not expanded, and a merge's title does not establish its size or value. The observed direct-product merge rate is 22.71 per day across this seven-day window, alongside 118.57 total merges per day. These are baseline rates, not a dispatch treatment result.

Local session retention starts on 15 November at 23:32:20.531 UTC. The same cutoff contains 426 invocations, including running records. Names are build 69, refine 91, review 79, revise 5, rebase 13, lead 45, groom 2, learn 1 and voice 121. Of these, 424 have completed records and two remain running. Completed build invocations total 68 and completed refine invocations total 90. Neither is a completed-task count. No completed invocation records a process failure. That does not establish zero failed reviews, declined tasks or lost sessions.

The existing task-work join finds 16 merged steps with attributed invocations: six feature, five integration and five refine steps. It joins the cached all-step pull index observed at 05:39:47.830 UTC, so completion state is slightly newer than the session cutoff. The linked sample includes 67 invocations, 21 review attempts and five revision invocations. The remaining 359 invocations are visibly unattributed, including independent refinements, planning, voice and running work. There are no attributed unmerged invocations in this retained sample. This is incomplete retention and linkage, not evidence that unfinished work consumed no resources.

| Recorded task kind | Linked merged tasks | Review invocations | Recorded failed attempts | Tokens per completion | Elapsed work per completion |
| --- | ---: | ---: | ---: | ---: | ---: |
| Feature | 6 | 8 | 0 | 26,378,137.50 | 55.72 min |
| Integration | 5 | 8 | 0 | 20,114,106.80 | 39.90 min |
| Refine | 5 | 5 | 0 | 6,590,836.80 | 15.46 min |

Across the linked sample, measured work totals 291,793,543 tokens and 611.16 session minutes. Per completion that is 18,237,096.44 tokens and 38.20 session minutes. All linked records have token and elapsed measurements. Cached input accounts for 283,623,808 tokens and is already included in the token total. Session minutes sum concurrent work and are not wall-clock delivery time. These numbers exclude earlier work outside retention and unlinked sessions. They cannot measure subscription allowance per completion.

Only digest #69 was available. It reports the week beginning 6 November, 12 merges, zero recorded reviews, one revert and 168 hours of red main. Its body has no structured lane comparison. There is no valid week-over-week worst measure or comparable previous session window. Review invocations above are not digest verdict rounds. The existing digest remains the source for review rounds when comparable records exist.

This mix supports directing the two existing refinement workers toward eligible product steps first. It does not support a gain claim, a new scheduler or idle periods to enforce 60/25/10/5 shares. Review and repair capacity stays as configured. Refinements remain useful fallback work.

### Queue replay and selection cost

The replay uses local cached next, building, blocked, all-step-pull and open-pull snapshots observed between 05:39:47.830 and 05:40:51.342 UTC on 16 November. It calls the real `waitingSteps`, `claimNextStep`, capability, readiness and dependency logic. GitHub reads and issue writes are replaced by these snapshots and inert boundaries. Filesystem claims are real. Existing local decline and recovery records and current main source signatures determine input readiness. Nothing publishes or starts a model.

The next queue contains #1328, #1291, #992, #823, #774, #773, #772, #643, #453 and #391. Eight have unchanged declined inputs. #1328 and #1291 have ready inputs but depend on open #1291 and #773 respectively. #823 also depends on #773 and #772. No queued step lacks a declared capability or already has a published pull in this snapshot. The shared selector returns no eligible step, including stale-building and blocked candidates.

| Frozen snapshot replay, five build and two refinement workers | Current dispatch | Product-first dispatch |
| --- | ---: | ---: |
| Eligible product starts | 0 | 0 |
| Step refinement starts | 0 | 0 |
| Independent refinement starts | 2 | 2 |
| Blocked selections reaching execution | 0 | 0 |
| Duplicate claims | 0 | 0 |

Eight input blocks and two dependency blocks are refusals before selection, not failed executions. Empty eligibility makes the zero duplicate count vacuous. The replay supplies zero queued CI runs and uses the empty open-pull snapshot, so both refinement workers can use fallback. Replaying the refinement-cap case separately, three outstanding refinement pulls hold fallback but do not hold a selected build task. A global cap still holds either kind.

On the macOS task host, ten repeated shared queue selections took a median 67.58 ms and maximum 69.17 ms. The prior refinement-only path did no product selection. This is added local selection cost, dominated by existing source-signature Git reads, not agent or publication time. It adds no wait, polling, retry, model call, worker slot or merge gate. It is not a CI threshold or an end-to-end speedup.

The deterministic runner integration fixtures supply eligible founder-priority product work, unlike the frozen queue. Two workers claim distinct product steps before either executes, then produce two product executions with their own closing links and no independent refinement session. A held step is skipped for another eligible step. Dependency, capability, producer capacity and global backpressure fixtures prevent blocked execution. Publication races prevent a second publication. A publication-preparation failure retains the session and resumes through the build path. A failed fresh history lookup also refuses publication and retains recoverable work.

Reproduction uses `waitingSteps` and `claimNextStep` with inert GitHub boundaries over the named cache snapshots, retaining all selected claims until the worker batch ends. Compare five ordinary claims plus two independent refinement starts with five ordinary claims plus two product-only claims and immediate fallback. Use `taskUsage` and `sessionTotals` over the retained session JSON and cached all-step pull records for the accounting table. Merge rates use read-only merged pull history filtered to the exact observation window. Session summaries, source snapshots, scripts and complete reports stay in `scratch/` and local state.

Historical queue states at individual session starts were not retained. The snapshots have different timestamps and local inputs can change. Replaying the same queue for each historical invocation would invent readiness and completion. This replay establishes current eligibility refusal and fallback behavior only. It cannot establish completed-feature throughput, quality, allowance gains or a causal comparison. The baseline is available for later observations through the existing usage and digest reports, without adding a gate or observation wait. No quarantines change.

## Fleet authorization boundary

The [Fleet service](../guide/fleet.md) uses one evaluator for direct resource reads, enumeration, exports, text assets, mutations and subscription snapshots. Fast tests exercise two organizations, nested sites, group grants, custom role replacement and deletion, deny overrides, attribute conditions, token ceilings, enrollment replay, session revocation and role changes on an open subscription.

The transport test rejects a remote HTTP origin and a wildcard HTTP bind paired with a loopback origin. Request handling also checks the socket peer, preventing a remote request with a forged loopback Host. The service does not trust forwarded headers as proof of HTTPS. The studio connector's redirect refusal prevents bearer forwarding to another origin. Operator-owned configuration is its only source of addresses and credentials. Desktop bridge and trusted IPC implementations are unchanged.

The initial integration run exposed JSON scope arrays being encoded as PostgreSQL arrays instead of JSON. Explicit JSON serialization fixed credential issuance. An export without any export grant initially returned an empty page, and now refuses the request. Allocating a new generation initially cleared the previous source timestamp. Status now stores its observation generation separately and keeps the last observation until a new generation publishes. The original persistence assertion remains intact.

No SAML, SCIM, physical robot, remote identity provider or cross-host TLS deployment was exercised. TLS is required by the service configuration and connector validation outside loopback. The committed integration tests run against HTTP loopback. Registry performance and memory evidence are in [Fleet measurements](fleet.md).
