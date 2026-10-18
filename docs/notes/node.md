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
- Stoplight position must match `LAYOUT` in `theme.ts` (see AGENTS.md §2).
- Stoplights hide in full screen; `enter-full-screen` / `leave-full-screen` are forwarded so the renderer can move the sidebar toggle into their space.
- Links (agent reply sources) always go to the system browser via `setWindowOpenHandler`.

## electron/app-menu.mjs
- Menu state defaults live in `DEFAULT_STATE`; `tabs` lists open scenes for the Window menu (first nine get ⌘1–⌘9).
- Renderer-handled shortcuts use `registerAccelerator: false` through the `item()` helper.
- Dev-only reload and DevTools items are gated on `process.defaultApp`, not `app.isPackaged`: the dev Basecase.app renames the executable, so `isPackaged` is true in dev.

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
### client.mjs
- A job over the timeout (default 90 s) kills its kernel; a fresh one starts on demand. `warmUp()` starts one early to hide startup cost.
- Permission-model read grants list both a path and its real target: Node checks the resolved path of a symlinked folder.
- If Node has no permission model, OpenSCAD still runs unsandboxed (WASM is sandboxed by design).
### kernel.mjs
- `$fa = 6; $fs = 0.5;` is prepended on the same line so error line numbers match the user's code.
- A CGAL hull assertion (`applyHull` / `assertion violation`) at low segment counts is retried once with a forced `$fn`.
- Unknown modules, functions and variables ("Ignoring unknown") count as errors: OpenSCAD otherwise silently builds wrong geometry.
- BOSL2 errors put the message on the lines after `ERROR`; `explainErrors` reads up to 5 continuation lines and the first trace line in the user's file, minus the raw assert source.
- The OpenSCAD instance is warmed after each render (libraries already copied) and reused; jobs are chained so an instance and its log buffer are never shared.
- `replicadHints` maps common replicad runtime errors to one-line fixes. Edges are optional (a failed edge extraction doesn't fail the part); volume is kept from the mesh.

## electron/cad-mcp-server.mjs
- `CAD_NO_WEB=1` hides the web tools (benchmark offline mode).
- `model_part` sends a `focus` bridge event with a 5 s timeout, errors ignored; it must never block the compile.
- Newly placed catalog parts get an immediate clash check (`clashText`) because real parts stay while block-outs are temporary.
- `profileText` takes band widths from part bounding boxes (CAD frame), as fractions of total height.
- `compare` measures silhouettes only for straight-on views (front, back, side) and degrades silently: measuring is optional, and a failed downscale sends the original image.
- `find_robot_description`: GitHub allows 60 unauthenticated requests an hour, so at most two searches (`<name> urdf`, then `<name>`).
- Repo ranking uses name tokens: every query token must match and each extra variant word (lite, mini, v2, gazebo…) counts against, so "Berkeley Humanoid" doesn't pick the Lite.
- `find_images` / `view_image` allow public http(s) only: localhost, `.local`, 10.x, 127.x, 169.254.x, 172.16–31.x, 192.168.x, 0.x and bracketed IPv6 hostnames are refused so the app bridge and the LAN stay out of reach.
- `view_image` asks the app to downscale to Claude's 1568 px vision size and falls back to the original on failure.
- Posing replies carry text plus preview images (`withImages`).

## electron/robot-skeleton.mjs
- Fixed frames (head, camera, sensors) count in `check_skeleton`; only joints named `dummy` are excluded.
- The skeleton's lowest joint is fitted 0–120 mm above the model floor (sole frame or ankle) unless `floorOffset` is given.
- A joint is an axis line. Its position along the axis is trusted only when the mirrored partner agrees (e.g. ±160). When left and right disagree (109 vs -72) the CAD export put the frames on different faces, so only the line must pass through the model.
- Partner = parallel axis, mirror image in X, same height and depth (except along the axis).
- Sensors (cameras, lidars) look out through the shell, so their frames sit at the surface; `surfaceGap` allows that.
- GitHub blob links are rewritten to raw links before fetching.

## bench/ pipeline
- `run.mjs`: POSTs use a no-timeout fetch because fetch's 300 s header timeout is too short for a build.
- `run.mjs`: preflight compiles a part in the snapshot, because a sandbox path error silently turns every part into a block.
- `run.mjs`: refuses a busy port and checks its own vite stays alive; never drives someone else's server.
- `run.mjs`: headless Chrome uses `--enable-unsafe-swiftshader --use-angle=swiftshader` (software WebGL).
- `run.mjs`: event log drops big payloads; counts tool calls, model_part calls, failed tools and thought/message chunks.
- `run.mjs`: concepts have no photos; the brief is the whole input. Close-ups cover the two largest subassemblies (not fastener-only groups). Concepts also render internals; build tasks save scene, BOM, print plan and checks.
- `run.mjs`: single-part tasks (`modelItYourself`) record `placedCatalogParts` to detect cheating by placing the catalog part.
- `run.mjs`: the objective craft check runs `window.__studio.interference()` for leftover primitives and parts passing through each other.
- `--app <dir>` runs a prepared copy (e.g. an older prompt for a baseline).
- `score.mjs`: robust bounds use 0.5–99.5 percentiles of area-weighted surface samples so a 1 mm antenna or cable doesn't set size.
- `score.mjs`: models are put on the floor and centered on the robust x/y center. The reference gets 4 yaw turns (robots don't share a forward axis), or all 24 cube rotations for single parts.
- `score.mjs`: part count is reported but not scored; URDFs merge each link (13 for Berkeley, 161 tiny ones for Reachy).
- `score.mjs`: shape score = 0.4 silhouette + 0.15 scale + 0.1 proportion + 0.25 chamfer; chamfer uses a spatial hash for nearest distances. `overlay.png`: blue = real only, orange = agent only, white = both.
- `drawing.mjs`: a line drawing's silhouette is everything not reachable from the border through light pixels, so white panels enclosed by outlines count as the robot. Row 0 is the bottom, matching model silhouettes.
- `drawing.mjs`: model and drawing are scaled to the same height, so IoU measures proportions, not size; the width profile reports over/under by tenth of height. The PNG reader handles 8-bit non-interlaced gray, RGB, gray+alpha, RGBA only.
- `geometry.mjs`: a silhouette triangle that is degenerate in the view marks its own pixels so thin walls still count. The PNG writer has no dependencies.
- `fetch.mjs`: resolves Git LFS pointers; mesh references are matched by file name, preferring files near the URDF.
- `robots.mjs` task rationale: Berkeley's description has no arms, so the prompt scopes to torso and legs. Reachy's URDF zero pose dips the head into the body while photos show it raised. G1 is photos only (`offline`) to test design skill, and its zero pose has forearms forward, so elbows are overridden to pi/2. Memo's four photos are inputs; its orthographic drawings are held out. MicroDuck publishes only a kinematic skeleton, so it's scored on proportions.
- `judge.mjs`: runs headless Claude Code with read-only tools. Output may be one result object or an event array ending in a result; `extractJson` takes the last balanced `{…}` that parses and has the score keys. Concepts also get the assembly tree so mechanisms behind covers get credit.
- `replay.mjs`: rebuilds the final model from `events.jsonl` using the final rawInput per call id; `model_part` is recompiled with the kernel. `--keep` leaves the app up for `/api/bridge/agent-call`; `--only "a,b;a,c"` renders each id set separately (bisecting artefacts); `--silhouette <image> [--view front]` prints the measured profile `compare` reports.

## tools/parts
- `convert-step.mjs`: `files` merges several CAD files into one part and assumes a shared assembly frame.
- `convert-step.mjs`: native OpenCascade (`reader: native`, `step-native.py`) writes a temp `.bin` under `os.tmpdir()`; native reads come without bodies, so `keepBox` filters triangles individually.
- `convert-step.mjs`: some exports only tessellate with OpenCascade's own defaults (`meshing: 'default'`).
- `keepBox` drops bodies not fully inside the box, in the file's own frame (mm). Rotation steps are `[["x", 90], ["z", -90]]` degrees applied in order.
- `convert-urdf.mjs`: model units are meters; output is mm in studio Y-up. Debug colors in simulation models: `modelColors: false` uses `defaultColor` (fallback `[0.6, 0.6, 0.62]`).
- `convert-urdf.mjs`: `<transmission>` blocks also hold `<joint>` tags, without parent/child, so joints are filtered by having `<parent>`. `rootLink` builds one subtree (e.g. a gripper of a full arm); otherwise the root is the link that is never a child. MJCF collision-class geoms are skipped.
- `glb.mjs`: the CAD origin offset is stored so datum-relative features (mounting holes) stay exact after centering on the bounding box.
- `glb.mjs`: simplify error is 0.0015 of part size (about 0.13 mm on an 85 mm board), only above the triangle budget.
- `glb.mjs`: CAD "no color assigned" defaults (`cad1ee`, `97a3da` / `98a4dc`; exporters round slightly differently) display as neutral grey; `colorMap` overrides per CAD color.
- `glb.mjs`: vertices weld on a 1 µm grid so the simplifier sees connected surfaces; collapsed triangles and unused vertices are dropped; output is minimal glTF 2.0 with one primitive per color.
- `rebuild-sizes.mjs`: run after parallel conversions or generations (they race on `component-meshes.json`); each GLB's extras hold its exact size and origin.
- `generate.mjs`: random high port (5300+), because a stale browser tab on a familiar port (5174, 5181…) would reconnect and answer the agent's scene requests with its own scene.
- `generate.mjs`: fresh scene and conversation per part; the reply text resets whenever a tool call arrives between text chunks (only the last paragraph is kept); a verification round measures every official number on the model, not just the envelope.
- `tools/robots/previews.mjs`: uses a random high port for the same stale-tab reason, runs the app's own import and preview code, and software WebGL.

## tools/sim
- `smoke.mjs`: asserts the WASM and Python MuJoCo are the same version and agree on where a small robot (free body, hinged arm, position servo, convex mesh) ends up.
- `update-mujoco.mjs`: updates `@mujoco/mujoco`, `mujoco==` in `electron/trainer/pyproject.toml` and `uv.lock`, syncs the trainer env (`uv sync --frozen`, env in `library/trainer-env`), then runs the smoke test.

## vite.config.ts
- `library/` and `ai-reference/` are ignored by the watcher: saved scenes, models and briefs are app data and must not reload the page.
- The agent backend starts lazily; only a browser tab opening the SSE stream (`/api/events`) needs it.
- `/api/events` streams ACP and file-watcher events in web mode.
- Dev-only `/agent-call` replays a CAD-tool request against the open tab, the same path the MCP server uses.

## electron/cad-agent-prompt.mjs
- The prompt is delivered both as the MCP server's `instructions` and appended to Claude Code's system prompt.
- Distilled from: CADAM/Adam (Claude + OpenSCAD + BOSL2, parameters up top), CADCodeVerify and CAD-Assistant (compile/render, verify questions, fix), build123d-mcp (measure every part, one feature at a time), FreeCAD-MCP and openscad-mcp (standard views), Img2CAD and OmniPart (structure before dimensions), ShapeAssembly (symmetry as an operation), Chourrout's Claude CAD skill (confirm base shape before details), Backflip (chamfers last).
