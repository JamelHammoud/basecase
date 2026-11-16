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

## Loop capability wait evidence

Review of #1263 found that adding a missing capability changes `taskInputSignature`, which includes available capabilities. For an unchanged task declined with both a missing capability and an open pull request in `waitFor`, the changed-signature return in `stepWaiting` bypassed that pull request. The original dependency regression had no input signature, so it missed this case.

`stepState.test.mjs` now covers the combined case with distinct input signatures. Capability availability keeps the task waiting while the named pull request is open and releases it immediately after closure. Tasks with changed definitions still discard the old decision. This is deterministic state coverage and does not require a Windows host or establish diagnostic throughput. Current coverage is listed in [Loop](../guide/loop.md#0l-how-agents-land-work).

Further admission replay reproduced four failures. Five-run Windows before/after measurements, baseline/candidate Windows runs and Windows process-trace capture all passed the gate because inference required a ten-run before/after comparison. A Linux-only measurement was rejected when its Windows-titled task also mentioned quarantine. Sentence-level measurement attribution now preserves that Linux work while recognizing controlled Windows runs at other sample counts and process-trace collection. Static snapshot comparisons remain eligible. A host regression fixture also preserves rejection of execution on an interactive Windows host without rejecting ordinary Windows desktop compatibility descriptions. Admission tests verify refusal before voice or GitHub calls, and the builder test verifies refusal before opening a worktree. These are deterministic admission checks without host execution or throughput measurements.
