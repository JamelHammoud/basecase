# Node-side notes (electron/, tools/, bench/, vite.config.ts)

Knowledge preserved from code comments. Complements AGENTS.md; nothing here repeats it.

## Pull request metadata repair

Repair [#1713](https://github.com/JamelHammoud/basecase/pull/1713) opened at 21:36:41 UTC on November 17, 2026. Its 21:39:01 review reported one blocker: the body omitted a Why section explaining `.github/workflows/check.yml`. The repair template rendered failure, cause, summary and checks, but discarded the supplied `why` field. The fix template had the same omission. Other templates already placed the field under their own headings.

Both revise sessions returned `changed: true` with metadata corrections and no tracked edits. The local session journal records completed invocations at 21:40:19 and 22:16:43, lasting 49.934 and 44.259 seconds. The runner then unconditionally attempted a commit. `revise.log` at 21:40:23.177 and 22:16:47.170 reports `git commit -q -F - failed (exit 1): → lint-staged could not find any staged files.` Both traces name `publishRevision` at `lanes/revise.mjs:115`. Each failed publication had already recorded its head as attempted. At 22:15:51.928 the health lane nudged the unchanged head after 30 minutes, causing the second failure. The repair lane continued logging `a repair pull request is already open` at 22:29:19.230. This is a runner publication failure, separate from the tests that made main red.

The shared body renderer now retains reasons for every kind and inserts missing legacy sections during revision. Metadata delivery uses the original remote head, skips commit and push, invalidates the stale review before editing, and uses the existing durable outbox on failure. If the remote head moves before delivery, the stale metadata is discarded, releasing the outbox hold on review and revision. The delivery lane offers completed or discarded worktrees for cleanup. The existing worktree guard preserves deliveries still pending. An error-state review runs afresh even when its patch matches an older reviewed head. No Check is restarted for a body correction, and no new lane, timer, retry policy or gate is introduced. Source changes retain the existing credit check and publication path.

The doctor reran the failed jobs of [Check 44180679340](https://github.com/JamelHammoud/basecase/actions/runs/44180679340) once through `gh run rerun --failed`. Its first attempt failed two Windows unit shards and two Windows browser shards plus the aggregate. The second attempt was cancelled while newer main [Check 44190921987](https://github.com/JamelHammoud/basecase/actions/runs/44190921987), created at 22:31:43, was queued. No second rerun was requested. The older repair was left open because it contains distinct test containment work. The operational rerun does not establish that either the test failures or the metadata publication cause are repaired on main.

Regression coverage uses the real template renderer and controlled publication services. It verifies all kinds, older bodies, source commits, metadata delivery without Git, failure recovery, refusal after a remote head changes and review invalidation. Native publication races between the remote-head lookup and the GitHub edit remain possible because the edit API offers no compare-and-swap condition. The local check does not publish metadata or establish a green nightly run. Current coverage is in [Loop](../guide/loop.md#pull-request-kinds).

The changed-file check passed formatting, ESLint, documentation validation and 163 related tests across 15 files. Its complete log is `scratch/doctor-check.log`. The tests use controlled GitHub boundaries and do not publish, exercise hosted Windows or claim a repaired failure rate. The rejected-date CLI fixture writes an expected error to stderr while its assertion passes.

Review found that retaining the attempted head after a successful metadata correction prevented revise from handling fresh findings on that same head. It would wait for the existing 30-minute health nudge. Successful metadata delivery now clears only that head's revision marker. Failed or stale delivery retains the marker, and the cumulative attempt count and Check-refresh history stay intact. Delivery tests use the real pull-state store to cover those transitions without publishing.

The review's five-file changed check passed formatting, ESLint, documentation validation and 153 related tests across 13 files. Its log is `scratch/review-1724-check.log`. This confirms the controlled state transitions, without measuring hosted publication or elapsed recovery time.

## iOS runner capacity

Class: environment. In [Check 44148543842](https://github.com/JamelHammoud/basecase/actions/runs/44148543842), revision `8216505a9c447e4d74b8ecd1865a4f8eda8bc238`, the [iOS job](https://github.com/JamelHammoud/basecase/actions/runs/44148543842/job/134270417181) never acquired a runner. Its job metadata has runner id zero, an empty runner name and no steps. GitHub recorded it from 18:30:36 to 18:52:19 UTC on November 17, 2026, a 21-minute 43-second interval. The failure annotation says the hosted runner did not acquire the job after multiple attempts. Three notices identify capacity constraints for macOS arm64 runners. There is no job log to inspect. The aggregate reported `IOS: abandoned`, while the API records `cancelled`. The other 27 executed jobs succeeded, and two jobs were correctly skipped. The aggregate was the only job with a failure conclusion.

The last green full run, [43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889), ran iOS on `macos-26-arm64` image `20261112.0504.1`, with Xcode 26.6. Its iOS job completed in 3 minutes 8 seconds after a 2-minute 16-second queue interval. No `ios/` code changed between that revision and the failed run. The failure happened before checkout or compilation, so it does not identify a source regression or a flaky XCTest.

The repair pins only the iOS job to `macos-26-intel`. GitHub's [hosted runner specifications](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) list that label as Intel, while `macos-latest` and `macos-26` target arm64. The [macOS 26 Intel inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md) lists Xcode 26.6 as default and installed iPhone simulators. This preserves the OS and default Xcode versions used by the green run while selecting a different capacity pool. The job's selection, required success result, simulator command, XCTest assertions and twenty-minute timeout remain intact. No retries, waits or quarantine are added.

Current coverage is in [Scan app](../guide/scan-app.md#tests). Local validation checks formatting and documentation. Native Intel simulator execution and queue time remain unmeasured until the ordinary pull request Check runs the candidate. Hosted capacity is variable, so this pin does not establish an availability guarantee or a measured speedup. The source metadata, annotations, prior green log and runner inventories are retained locally under `scratch/` in the repair worktree.

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


### Windows publication fixture timeout

The Windows unit job in [Check 43919874616](https://github.com/JamelHammoud/basecase/actions/runs/43919874616), at `c3694589d6cd7c1e46ba1c7f999a0fa85edca4c4`, reported one failure: the publication test exceeded its 5,000 ms deadline at 5,248 ms. The same test passed in 2,845 ms in the last green [Check 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744), at `6be4b9dd8d0e4cf9f0d9c7ceef80166365e36d03`. The publication test, extraction, budget, review report, voice implementation and unit configuration have no changes between those revisions. This is a load-sensitive fixture timeout observed on Windows, with no assertion failure or identified breaking merge.

The single test created a Git repository, scanned the same source range six times and launched the budget command in three fresh Node processes. Every scan synchronously launched Git for the merge base, file list and each source side. The repair shares repository setup, keeps command rejection and acceptance in separate tests, and checks partial reasons directly through the budget judge. Preflight occurrences come from the same fixture sources in memory. Exact review text, all five missing-reason markers, repeated native use locations, generated and revised bodies, and issue and pull voice preservation remain asserted.

The fixture now performs four Git scans and two Node command launches instead of six and three. At this fixture's three files and two existing source sides, the subprocess count falls from 51 to 36, including setup. These are source-derived counts, not a flake-rate measurement. The 5,000 ms deadline remains unchanged. No retry, skip, quarantine or production behavior changes. A single local baseline check passed. The repaired fixture's focused check passes all three tests, formatting, lint, documentation validation and site copy checks across 295 pages. Windows validation of the repair belongs to the pull request's Check, and the full nightly verdict remains independent.

## Copy source context

Issue #1414 refines the report for arc #224 after the recorded net increase of 128 strings across 193 merges. It changes no app strings. Occurrence extraction, normalization, move cancellation and justification policy remain the accounting contract above. Context is a lazy source walk over the already captured after-source, not a second string scanner. Counting, the budget job and preflight never evaluate it. The report is captured before review merges the head onto current main.

Source evidence names an enclosing named function or component where available, preserving original line numbers. It groups shared context and clips individual lines at 180 characters. Occurrence lines take priority, followed by function starts, conditional starts and nearby lines. Numbered excerpts are ordered by source line after selection. Anonymous callbacks inside named functions use their named enclosing scope. Short groups come first, avoiding starvation by a large component. Added context is limited to 6,000 characters. Review spends the duplicate occurrence listing's saved space, with a 600-character minimum. Large reports and long lines explicitly mark omissions. The full occurrence list remains intact.

The temporary-repository fixture covers adjacent duplicate captions, a displayed total beside its explanation, a labelled button's tooltip, recovery instructions, an icon accessibility name, exclusive branches, an imported child, repeated controls, changed wording, a modified renamed file and deleted source. It changes the checkout after recording the head and verifies the same source evidence. It checks shared context, bounded output and identical occurrence accounting. The same fixture feeds the production review-prompt assembler with controlled inputs. Publication tests still run the real budget command and verify occurrence reasons, including repeated native references, through preflight and voice boundaries.

Initial fixture execution exposed source-order starvation: a large file consumed the context budget before the smaller panel. Short groups now come first. Prioritizing occurrence lines also avoids spending a short excerpt entirely on preceding controls. The useful instructions and accessibility labels remain reported copy, with no semantic rejection inferred from source proximity.

On the macOS task host with Node v26.13.0, the sample is the nine revisions with added or changed copy among the latest 100 commits at `e917cde35`. Removal-only and no-copy revisions are outside this sample. The compared accounting is identical at every revision.

| Change | Pinned head | Added / removed occurrences | Baseline prompt bytes | Context prompt bytes | Baseline preparation ms | Context preparation ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| #1398 | `afc1de2bbaf8` | 6 / 0 | 175,051 | 175,120 | 171.77 | 169.04 |
| #1396 | `6e6d91b5d330` | 39 / 0 | 210,495 | 210,328 | 132.36 | 142.08 |
| #1370 | `6333a4b8e899` | 20 / 0 | 203,861 | 203,657 | 99.32 | 98.67 |
| #1354 | `6edeedf6e96f` | 7 / 0 | 122,159 | 122,090 | 147.26 | 147.07 |
| #1323 | `93e274222ab1` | 6 / 0 | 107,706 | 107,775 | 113.77 | 113.88 |
| #1312 | `212dbcd463a0` | 5 / 0 | 177,758 | 177,804 | 250.93 | 255.82 |
| #1297 | `37dccba61cab` | 8 / 1 | 127,723 | 127,690 | 198.57 | 206.84 |
| #1293 | `9a8a02e26702` | 3 / 0 | 149,167 | 149,417 | 312.53 | 301.07 |
| #1280 | `d7cbda0933d5` | 11 / 0 | 255,350 | 255,172 | 348.59 | 345.83 |

Aggregate assembled prompt size falls from 1,529,270 to 1,529,053 bytes, a reduction of 217 bytes. The sum of per-revision median preparations is 1775.10 ms before and 1780.31 ms after. This does not establish a preparation speedup or a CI budget. The reports alone grow in aggregate. Their context is offset by condensing the existing review brief without removing its occurrence requirements.

Reproduce with `scannedSources`, `diffCopy`, `copyOccurrences` and `formatCopyDiff` at each pinned head and its first parent. The baseline is the starting report's format plus `report(judge(...))`, with the starting review brief. The candidate uses `copyReport` and the production `reviewPrompt` assembler with the shipped brief. Each occurrence receives the same controlled reason, not a fetched historical pull body. Repeated reason lines deliberately exercise the existing reason-joining behavior. Both prompts include the same real bounded diff and title, controlled duplicate and fix instructions, and unchanged shared brief. Each side is warmed once, then measured over three paired preparations. Per-row times are medians including Git source reads and accounting. Prompt sizes are UTF-8 bytes. Source loading, process contention and Git cache variability dominate these local observations. The script and raw evidence are `scratch/measure-copy.mjs`, `scratch/copy-measurements.json` and `scratch/context-<head>.txt`.

Additional evidence includes the Kit menu item's disabled predicate beside Scene, Passive and Powered beside their actuation condition, Fleet registration fields with selected values, and recovery text in the function that shows it. All nine reports include source context. Some small reports grow individually. The aggregate comparison includes the shortened existing copy-review brief, rather than claiming the report alone always shrinks.

Dynamic composition and imported children remain untraced. Conditions are shown as source, never evaluated. A callback or value may be composed elsewhere, an accessibility name may serve a different channel, and nearby branches may be exclusive. Sparse or clipped excerpts require inspection of the named revision. Neither proximity nor missing context proves redundancy. These measurements establish neither lower allowance consumption nor fewer review rounds. No model call, scanner, review stage, merge gate, retry, wait, browser test, deadline or quarantine is added.


Review of #1418 reproduced a named inline click handler being reported as the scope of its adjacent button label. Scope selection now requires a function or its single-variable declaration to cover the whole occurrence line. The fixture retains the surrounding component for that handler, uses module scope for copy beside an unrelated function, and preserves a one-line arrow component's name. Report and publication tests compare the complete accounting section exactly, verify all five missing-reason markers in the publication fixture, and enforce the documented 6,000-character context cap. The measurements above precede these review corrections and were not remeasured.


### Windows context deadline

The same [Check 43930391936](https://github.com/JamelHammoud/basecase/actions/runs/43930391936) reported the copy-context fixture exceeding its 5,000 ms deadline at 5,068 ms on Windows. Linux passed in 1,225 ms. This fixture and its copy-scanning implementation are unchanged since the preceding green full Check, where it passed on Windows in 2,229 ms. The callback built a Git history and scanned the same range four times, including two identical scans after changing the checkout. This is a load-sensitive test workload failure observed on Windows, with no demonstrated environment change or platform logic defect.

The fixture now shares Git setup across revision-isolation, source-context and review-prompt checks. One post-checkout range read verifies both formatted source evidence and occurrence identity, reducing complete scans from four to three. The local report still captures the original head before checkout changes, and the production review report independently reads that pinned head afterward. Exact context, accounting, bounded-output, rename, deletion and prompt assertions remain. There is no production scanner change, deadline increase, retry or quarantine. The repair records correctness checks rather than a flake-rate measurement.


The repair's changed-file check passed formatting, ESLint, docs, site copy, TypeScript and all 127 tests across the classroom, selector and context files in a 39.21-second related-test phase on the shared macOS host. The final context-only refresh passed its three assertions in 634 ms. Evidence is `scratch/repair-check.log` and `scratch/repair-final-check.log`. These correctness runs establish no Windows rate or speedup.

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

## Complete task work accounting

Issue #1514 extends the existing journal, publisher and usage report for arc #224. It does not change product-first dispatch, worker selection or #1286's CAD scene experiment. A successful invocation is still not evidence that a task shipped.

### Retained evidence replay

The replay selects the same 426 invocation identities whose starts precede 16 November 2026 at 05:36:55.934 UTC. Their JSON records were read again during this task. The original session snapshot is not retained separately. Three records now have finishes after that cutoff, and the earlier running states have been overwritten by completion. The replay uses their retained final measurements rather than inventing their earlier usage or status.

The available all-pull cache was observed at 18:19:29.227 UTC and contains 1,064 pulls. It is newer than the original 05:39:47.830 UTC snapshot. Running the old join from `7ea1b1d1b` against these same records and this same cache yields 18 merged steps, 76 linked invocations and 350 unmatched invocations. The earlier dispatch note's 16 tasks, 67 linked and 359 unmatched remains the original observation. Later publication history accounts for that baseline difference.

| Accounting partition | Invocations |
| --- | ---: |
| Matched merged work | 227 |
| Matched unfinished work | 28 |
| Explicit shared planning | 47 |
| Genuinely unmatched | 124 |
| Ambiguous | 0 |
| Abandoned | 0 |
| Running in the retained final records | 0 |
| Total | 426 |

The new join matches 255 invocations to tasks, alongside 47 shared planning invocations. It finds 78 merged task groups with retained work. Exact normalized branch names recover standalone refinements, and explicit step and pull names recover their attempts. The unmatched set contains 121 historical voice invocations and three refinements without a matching publication. Their missing origin or publication evidence stays unknown. Shared planning is classified from recorded lane names, with no allocation to downstream tasks. No historical relationship is written back to the journal.

A fresh read-only GitHub history query supplies merge dates and titles for the comparison below. It returns the same 1,064 pulls, with 971 merged dates. It changes neither task linkage counts nor the publication state of the replay. Titles identify kinds for six tasks whose earlier cache lacked titles and whose retained sessions lacked a declared kind.

### Equal completion windows

The existing report's completion-window aggregation uses all 426 retained records and the dated history. It selects merges in two adjacent three-hour UTC windows. The first starts on 15 November at 23:36:55.934 and ends on 16 November at 02:36:55.934. The second ends at 05:36:55.934. These are equal observation windows, not treatment and control groups.

| Measure | First three hours | Second three hours |
| --- | ---: | ---: |
| All merged pulls | 41 | 38 |
| Feature pulls and observed feature completions | 2 | 4 |
| Integration pulls | 4 | 1 |
| Refinement pulls | 29 | 33 |
| Merges without observed work | 4 | 0 |
| Feature review invocations | 2 | 6 |
| Feature published review outcomes | 2 unknown | 6 unknown |
| Retained feature tokens per completion | 18,914,928 | 30,109,742.25 |
| Retained feature session minutes per completion | 30.96 | 68.10 |

Feature publication throughput is 0.67 and 1.33 per hour in these short windows. Integration throughput moves the other way. There is no recorded historical review outcome, so neither window establishes a review acceptance rate. New review invocations retain the runner's published outcome separately from the model's proposed verdict. Automatic reviews without an invocation remain outside this invocation-based measure.

Retention starts only four minutes before the first window. Work before retention and historical voice origins are missing from both denominators' work totals. Session minutes sum concurrent invocations rather than delivery latency. The comparison includes retained final measurements for sessions that finished after the old cutoff. It cannot establish lifetime work, a weekly worst lane, a quality gain, a dispatch effect or subscription allowance per completion. Concurrent account quota changes cannot repair these gaps. Attribution alone establishes no allowance improvement, and shipping does not wait for another window.

### Equal-size overhead

Measurements ran on the macOS task host with Node v26.13.0, against the old join and report from `7ea1b1d1b` and this change. Each report input contains 426 invocations and 1,064 pulls. The full report measurement includes local file reads and aggregation, with a fresh local history cache and no network query. Each path warms once, then runs 21 times. Journal measurements warm once and run 11 times, rewriting 426 real temporary records per sample. The enriched payload adds stable work and task identities. The publication sample writes 426 receipts, including their pull URLs.

| Operation | Prior median / maximum | Current median / maximum |
| --- | ---: | ---: |
| Task aggregation | 18.64 / 36.39 ms | 12.66 / 31.87 ms |
| Full usage report | 28.85 / 45.21 ms | 23.67 / 52.32 ms |
| 426 atomic session replacements | 144.11 / 293.87 ms | 114.84 / 147.56 ms |
| 426 publication receipts | Absent | 134.37 / 167.43 ms |

The receipt observation is about 0.32 ms per write. Session measurement compares journal payload overhead, not provider execution. Other worker activity varied during development measurements, so these observations are not a speedup claim or CI threshold. The join indexes branch and work identities and reuses resolved ancestry groups. The full report reuses its retained aggregation when the selected window contains every record. There is no new wait, check, service, scheduler, model call or publication retry.

Reproduction uses `scratch/measure-provenance.mjs` with retained record and history snapshots. Full outputs are in `scratch/provenance-measurements.json` and `scratch/provenance-measurements-summary.json`. The script reads baseline modules through Git, writes benchmark journals only in a temporary directory and removes them afterward. These local evidence files are not committed.

### Coverage and remaining limits

`usageHistory.integration.test.mjs` uses temporary directories, the real session journal, controlled agent execution, the durable delivery outbox and the production `usage.mjs json` command. It covers normal and borrowed feature work, standalone refinement, interrupted build and continuation, repeated revisions, rebuild, multi-step batch, abandoned publication, running work and failed publication followed by recovery. It also checks revision receipts across different worktrees, existing batch member lists, originating voice work, completion-window inclusion of earlier attempts, absent measurements and an unavailable history cache. The publisher boundary does not push or open real pulls. No browser surface applies.

`usageProvenance.test.mjs` checks partition reconciliation, ambiguous competing relationships and explicit step allocation within a shared batch. Existing usage tests retain Codex and Claude cache accounting, formatting attempts and missing elapsed measurements. The report exposes invocation identities, provider and model subtotals, unknown merge dates, unobserved merges and shared batch members. Historical missing origins and measurements cannot be recovered by this implementation. No quarantine, deadline, retry or shared test policy changes.

Review found that `--until` alone defaulted its start against the current clock, so a historical end could produce a reversed window. The default start now follows the selected end, and validation checks both effective bounds. The real JSON CLI fixture checks a historical end alone and rejects a future start alone. Review also found that `taskWork.byKind` omitted published outcomes even though `completionWindow.byKind` included them. Both now aggregate the same outcome totals. The integration fixture asserts both summaries. Duplicate closure previously wrote its outcome before the GitHub call, which could count an unsuccessful closure as published. `lanes/review.test.mjs` drives the lane with controlled execution and publication boundaries to check pass, blocker-derived fail, duplicate success and comment or closure failure. Failed publication leaves the outcome unknown. Market and retro sessions previously defaulted to shared even when their own pull requests merged. Their defaults now follow publication attribution, with coverage beside the shared lead case in `usageProvenance.test.mjs`. The retained replay above contains no market or retro sessions, so its partition counts are unaffected. The integration build fixture now declares its originating worker instead of inheriting the executing lane, which had added `review-3` to the exact worker assertion during review.

Publication recovery previously set `publishedSha` to the prepared commit even when it found a closed pull and sent nothing. The existing pull lookup now includes its head commit in the same GitHub call. Recovery records that observed head, or null when absent. `deliver.test.mjs` checks a recovered merge and an unsent revision of a closed pull with different prepared and published commits. It preserves the existing no-push and no-create assertions.

### Windows history fixture timeout

[Check 44117747672](https://github.com/JamelHammoud/basecase/actions/runs/44117747672), workload `0f434ac7ca0814915098f5813d1468d08b125f01`, failed only the usage-history integration test in the supplied Windows unit job. The complete job log records 6,477 ms for its callback against the unchanged 5,000 ms limit. The expected reversed-date error appears before the timeout, showing execution reached the final CLI checks. Linux unit passed. The [last green Check 43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889), workload `348373decd8013d264fc3e2e9fe1f8b298051b34`, ran the identical test source in 3,691 ms on Windows. The fixture originated in `2c5d18119`, before that green run. This is a load-sensitive Windows timeout, not a newly broken assertion or an environment change requiring a pin.

The single callback launched 12 synchronous `git init` processes and six synchronous JSON CLI processes. Delivery already controls every Git command through its injected execution boundary, and work identity hashes a directory path without reading Git, so the initialized repositories contributed no coverage. The repair removes those 12 starts. Recovery and unavailable-history snapshots now call the real `usageReport` directly. The retained-history CLI snapshot also supplies the explicit completion-window bounds, covering successful `--since` and `--until` parsing in the same process. A separate date-window test retains the historical end and rejected future start CLI assertions. It seeds journal records at and after the historical end, then removes them before the retained-history test, so the zero-session assertion still verifies exclusion against a nonempty journal. All original assertions remain, with three process starts across two tests. Quota and history caches are seeded before either test, so neither needs provider or GitHub access. No production behavior, timeout, retry, quarantine or assertion is weakened.

Local evidence is retained in `scratch/windows-unit.log`, `scratch/last-green-windows-unit.log` and the focused check logs `scratch/usage-history-before.log`, `scratch/usage-history-after.log` and `scratch/usage-history-final-check.log`. These are individual observations, not flake-rate measurements or Windows repair validation. Diagnostic ticket `d4ae3355-3889-44e6-a7af-614b8023993f`, [run 44120681700](https://github.com/JamelHammoud/basecase/actions/runs/44120681700), completed and its artifact was collected and verified. On the exact failing workload, the selected test passed in 2,084 ms with one worker, retries disabled and quarantine off. This confirms a flaky duration on that revision. The runner used Windows image `20261103.298.1`, Node v26.13.0 and four CPUs. Its selection and collection live under `scratch/diagnostics/d4ae3355-3889-44e6-a7af-614b8023993f/`. Local edits are outside that published observation. Pull request Check runs this fixture on Linux. Windows validation of the repair remains unmeasured until a nightly or dispatched Check runs the revised fixture.

## Changed browser test selection

Issue #1362 repairs the existing selector and Check caller for arc #224. The [kit failure record](testing-build.md#manufacturing-kit-export) owns the nightly and pull request evidence. This change restores neither the kit feature nor its browser walkthrough, and changes no assertions, deadlines, retry settings or quarantine entries.

The previous regular expression recognized neither the outer `it.each(table)(title, body)` call nor declaration ends. Its empty kit pattern skipped browser execution, while helper edits could inherit the nearest preceding recognized name. The selector now uses the installed TypeScript parser and declaration ranges. Check's existing `.github/workflows/check.yml` caller installs dependencies after a cheap changed-browser-file scan, then consumes separate precise and fallback file lists. No job, gate, scheduled work or dependency is added. Pull requests without browser-file changes still avoid that installation. Imports, hooks, helper edits, suite changes, parse errors and unresolved titles select their affected file, rather than the whole suite.

### Declaration audit

The task's starting tree has 102 browser test files with 275 syntactic test declarations. Of 253 direct `it` calls, 252 have literal titles. The remaining declaration is the loop-generated template at `e2e/passiveFixtures.e2e.test.ts:25`, which selects its file. Sixteen `itUnlessWindows` calls and four `it.skipIf` calls resolve precise titles, leaving platform skipping to Vitest. Both array `it.each` declarations, in `visionTraining` and `printPlacement`, select both boolean cases. The standalone `it.skipIf` wrapper factories are excluded from the declaration inventory. The conditional `describe.runIf` suite retains its title and Vitest's platform condition. There are no current `test.each`, tagged tables or direct `test` declarations. Generated fixtures cover those forms, chained modifiers, object tables, multiline calls, nested suites, template literals and escaped titles explicitly.

`tools/e2e-changed.audit.test.mjs` audits every current declaration, rejecting empty selection without a fallback. It records the existing dynamic-title fallback explicitly. Future dynamic declarations need an explicit audit outcome. The historical kit source is retained as inert text in `tools/fixtures/e2e-kit-93e274222.mjs`. The replay preserves its table, title and declaration layout while replacing app imports and the callback with a tiny assertion. It tests selection, not manufacturing export correctness.

### Local selection measurements

On the task's macOS host with Node v26.13.0, each sample was parsed once to warm up, then measured 100 times. Median selection took 0.219 ms for the kit declaration, selecting two cases, 0.725 ms for a direct `drive` declaration, selecting one, and 0.293 ms for `visionTraining`'s boolean table, selecting two. An empty CLI diff, including process startup, TypeScript import and Git reads, took a median 128.75 ms across eight warmed invocations. These measurements ran alongside other worker sessions and are observations, not CI budgets. The scratch scripts and raw audit are `scratch/measure-selector.mjs`, `scratch/selector-measurements.json` and `scratch/selector-audit.json`.

The CLI fixture uses temporary Git commits and the same file-list, config and `-t` arguments as Check. Its isolated config replaces browser global setup so collection and execution need no app server. It checks the kit's desktop and web names, a changed body surrounded by unchanged neighbors, deleted tests and files, an unresolved-title fallback, and the generated cases against Vitest's collected names and passed-case counts. No product walkthrough or announcement applies to this harness entry point.

The isolated selector run passes all 11 tests across three files. The retained JSON report is `scratch/selector-focused-report.json`. The CLI execution fixtures observe two kit cases, two changed parameterized cases with unchanged neighbors excluded, one changed direct case and ten cases for affected-file fallback. Pure setup removals are checked against old-side declaration ranges, while deletion of an entire test leaves its neighbors unselected.

Eight warmed CLI selections in each temporary Git fixture took median 140.17 ms for the kit addition, 137.17 ms for the ordinary parameterized body edit and 142.17 ms for a direct body edit. Their executed selections contain two, two and one case respectively. These CLI timings include startup, parser import and Git reads, but exclude Vitest execution. The script is `scratch/measure-selector-cli.mjs`.

Verification on this host: the isolated selector run passed all 11 tests across three files. `check:changed` passed formatting, ESLint and documentation checks, then remained in repository-wide related-test discovery without reporting tests for five minutes and was interrupted. The standard repository config also stalled when given only these test files. Running the same test files with an isolated temporary root completed successfully, including their nested CLI and Vitest fixtures. This is a local discovery limitation, not a passing `check:changed` result. Logs and the exact focused report are `scratch/selector-check-final.log`, `scratch/selector-focused.log` and `scratch/selector-focused-report.json`. No timeout, retry, skip or quarantine was added to accommodate it.

Review reproduced two missed selections. Vitest expands `styled %c text` to `styled  text`, but the selector retained the literal `%c` and executed zero cases. The placeholder pattern now includes `%c`, and the same probe executes its one case. A setup deletion combined with a declaration rename in one hunk previously selected only the renamed test. Old-side deletion analysis now reads removed lines in every hunk, including replacements, and selects the affected file when any removed setup line lies outside a test. Removing or renaming only a test still avoids that fallback.

The updated isolated run passes 12 tests across the three selector test files. Its generated fixture has 11 runtime cases, including the style placeholder. The additional CLI regression removes shared setup and renames its adjacent declaration together, then verifies the affected-file selection and all 11 executed cases. The report is `scratch/review-selector-report.json`, with output in `scratch/review-selector-isolated.log`.

The standard `check:changed` run also passes during review, including formatting, ESLint, documentation and all 12 related tests in 2.71 seconds of test execution. A local dependency copy omitting the shared caches allowed discovery to complete without a repository configuration change. Its log is `scratch/review-check-final.log`.


### Windows selector deadline

[Check 43930391936](https://github.com/JamelHammoud/basecase/actions/runs/43930391936) at `7adf6a243fdb72c14daf544d2c0dd5514d096682` timed out the combined generated-title assertion after 6,230 ms on Windows. Linux passed it in 2,337 ms. The Windows file's other four tests passed. The failing callback prepared three Git revisions, invoked the selector twice and launched three independent Vitest processes within its 5,000 ms deadline.

Classification: a load-sensitive test workload failure observed on Windows. The selector, its fixtures and its tests are unchanged from the last green full Check at `6be4b9dd8d0e4cf9f0d9c7ceef80166365e36d03`, where this assertion passed on Windows in 3,071 ms. No intervening selector merge or Windows logic defect explains this timeout. The generated-title fixture now shares Git preparation and runs one Vitest process per assertion. Full runtime-title parity, both changed parameterized cases, the changed direct case and unchanged-neighbor exclusion remain exact. This introduces no additional process, timeout, retry, quarantine or gate. Native Windows candidate timing remains for CI, and no failure rate is measured in repair.

## Fleet authorization boundary

The [Fleet service](../guide/fleet.md) uses one evaluator for direct resource reads, enumeration, exports, text assets, mutations and subscription snapshots. Fast tests exercise two organizations, nested sites, group grants, custom role replacement and deletion, deny overrides, attribute conditions, token ceilings, enrollment replay, session revocation and role changes on an open subscription.

The transport test rejects a remote HTTP origin and a wildcard HTTP bind paired with a loopback origin. Request handling also checks the socket peer, preventing a remote request with a forged loopback Host. The service does not trust forwarded headers as proof of HTTPS. The studio connector's redirect refusal prevents bearer forwarding to another origin. Operator-owned configuration is its only source of addresses and credentials. Desktop bridge and trusted IPC implementations are unchanged.

The initial integration run exposed JSON scope arrays being encoded as PostgreSQL arrays instead of JSON. Explicit JSON serialization fixed credential issuance. An export without any export grant initially returned an empty page, and now refuses the request. Allocating a new generation initially cleared the previous source timestamp. Status now stores its observation generation separately and keeps the last observation until a new generation publishes. The original persistence assertion remains intact.

No SAML, SCIM, physical robot, remote identity provider or cross-host TLS deployment was exercised. TLS is required by the service configuration and connector validation outside loopback. The committed integration tests run against HTTP loopback. Registry performance and memory evidence are in [Fleet measurements](fleet.md).

## Nightly Windows static check duplication

[Check run 43831610288](https://github.com/JamelHammoud/basecase/actions/runs/43831610288) at `129c2956` cancelled the Windows unit job at 08:44:31 UTC, fifteen minutes after setup began. `npm run check` began at 08:31:17. Typechecking began at 08:35:39 and Vitest at 08:36:34, leaving 7 minutes 57 seconds for unit tests. There was no stalled final test identified. Tests were still completing normally at cancellation, including the mask test's separate 6.207-second failure. The final aggregate `check` only reported the unit and browser failures and requires no assertion change.

The last green run, [43739315274](https://github.com/JamelHammoud/basecase/actions/runs/43739315274), spent 3 minutes 14 seconds before typechecking and 9 minutes 5 seconds in Vitest. The failing run spent 4 minutes 22 seconds before typechecking. Windows runner image `windows-2025-vs2026/20261103.298.1` was unchanged. This is accumulated suite cost and runner variability, not evidence of a newly hung test or an image regression. No single merge explains the job cancellation.

Windows now omits static checks already run by Linux on the same revision, retaining types, the complete active unit suite and the following native physics step. Replaying the failing timestamps with that work removed recovers about 4 minutes 22 seconds for unit and native checks, without another runner, longer deadline or retry. This is a timestamp projection, not a measured new Windows run. The mask test separately stops recording the reference decoder's per-pixel calls. CI owns the final full-suite runtime and success verdict.

## Windows recovery fixture line endings

Nightly Check 43844795005 failed `workRecovery.test.mjs` after a successful Git refresh because `source.txt` contained `new source\r\n` rather than `new source\n`. The temporary repository omitted the application's `.gitattributes`, so Windows Git's CRLF conversion changed the fixture checkout. The recovery implementation itself preserved the source update and unfinished work. The fixture now commits the application's `* text=auto eol=lf` attributes and explicitly enables `core.autocrlf=true` in both repositories. This exercises Windows conversion on every platform while retaining exact byte assertions for refreshed, modified and untracked files. The existing conflict case stays active. The three related tests passed locally in the changed-file check, with no production recovery behavior or assertion changed.

## Windows loop profile initialization

[Check 43851640785](https://github.com/JamelHammoud/basecase/actions/runs/43851640785) failed the four-process `codexHome.test.mjs` initialization on Windows with `EPERM` replacing `config.toml`. Every process had its own temporary file, but all replaced the shared destination before acquiring the existing `codex-home-auth` claim. The preceding Windows Check passed that same test in 180 ms, and Linux passed at the failing revision in 93 ms. The log and code establish a Windows replacement race rather than an auth-link failure or environment change.

The profile was introduced by `b868834eb3fbaa7a9f56d7d950b9814c8b135816` after the last full green Check at `acb6bad2f3fb2acc770cdb2f885415d14c086a67`. Its 68-file reverse patch does not apply cleanly against current main, including later runner, usage, voice and recovery changes. The dry reverse-application evidence is `scratch/revert-check.log`. This repair fixes forward by placing config write and replacement inside the existing login-sharing claim. Its acquisition budget and interval stay unchanged. There is no new claim, retry or scheduled wait.

The new deterministic test intercepts config replacement and checks that the real filesystem claim is held. Against the original implementation it fails with the claim absent, while the original profile and four-process tests pass. Evidence is `scratch/profile-baseline.log`. It also injects a replacement `EPERM`, checks claim release and successfully initializes again. This tests the ownership boundary on every host without pretending to reproduce Windows filesystem semantics locally. The unchanged four-process acceptance remains active on Windows, Linux and macOS. No profile test is quarantined. CI owns native Windows verification of the candidate.

The final `check:changed` passed formatting, lint, documentation and quarantine validation plus 418 related tests across 51 files in 9.98 seconds. Its evidence is `scratch/repair-check.log`. The baseline regression check failed only the new claim-ownership test, with the two existing profile tests passing. No native Windows candidate or full-suite pass is claimed by this local check.


## Nightly Linux static and unit budget

[Check 43911770581](https://github.com/JamelHammoud/basecase/actions/runs/43911770581) at `3e3441b8fb12428118532c93141b8241a60bb573` cancelled the Linux unit job at 17:05:12 UTC while tests were still completing. There was no failed assertion or named stalled test. The job began setup at 16:50:00, began `npm run check` at 16:51:02 and began Vitest at 16:55:22. Static checks took about 216.7 seconds before TypeScript's 42.7 seconds, leaving only 590 seconds for Vitest. The log contains 1,135 completed test files before cancellation. The same revision passed the Windows unit job with 1,427 passing files, four skipped files and 388.92 seconds in Vitest.

Classification is a platform-only job capacity failure caused by serial Linux static and unit work under runner variability. The last green [Check 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744), at `6be4b9dd8d`, completed 1,405 files in 368.17 seconds of Vitest. The intervening [Check 43906210676](https://github.com/JamelHammoud/basecase/actions/runs/43906210676), at `d91150aeea`, completed 1,431 passing files and one failing file in 358.99 seconds. That named cancellation-test failure was fixed separately by `e0ba06ea7` before the timed-out revision. Of comparable completed files whose earlier duration exceeded 100 ms, the median failing-run to preceding-run duration ratio is 1.769. Formatting, lint and TypeScript also slowed broadly. No individual merge since the last green run explains this uniform slowdown.

The green run used Ubuntu image `20261111.82.6`. Both the preceding and timed-out runs used `20261111.196.1`. Since the preceding run completed unit tests in 359 seconds on that same image, these observations do not establish an image regression to pin or a test flake to quarantine. Complete job logs and job-step metadata were read through the Actions API. Local evidence is retained in `scratch/linux-unit.log`, `scratch/green-linux-unit.log`, `scratch/previous-linux-unit.log`, `scratch/windows-unit.log` and their job metadata files.

The existing nightly static workload now runs in parallel with both unit jobs. This moves about 216.7 seconds off the failing Linux unit path, plus the dependency audit, while adding one setup and dependency installation for the static job. The failing job's checkout, Node, uv and npm setup took about 62 seconds. Applying the observed 1.769 duration ratio to the preceding 358.99-second Vitest run projects about 635 seconds for tests, or about 741 seconds with setup, TypeScript and parity. This projection fits the unchanged 900-second limit but is not a measured candidate run. Shared-host variation and future suite growth remain limits. CI owns the full-suite runtime and passing verdict. No assertion, retry, quarantine or timeout changes.

Local validation parses the workflow and checks that its static and unit commands preserve all nine commands in `npm run check`, plus dependency audit, native parity, pull request selection, the unit matrix and deadlines. Sixteen executions of the actual aggregate Bash script cover passing full and pull request results, static failure, cancellation and unexpected skipping, and failed unit results. The probe and output are `scratch/check-workflow-contract.mjs` and `scratch/workflow-contract.log`. `check:changed` passes formatting and documentation checks for the three changed files. `actionlint -shellcheck=` passes workflow and expression validation. With ShellCheck enabled, both the original and candidate workflow report the same pre-existing SC2129 redirect-style suggestion in the browser selector step. No full suite or browser test was run locally.

## Loop incomplete work recovery

Issue #1551 traced `buildStep` clearing recovery after every successful `changed: false` answer, then recording a decline. An unchanged known input signature with no named pull could wait indefinitely. Repeated source or task changes could instead start fresh worktrees, discarding prior context. An unfinished answer established neither a dependency nor a decision to abandon acceptance.

The committed `tools/loop/fixtures/incomplete-attempts.json` freezes six completed build invocations, two each for #1491, #1272 and #1420. It retains journal ids, hashed work identities, usage, elapsed work and original result evidence. Their notes explicitly report outstanding implementation without an established external blocker. These historical execution statements select the replay sample only. Production admission does not classify prose.

All six used distinct work identities. None of those identities matched a retained worktree at inspection on 16 November 2026. All three recovery records were empty. They therefore supply no safe live recovery to restore, and this change does not clear their declines or manufacture input changes. The sample demonstrates lost session and scratch context. It does not establish how many tracked source lines were lost.

The runner-boundary replay pairs each task's two observed cost records. Its first controlled execution returns incomplete, and its continuation returns a synthetic full-acceptance completion. Production claims, readiness, `buildStep`, recovery records and task accounting run normally. Execution and publication stay controlled. The baseline columns describe the six historical attempts, not a second live provider run.

| Frozen sample | Historical attempts | Controlled recovery replay |
| --- | ---: | ---: |
| Fresh starts | 6 | 3 |
| Same-session continuations | 0 | 3 |
| Lost retained contexts | 6 | 0 |
| Acceptance completions | 0 | 3 synthetic |
| Publications | 0 | 3 controlled |
| Accounted invocations | 6 | 6 |
| Accounted tokens | 2,660,727 | 2,660,727 cost weights |
| Accounted elapsed work | 528,156 ms | 528,156 ms cost weights |
| Incomplete attempts per completion | Undefined | 1 synthetic |
| Total tokens per completion | Undefined | 886,909 synthetic |
| Total elapsed work per completion | Undefined | 176,052 ms synthetic |

The replay reuses measured historical costs as weights. Synthetic completion does not measure the real remaining implementation cost, subscription allowance, throughput or quality gain. Cached inputs are included in input tokens, not added again. These are six selected failures, not a representative sample or a week-over-week comparison. The issue's readiness snapshot found one waiting, eligible, input-ready and dependency-free step among 52 open steps, with four other ready steps building. The latest digest supplied no worst measure. Neither fact establishes a throughput regression.

Actual subsequent outcomes are separate: #1491, #1272 and #1420 were still open when queried at 21:13 UTC on 16 November 2026. No completion caused by this unmerged change has been observed. Future measurements can use the existing journal and publication join, explicit incomplete counts per shipped feature and total observed work per completion. Unknown historical build outcomes remain counted separately. Report retained-history limits and missing usage with any comparison.

Current coverage is in [Loop](../guide/loop.md#0l-how-agents-land-work). The runner acceptance tests retain a tracked edit and an untracked scratch handoff, preserve the original scope and deadline, and assert one publication after continuation. They also cover no source edits, invalid outcomes, devices unavailable, named pull blocks, exhausted continuation, source refresh, interrupted execution, sessionless results, concurrent claims and older decline evidence. Existing builder tests cover commit and publication failure, outbox ownership and duplicate publication protection. No timeout, continuation count, worker count, provider policy, review gate or quarantine condition changed. macOS checks are local. Linux and Windows execution remains with ordinary CI.

Review reproduced three boundary failures with six failing assertions before correction. Converting 1,001 remaining milliseconds to hours and back produces `1000.9999999999999`, which Node rejects as a process timeout. Both runners now round down to whole milliseconds. A primary session was lost when overflow returned either a failed process or an incomplete answer without a session. Both results now retain the interrupted primary handle. Preflight also launched corrections for malformed `complete` outcomes, including one that named a dependency. It now uses the same structured validator as publication. Regression evidence is in `scratch/review-1553-regressions.log`. These corrections add no execution attempts or waiting period.

## Fleet local recovery

`tools/fleet/recovery.test.mjs` exercises the operator's local command and the same PostgreSQL and HTTP authorization boundary as normal identity mutations. Recovery adds no remote endpoint, second evaluator, robot credential or command execution bypass. Remote recovery-shaped requests refuse, cross-tenant account references refuse, and ordinary explicit denies remain authoritative.

One organization-row transaction lock serializes local setup, password rotation, identity edits and credential issuance after login. Login performs scrypt outside the lock and rechecks the stored hash inside it. HTTP identity writes reauthenticate after locking. Rotation deletes all organization credentials without reviving revoked tokens. Existing notifications reset active subscriptions. An injected failure at the recovery audit insert leaves the original password and credentials intact.

The dedicated recovery account and role cannot be deleted, replaced, enrolled or referenced by ordinary groups or accounts. Their restrictive foreign keys also prevent accidental SQL deletion through the resource table, but the database administrator can alter the schema and bypass this protection. Audit rows carry organization, actor, action, affected identity, database timestamp and outcome. Success commits with authority. Refused protected API mutations roll back before a separate record is committed, so an interrupted process can lose a refusal record without partially changing authority.

Local actor attribution derives from PostgreSQL current_user, hostname and OS username. Shared service accounts remain shared actors. Database administrators can rewrite both authority and records. The implementation claims neither database tamper resistance nor attribution to a person behind a shared login. Secret JSON enters bounded stdin, with sanitized local errors and captured stdout and stderr checked for password and token canaries. No recovery token expiry applies because database access is the recovery authority. [Fleet recovery matrix and validation](fleet.md#local-organization-recovery) records acceptance coverage and execution limits.

## Scene history persistence

Desktop history content and manifests live under a fixed `.history` directory, keyed only by verified SHA-256. Scene ids retain `checkedFileId` validation. Reads refuse symbolic links, nonregular files, mismatched sizes and hashes, and manifests above the shared byte budget. Immutable content precedes the atomic scene-reference replacement. Interrupted reference publication leaves the previous scene readable. Shared content remains after deleting a scene, preserving linked branches without garbage collection. `electron/library/sceneRecovery.test.mjs` exercises relaunch, interrupted writes, shared-block growth, corrupt content and forged hash paths. [Renderer and browser evidence](performance-workspace.md#scene-version-codec-and-atomic-replacement) owns the graph matrix and measurement limits.

## Shared picomatch audit stall

On November 17, 2026, repair #1651 and unrelated pull requests #1656, #1657, #1658, #1659 and #1661 were blocked by the dependency audit after [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) was reviewed that day. Check 44135307313 on #1651 reported `26 vulnerabilities (1 low, 4 moderate, 21 high)` at 17:19:42 UTC and exited 1. The high findings were picomatch and its dependent toolchain packages. At 17:34:41 UTC revise logged that no patched release existed and a validated dependency patch exceeded the sharding revision's scope. The other revisions made the same diagnosis. Repair kept reporting `a repair pull request is already open`, while merge reported `nothing ready to land`. Nudging the same heads did not change their dependencies.

Registry inspection confirmed that upstream's latest release was 4.0.7 and the advisory covered every released version. npm's proposed forced Vitest and tooling downgrades were not a dependency fix. The exact published replacement is [@ryotsu/picomatch 4.0.7-a](https://github.com/ryotsu-kankichi/secured-picomatch/commit/3ab5a7627d480259e3d9ca67fbc14c125d374f0e). Comparing both registry tarballs found runtime changes only in `lib/parse.js` and `lib/constants.js`, plus package metadata and README changes. The fork has no runtime dependencies or install script. The override changes one lockfile package entry and pins its registry integrity. No other package version changed.

A bounded Node v26.13.0 subprocess matching `+(*a)` against 80 `a` characters followed by `!` timed out with upstream after 2,002 ms. The fork returned false in 34 ms. These are single local observations including startup, not a performance rate or CI projection. The committed dependency test checks 48 hostile evaluations in one bounded subprocess and 7,020 supported matching comparisons. It also covers literal stars, unsupported repetition and real filesystem selection through tinyglobby. The four tests passed in a 122 ms Vitest run. The regression guard is a process deadline that safely terminates a vulnerable matcher, not a shared-host timing assertion.

A clean isolated `npm ci --ignore-scripts` succeeded. `npm audit --audit-level=high` changed from 21 high findings to zero high and critical findings. Four moderate findings remain in Hono, its Node adapter, uuid and vosk-browser, with one low fast-xml-parser finding. The broader `npm run security` scan still exits 1 for pre-existing Node 26.13.0 and Electron 45.2.3 update findings and token-shaped constants in four Hub test fixtures. Its Python scan was clean. This repair changes only the shared CI audit blocker and does not claim a clean toolchain or whole-app security audit. Reports, tarball comparison and check logs remain in `scratch/doctor-*` and `scratch/security/`.

No Check rerun could repair a locked vulnerable package, so no failed run was retried. The older #1659 run completed while inspected. Main's newer suite still had jobs making progress and was under 30 minutes old, so it was left running. Hosted Linux and Windows validation belongs to Check after publication. No full suite, browser suite, quarantine, retry, timeout increase or audit suppression was used.

## Site contraction regression

[Check 44164732083](https://github.com/JamelHammoud/basecase/actions/runs/44164732083) failed its static job at `6e69d9592418b6ce15a2ddc65df2190aba84a412`. `check:site` rejected the uncontracted negative on line 15 of `site/content/changelog/2026-11-17-export-electronics-with-a-robot-kit.md`. The chained static command stopped there, so the log gives no verdict for its later quarantine, formatting, lint or Python checks.

Classification: broke at a commit. The last successful main Check returned by the workflow history was [43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889) at `348373decd8013d264fc3e2e9fe1f8b298051b34`. Commit `ac4ef6d92a3730e331c81df0042ee1e0cdb534bc` (#1688), after that green revision, added the offending sentence. Running `node tools/check-site.mjs` on the repair's unchanged starting tree reproduced the same file, line and contraction diagnostic with exit code 1. This is a deterministic content failure, with no platform or environment cause indicated.

The introducing merge reverted cleanly with `git revert --no-commit`, then its feature patch was reapplied for the fix forward. The final content change contracts the negative and preserves the sentence's electrical-validation limit. Existing `tools/check-site.test.mjs` coverage checks negatives in prose and titles and excludes code spans and front-matter keywords. No assertion, checker, timeout or quarantine changes are needed. The changed-file check passed all 330 site pages, documentation validation and formatting. It does not establish a full nightly verdict, and no browser observation is needed for this prose correction.


## Windows nightly unit capacity

[Check 44164732083](https://github.com/JamelHammoud/basecase/actions/runs/44164732083) cancelled its Windows unit job after 15 minutes while tests were still progressing. Checkout and install consumed about 92 seconds, typechecking about 50 seconds, and Vitest ran from 20:03:20 to cancellation at 20:16:03 UTC. The full log contains 1,570 completed or failed-setup file records, without a final suite verdict. It contains three independent intermittent setup failures, recorded in [Build](testing-build.md#windows-setup-repair-on-17-november) and [Fleet](fleet.md#windows-access-and-federation-setup-recurrence).

The preceding full green [43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889) ran on the same Windows image `20261103.298.1` and Vitest 5.0.5. Its unit job took 13 minutes 51 seconds, with 1,450 files and 694.68 seconds in Vitest. The failed job had already reported 120 more files before cancellation. The current checkout has over 1,600 unit files. This is accumulated workload growth on Windows, without evidence of an image change or one faulty merge to revert. The log does not isolate a single slow test responsible for the total.

The workflow now gives Windows two disjoint Vitest shards, retaining the 15-minute job deadline and ordinary test budgets. Linux and pull request checks remain single jobs. Passive native parity runs once per platform. This adds one Windows setup and typecheck to reduce elapsed time and distributes every active test once. It adds no wait, retry or quality gate. The 694.68-second green baseline had little remaining capacity, which justifies sharding instead of a longer timeout. No candidate full-run speedup or billed-minute saving is claimed before publication and nightly execution. Installer partition checks exercise the same Vitest sequencer used by the execution pool. Full logs are in `scratch/green-unit-windows.log` and `scratch/unit-windows.log`.
