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
- A job over the timeout (default 90 s) or a window over 4 GB kills that window (`forcefullyCrashRenderer`, then `destroy`): a spinning worker can't stop it. A fresh one starts on demand. `kernel_warm` starts one early to hide startup cost.
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
