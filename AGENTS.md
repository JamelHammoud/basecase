# AGENTS.md — Design, Copy, and UI/UX Guidelines

This document defines the design principles, UI/UX conventions, copy rules, and architectural standards for **Basecase**, a 3D robotics CAD studio with an AI agent. Any agent modifying or extending this codebase must consult, follow, and maintain these guidelines.

**Writing any code?** Follow §0. It's mandatory, and the tooling enforces it: `npm run check` must pass before you finish. Throwaway scripts, debug tests and local outputs go in the gitignored `scratch/` folder, never in `src/` (§0g).

**Writing any user-facing text** (labels, buttons, headers, captions, empty states, toasts, errors, tooltips, agent-facing UI)? Follow §3, and run its checklist (§3d) on every string you add or change.

**Adding a part** (a servo, board, sensor or any product, often from an Amazon or store link)? Follow [.agents/skills/add-part/SKILL.md](.agents/skills/add-part/SKILL.md) step by step, whichever agent you are.

References studied for this system: Figma UI3, the OpenAI Codex / ChatGPT desktop apps, mobbin.com, Linear, Raycast, macOS Tahoe Liquid Glass (WWDC25 “Meet Liquid Glass”), Vercel Geist, Things 3; copy guides from Apple HIG, Mailchimp, Material, Shopify Polaris, Atlassian, Microsoft, GOV.UK, Stripe, Linear and 37signals.

---

## 0. Code Conventions (mandatory)

These rules hold for every human and agent, on every machine. They're enforced by tools, not memory: don't rely on yourself to follow them, run the tools.

### 0a. Tooling

- **Prettier** formats (`.prettierrc.json`: single quotes, 120 columns). **ESLint** (`eslint.config.mjs`) enforces everything else. Custom rules live in `tools/eslint/`.
- `npm run check` = `check:tracked` (§0g) + `format:check` + `lint` + `lint:py` (Ruff, `ruff.toml`, run through `uvx`) + `typecheck` + `test`. It must pass before you finish any change. `npm run lint:fix` and `npm run format` fix what they can. `npm run test:e2e` drives the real app headless (see §0e); run it after UI or viewport changes.
- **Hooks run automatically:**
  - Git pre-commit (`simple-git-hooks` + `lint-staged`, installed by `npm install`): formats and lints staged files, then runs `check:tracked`; a commit with lint errors or internal files fails.
  - Claude Code (`.claude/settings.json` → `tools/hooks/claude-post-edit.mjs`): after every Edit/Write, the file is formatted and lint-fixed, and remaining errors come back to the agent. Fix them before moving on.
- **Agent-neutral layout.** This file is the instructions for every coding agent. Skills (step-by-step procedures in the Agent Skills format: a folder with `SKILL.md` and its scripts) live in `.agents/skills/`; `.claude/skills` is a symlink to it so Claude Code finds them. Put new skills there, never in a provider's folder. Provider folders (`.claude/`) hold only that provider's wiring (settings, hooks), and the scripts they run live in `tools/`.
- **No escape hatches.** Inline `eslint-disable` comments are ignored (`noInlineConfig`), and `@ts-ignore` / `@ts-expect-error` are comments, which are banned. Fix the code. Never loosen `eslint.config.mjs`, `tsconfig*.json` or the Prettier config to make something pass; changing a rule needs a maintainer's OK, and the change is recorded here.

### 0b. Rules (all errors)

| Rule | Limit | How to comply |
|---|---|---|
| No comments (`basecase/no-comments`) | none, except `@vite-ignore` / `#__PURE__` pragmas | Name things so the code reads on its own. Lasting context (why a value is what it is, platform quirks, bugs avoided) goes in this file or `docs/notes/` (`ui.md`, `core.md`, `node.md`) |
| No nested `if` in one function (`basecase/no-nested-if`) | 0 | Guard clauses and early returns, combined conditions, lookup tables, or extract a named predicate / function |
| Blank line between statements of different kinds (`@stylistic/padding-line-between-statements`) | — | Auto-fixed. Consecutive declarations or expression statements may group; every `if`, loop, block and `return` is set off by blank lines |
| `max-lines` per file | 400 (blank lines not counted) | Split by responsibility into sibling modules. Data catalogs (`src/data/`) and the agent prompt are exempt |
| `max-lines-per-function` | 120 | Extract subcomponents, hooks or helpers |
| `complexity` / `sonarjs/cognitive-complexity` | 15 / 15 | Same |
| `max-depth` | 3 | Same |
| `max-params` | 4 | Pass an options object. Tuple rest parameters (`...[a, b]: Args`) are banned too (`basecase/no-rest-tuple-params`) |
| `no-nested-ternary`, `no-else-return`, `no-lonely-if`, `prefer-const`, `eqeqeq` | — | — |
| React hooks + React Compiler rules (`react-hooks/*` recommended-latest) | — | See §0c |
| `sonarjs` recommended (duplication, dead code, identical branches…) | — | Some security rules that don't fit a local desktop app are off; see the config |
| Python (`ruff.toml`) | 120 columns; 4 args, 15 branches, 60 statements, complexity 15 | Same approach: helpers and small dataclasses |

### 0c. Design

- **SOLID and DRY.** One responsibility per module, component and hook. Before writing a helper, search for an existing one (`src/utils`, `src/design-system`, `src/three`); extend it rather than copy it.
- **Small primitives that compose.** UI comes from `src/design-system` (§14); a pattern used twice becomes a component there. Pure logic (geometry, BOM, kinematics, engineering checks, parsing) lives in framework-free modules that take plain data and return plain data, so it can be tested without React or WebGL.
- **React:**
  - The React Compiler (`babel-plugin-react-compiler` via `@rolldown/plugin-babel` in `vite.config.ts`) memoizes components and hooks. Don't add `useMemo`, `useCallback` or `memo` by hand unless profiling shows the compiler can't cover a case.
  - A hook that calls no other hooks isn't compiled by default; put `'use memo'` at the top of its body when its returned callbacks must keep their identity (e.g. they feed a memoized object or a child's props).
  - Follow the Rules of React so the compiler can optimize: derive values during render instead of syncing them with effects, don't read or write `ref.current` during render, don't mutate props or state.
  - An effect that needs the latest value of something it shouldn't re-run on uses `useEffectEvent`, never a trimmed dependency list.
  - A component file exports one component; private subcomponents and hooks go in sibling files when they'd push it past the limits.
- **Formatting of statements** (enforced): blank lines separate different kinds of statements, e.g.

  ```ts
  const foo = 'foo';
  const bar = 'bar';

  if (foo === 'bar') {
    return false;
  }

  return foo === 'foo';
  ```

### 0d. Running the app

- `npm start` builds once and runs Electron against the production bundle (`vite preview` on :5173). Use it to use the app or judge how it feels: dev-mode React is several times slower.
- `npm run electron:dev` runs Electron against the Vite dev server with hot reload, for development.

### 0e. Tests

- **Vitest** (`npm test`; `*.test.ts` next to the code, `vitest.config.ts`). The whole suite stays fast (seconds), so run it freely.
- Prefer integration tests that drive a real pipeline with real data (a saved scene through BOM and engineering checks, a URDF through import and kinematics) over unit tests of internals. Add a test when you fix a bug or change a pipeline; don't test trivia or styling.
- Every test must earn its keep: if it's slow, flaky or breaks on harmless refactors, fix or delete it.
- `npm run perf:agent` (`tools/perf/`): builds production into `node_modules/.cache/perf-agent/dist`, opens it in headless Chrome (Metal on macOS, `--cpu` for SwiftShader) with a fixture robot built in code (225 CAD parts, about 300k triangles, 14 joints), replays what an agent run sends (streamed chat, `model_part`, `look`, `check_scene`, `get_bom`, `verify_design`…) and prints each tool's time, its longest main-thread task and worst frame. `--budget 100` fails when any task runs longer; `--profile <phase>` saves a CPU profile; `--dist <dir>` measures another build (an older one, for before/after). Run it after any change to agent tools, captures, autosave or the viewport. Plan and history: [docs/Performance plan.md](docs/Performance%20plan.md).
- `npm run test:e2e` (`e2e/`, `vitest.e2e.config.ts`): starts Vite, opens the app in headless Chrome (playwright-core) with the backend routes stubbed (no agent is started and `library/` isn't touched), and checks adding, selecting, duplicate/undo/redo, every panel switch and panel toggle with no console errors. About 20 s.

### 0f. Performance (mandatory)

The app must feel instant. These rules came out of profiling real scenes (60+ CAD parts, 50+ MB saved files); don't regress them.

- **The viewport never rebuilds everything.** `src/three/viewport/` is a plain TypeScript engine behind the thin `Viewport3D` component. `PartLayer.sync` diffs parts by object identity: unchanged parts are kept, a transform-only change moves the group, and only changed or re-selected parts are rebuilt. Parts are immutable; always replace a part object to change it, never mutate one. Builds are time-sliced (about 10 ms per frame), so opening a big scene never freezes; queries that need the whole scene (captures, measurements, picking, framing) finish pending builds first (`NEEDS_WHOLE_SCENE` in `engine.ts`).
- **Derived geometry is shared and released.** `buildPartGroup(part, selected, { shareGeometry: true })` takes creased normals, edge lines and hardware booleans from a reference-counted cache keyed by the source data (`partMesh/sharedGeometry.ts`). Every group built that way is freed with `releasePartGroup`, which also disposes the materials and owned geometry. Anything you remove from a scene must be disposed.
- **Heavy geometry runs in workers, never on the main thread.** The geometry worker (`three/geometry.worker.ts`, ops in `geometryOps.ts`, client `geometryWorker`) parses robot meshes, welds and simplifies links, assembles link soups, computes creased normals, edge lines and component GLBs. Before a big `mesh` / `cad_part` is built, `PartLayer` waits for `preparePart` (`partMesh/prepare.ts`) to seed the shared cache from the worker, so the main-thread build only wraps ready arrays; edge lines over 500 triangles arrive later (`partMesh/lateEdges.ts`, `lateEdges: true` in the viewport only) and redraw through `requestRedraw`. Builds are also capped by vertices uploaded per frame, so a robot's GPU uploads spread over frames. Send mesh arrays to workers as typed arrays (`packedMesh`): structured-cloning a JS number array costs several times more. `workerRpc` falls back to running in-thread where there are no workers (tests, Node). Never pause builds while the camera moves: make the build cheap instead.
- **Agent checks never run on the main thread.** Interference (`check_scene`, pose checks), range-of-motion sweeps (`verify_design`), printability and part measurements run in a pool of analysis workers (`three/analysis/`: `analysis.worker.ts`, client `analysisPool`). The viewport only snapshots plain data (`snapshotShapes`: per part a shape key, its geometry and a rigid frame matrix) synchronously, so a snapshot always matches the pose at call time; the work is awaited. Workers keep each shape's geometry, BVH (built lazily) and samples by shape key, so identical parts share one shape and later calls reuse them; geometry is copied to a worker once, in 8 ms slices. Checks use matrices on cached shapes, never a mutated live scene. Sweeps fan out one joint per worker and skip pairs that move together. The engineering report runs twice: once to collect the sweeps it needs, then with their results (`engineeringNow.ts`). Every `Viewport3DHandle` query that does real work is async (`interference`, `posedInterference`, `sweepClashes`, `measureParts`, `printShapes`, `captureViews`).
- **Captures encode off the main thread.** `captureViews` renders each view with the live renderer (so the agent's renders look exactly like before), copies it at the requested size into an `OffscreenCanvas` right after rendering (`transferToImageBitmap`, synchronous: a WebGL canvas has no preserved drawing buffer, and `createImageBitmap` on it reads blank), and encodes it in the image worker (`utils/image.worker.ts`, `encodeBitmap`). `downscaleDataUrl` goes through the same worker. Never `toDataURL` a capture on the main thread.
- **Printing never blocks the UI** (§8f): orientation candidates are found in the analysis workers (cached per shape), each scene's 3MF is welded, written and zipped in an analysis worker (`threeMf` task), and slicing runs as a child process in the main process. Plate layout and packing are plain data on the main thread (microseconds per part).
- **Thumbnails render in a worker** (`thumbnail.worker.ts`, OffscreenCanvas, encoded with `convertToBlob`): Library, Parts, scene previews and robot previews all go through `renderPartGroups`, which is async. Never `toDataURL` a thumbnail on the main thread.
- **Shaders are compiled before they're needed.** `warmShaders` compiles the scene (gizmo included) and the part materials with `compileAsync` at startup, finishes one program per idle callback, then renders one hidden shadow pass, so the first part, selection or shadow never stalls.
- **Render on demand.** `RenderLoop` draws only when something changed (`invalidate()`), the camera moved, an animation runs, or a texture finished loading, plus a 1 s idle refresh. Code that changes the scene outside the engine's own paths calls `invalidate()`. Never add an always-on `requestAnimationFrame` render. Camera moves call `noteInteraction`, not `invalidate`: the shadow map (`autoUpdate = false`) re-renders only when the scene changed, and the key light refits once the camera settles. Anything that renders a changed scene itself (captures) sets `shadowMap.needsUpdate`. The viewport has no `preserveDrawingBuffer`: read the canvas only right after rendering it, in the same task.
- **Autosave never re-serializes unchanged parts.** `sceneJson` caches each part's JSON by object identity, slices the work across frames and sends one string (`saveSceneJson`).
- **No canvas reallocation during panel animations.** `CanvasSizer` keeps the canvas centred in its card, grows the drawing buffer once and shrinks it only after the size settles, and redraws synchronously after a resize so there's never a blank frame.
- **Heavy work never blocks a click.** Cache by input identity (a `WeakMap` on immutable parts, or shape keys) and spread uncached work across frames with `await` between small chunks (`components/build/useBuildReport.ts`). Profile anything over 16 ms.
- **Keep views alive.** Panels that switch (sidebar views, inspector tabs) mount on first use and then stay in React's `<Activity>`, so switching back is instant and hidden views run no effects.
- **Small payloads across IPC and HTTP.** Lists are summaries (`SavedSceneSummary`: counts, size, a small WebP preview); full records load on demand (`platformBridge.getScene`). Library JSON is written compact. Never send a whole library over IPC.
- **React Compiler friendliness** (§0c) is a performance rule: one rule break makes the compiler skip the whole component, and everything under it re-renders on every change.
- **Boot never waits on anything it doesn't need to draw.** The window opens before the agent connects (`connectAcpAgent` runs in parallel; it used to delay the window 0.7–2 s, and status reads `connecting` meanwhile, so nothing says “disconnected”). Anything that needs a session awaits that first connect (`AcpAgent.pending`) instead of starting a second. Only the active tab mounts at first; background tabs mount one per idle callback after its first frame (`useMountedTabs`), since each builds its own WebGL context, environment map and shaders (about 60–250 ms apiece). Events for a tab that hasn't mounted are dropped, not refused: on mount it adopts its runs from the journal and the bridge replays unanswered requests. Measure boot with real scenes reopened (`open-scenes` in `localStorage`), not an empty one.
- **Measure in production:** `npm run build && npm run preview`, then time interactions with a `PerformanceObserver` for `longtask` entries. Dev mode adds 30–130 ms per interaction and misleads.

### 0g. What never gets committed

Anything that only serves this session or this machine stays out of git. Put it in a gitignored place from the start; don't create it in `src/` and plan to delete it later (a stray debug test once blocked a 400-file commit).

- **Scratch work goes in `scratch/`** (gitignored, skipped by ESLint and Prettier, not typechecked): debug tests, one-off scripts, probes, dumps, renders, notes. Import app code with relative paths (`../src/guide/guidePlan`). Run scratch tests with `npm run scratch` (`vitest.scratch.config.ts`; `npm run scratch -- scratch/foo.test.ts` for one); they're never part of `npm test`. Large or temporary outputs can also go in the system temp folder.
- **Internal notes go in `internal/`** (gitignored, skipped by ESLint and Prettier): research, plans, chat and session analyses, design explorations, anything written for the maintainers rather than for contributors. `docs/` holds only what a contributor needs: the plans this file links to, `docs/notes/`, the lessons playbook, and the research the code cites. If a doc in `docs/` cites something in `internal/`, move the source into `docs/` or drop the citation.
- **Local data stays where it is:** `library/` (scenes, chats, references, prices, agent config and keys), `ai-reference/`, `bench/data/` and `bench/runs/`, `tools/parts/cad/`, `tools/parts/generated/*.log`, `electron/trainer/.venv/`. Code and committed tests never read from `library/` or `ai-reference/`: a test that needs a scene builds its fixture in code, so it runs on a clean clone.
- **Never commit** secrets (`.env*`, API keys, tokens, `auth.json`), per-machine settings (`.claude/settings.local.json`, `.claude/launch.json`), caches (`__pycache__/`, `.ruff_cache/`, `node_modules/.cache/`), build output (`dist/`, `electron/native/*/build/`), logs, stray tool outputs (`result.json` from the Bambu Studio CLI), or absolute paths to someone's home or temp folder (a record that points at a downloaded file stores its URL, not where it landed).
- **Deliberately committed outputs:** `public/parts/*.glb` and `tools/parts/generated/<id>/` (the part pipeline's results, §8a), `public/figures/*.glb` and `tools/figures/generated/<id>/` (the Measure tool's scale figures, §6), `build/icon/compiled/`, `public/robots/*.webp`.
- **`npm run check:tracked`** (`tools/check-tracked.mjs`, run by `check` and the pre-commit hook) fails on tracked files that `.gitignore` excludes (untrack them with `git rm --cached`) and on absolute paths into a home folder, `/private/tmp` or `/var/folders` in any tracked text file. Placeholder homes in tests (`me`, `user`, `name`, `example`, `runner`) are allowed.
- **Before committing**, read `git status` and the staged list (`git diff --cached --stat`). Anything not in the categories above that you didn't mean to write gets moved to `scratch/` or deleted. When a new tool writes local output, add its folder to `.gitignore` (and to the ESLint / Prettier ignores if it holds code) in the same change.

---

## 1. Core Mission & Design Ideals

- **The whole robotics loop, in one app.** Basecase covers six stages: **Design → Engineer → Simulate → Train → Build → Operate**.
  - A failure in stages 2–4 loops back to Design. Real-robot data from Operate loops back to calibrate the sim and retrain.
  - Design and Engineer ship today; **Simulate and Train (MuJoCo, §8d) are the current work**; Build is partial; Operate comes later.
  - Plan, milestones and status: [docs/Robotics loop.md](docs/Robotics%20loop.md). Keep its status column current as milestones land.
- **CAD for non-CAD users.** Approachable and visual, without losing precision: millimeter dimensions, CSG booleans, mounting holes, STL export.
- **MacBook + trackpad first.** Two-finger orbit/pan, pinch zoom, Space-drag pan, right-click (two-finger click) menus.
- **Simple, then powerful.** Show what applies now; reveal the rest through menus, ⌘K, right-click and disclosure sections.
- **Comfortable, not compact.** Tiny, dense UI is a deliberate non-goal. Never go below the type and control sizes in §4.
- **Dark studio aesthetic** (references: Claude, Codex, Mobbin, Crew). Neutral greys with no blue tint, surfaces separated by lightness steps instead of borders, one accent (Figma blue `#0d99ff`), red only for cutouts and destructive actions.

---

## 2. Window Framing & macOS Integration

- **Structure (like the ChatGPT desktop app):** an outer **window chrome** (`.window-chrome`, `#121212`, darker than every card) holds a 44px title bar, a **view rail** down the left edge, and three rounded **cards**: sidebar, canvas, inspector. Cards have 12px corners and **no border**: they read as surfaces by lightness alone.
- **Title bar, left to right:** stoplights · sidebar toggle (`PanelLeft`, ⌘B) · scene tabs (§5a) · the scene's Undo · Redo, Export and inspector toggle (`PanelRight`, ⌘I). The toggles and Export never move; collapsing a panel just closes its card and its gap.
  - Nothing names or creates the scene outside the tabs: no scene-name header and no New Scene button in the sidebar.
  - The one top bar is this title bar. **Never** render fake stoplights or a second bar that pushes the cards down.
- **View rail** (`nav` "Sidebar views" in `SceneWorkspace`): the sidebar's views as 36px icon buttons on the chrome, under the close button: Parts (the default view), Robots, Objects, Layers, Library; Settings (⌘,) at the bottom. Tooltips open to the right. The open view has a soft fill and its icon turns filled (outline while idle): Parts is a hex nut, Robots a round robot face looking straight ahead (solid eyes; the filled state's holes are cut a little larger so they look the same size), Library a bookmark (`src/design-system/icons.tsx`). Clicking another view opens the sidebar on it; clicking the open view collapses the sidebar (like an activity bar). The rail stays when the sidebar is collapsed.
- **Card headers:** each side card starts with a 44px header row (no hairline under it) whose content centers on y = 66, in line with the first rail icon. The inspector's header holds 28px controls with 8px padding, an even 8px on every side. The sidebar's header names the open view (15px semibold); the inspector's holds `PanelTabs` (Inspect · Pose · Simulate · Build · Agent; Pose and Simulate only with joints; Agent shows the white spinner while the agent works) and nothing else.
- **The grid** (`LAYOUT` in `theme.ts`; keep these numbers in sync with `trafficLightPosition` in `electron/main.mjs`):
  - **One centerline, y = 22.** Stoplights (14px buttons, 23px apart, measured on macOS 27) are at `trafficLightPosition: { x: 19, y: 15 }`, so they span x 19–79 and y 15–29. Toggles, actions, tabs and + are all 28px tall at `top-[8px]`: 8px from the window top and 8px above the cards (y = 44).
  - **The rail column:** icons span x 8–44 and center on x = 26, under the close button. They're 4px apart; the first centers on y = 66 and Settings ends 12px above the window bottom.
  - **8px everywhere outside the cards:** cards start 8px after the rail (x = 52), sit 8px from the window's right and bottom edges and 8px apart; the sidebar toggle is 8px after the stoplights (x = 87); tabs start 8px after the toggle (x = 123) and end 8px before the title bar actions.
  - **12px from a card's edge to its content** (`px-[12px]`; lists 8px, since rows pad themselves). The title bar actions' right edge (width − 20) lines up with the inspector's content.
  - The root font size is 14px, so `rem`-based Tailwind sizes (`h-10` = 35px, `px-3` = 10.5px, `gap-1` = 3.5px) are off-grid. Use px values for chrome, card padding and anything aligned to the stoplights.
  - Main-process changes (like `trafficLightPosition`) need an Electron restart; the renderer hot-reloads.
- **Window dragging:** the title bar uses `DRAG_REGION`. Every interactive child uses `NO_DRAG_REGION` (both exported from `src/design-system/theme.ts`).
- **Vibrancy:** the Electron window uses `vibrancy: 'sidebar'` with a transparent background. `main.tsx` adds `html.is-electron`, and `.window-chrome` turns translucent only in Electron, so the title bar and gaps show the desktop like a macOS sidebar. The cards stay opaque. In full screen there's no desktop behind the window, so `main.tsx` adds `html.is-fullscreen` (from the `window:fullscreen` events) and the chrome turns solid `#121212`.
- **Window size:** minimum 1240 × 720.
- **Boot screen** (inline in `index.html`, dismissed by `src/app/boot.ts`): the logo ring on the window chrome. It turns a quarter turn into place on a spring and seats like a nut being tightened (rotate −90° → 0, scale 0.7 → 1, 6% overshoot), then a light sweeps across it, leaving it lit, the glass edge of the app icon. It's plain CSS in the HTML, so it paints on the first frame, before the 3 MB bundle loads. It animates only `transform` and `opacity`, which run on the compositor, so it stays smooth while the main thread parses and mounts. The window is created hidden and shown on `ready-to-show` (2 s fallback), so it never appears blank. `#root` stays at opacity 0 under it, still rendering. Once the active scene has drawn its first frame, the ring fades and grows as the UI fades in (300 ms), but not before the turn has settled (520 ms). Reduced motion: no turn or sweep, just a fade. The overlay never takes pointer events; the title bar's drag region underneath still moves the window. No wordmark or text.
- **App name: Basecase.** `app.setName('Basecase')` in `electron/main.mjs`, which also moves the old `Application Support/Robotics 3D Studio` folder (localStorage) to `Basecase` once. In dev, macOS names the app after its bundle (menu bar, Dock, ⌘Tab, Force Quit), so `npm run electron[:dev]` launches through `tools/electron-dev.mjs`: it keeps an APFS clone of Electron.app as `node_modules/.cache/basecase-electron/Basecase.app` with its own executable, bundle id (`app.basecase.dev`) and app icon, rebuilt when Electron's version or the compiled icon changes. Because the executable isn't named Electron, `app.isPackaged` is true in dev; check `process.defaultApp` for dev-only behavior.
- **App icon:** a white squircle ring (superellipse n = 4, 600 of 1024, opening 0.446 of the ring) on a dark grey glass background made from the app's own surfaces (`#121212` chrome up to a lifted `#3c3c3d` highlight). The source is the Icon Composer file `build/icon/Basecase.icon`: the ring (`Assets/ring.svg`) is a glass layer, so macOS adds the specular edge, frosting and shadow; the mesh (`Assets/background.png`) is a flat layer under it. The mesh comes from `build/icon/mesh.html` (solid colour fields + a conic fan + directional veils, blurred as a share of the tile, with grain), rendered by `node tools/icon-mesh.mjs [seed] [out] [palette]` (grey seed 7 ships; a blue palette is kept as an alternative). `npm run icon` compiles `build/icon/compiled/Assets.car` (Liquid Glass) and `Basecase.icns` (fallback) with Xcode's actool; `tools/electron-dev.mjs` installs both in the dev bundle. `build/icon/basecase-1024.png` is macOS's own rendering, for docs. Restart the app to see a new icon.
- **Favicon** (`public/favicon.svg`): the ring alone, no background, black in light mode and white in dark (`prefers-color-scheme` inside the SVG).
- **Native menu bar** (`electron/app-menu.mjs`): App (Settings ⌘,), File (New Scene ⌘T, Reopen Closed Scene ⇧⌘T, …, Export STL, Print ⌘P, Import SVG, Import Robot, Import BVH, Close Scene ⌘W, Close Window ⇧⌘W), Edit (…, Find Parts ⌘F), View (Camera ▸, Two-Finger Scroll ▸, grid, reference images, panels), Window (Show Previous / Next Scene ⇧⌘[ / ⇧⌘], then every open scene with ⌘1–⌘9), Help (Keyboard Shortcuts ?).
  - Items send `menu:command` ids to the renderer: tab commands (`new-scene`, `close-tab`, `reopen-tab`, `next-tab`, `prev-tab`, `tab:<id>`) run in `App.tsx`, the rest in the scene in front (`runMenuCommand` in `SceneWorkspace.tsx`). Both report checkmarks and enabled state back with `menu:state` (partial updates merge).
  - Shortcuts the renderer already handles are display-only (`registerAccelerator: false`), so keys never run twice or fire while typing. Undo, Redo and Select All stay registered so text fields keep native editing; the renderer ignores a menu repeat of a key it just handled.
  - macOS ignores `registerAccelerator: false` and fires the key equivalent for any key the page doesn't `preventDefault` (a `?` or `D` typed in a text field opened Settings). So `item()` clicks drop events with `triggeredByAccelerator` (`clickOnly`): the renderer owns those keys, and only mouse clicks run the item.
  - Every new app-level command gets a menu item when it fits one of these menus.

---

## 3. Copy & Labeling Rules

Every word in the UI is product copy. Write it to the standard below, and check it against the checklist (§3d) before shipping. These rules distil Apple's HIG “Writing”, the Microsoft Writing Style Guide, NN/g's error-message and empty-state guidelines, Mailchimp's Voice & Tone guide, and Monzo's tone of voice. They're tested against product copy those sources and the wider industry celebrate (§3e).

### 3a. Principles

1. **Every word earns its place.** Read it aloud, then cut. “Check each word to be sure it needs to be there. If you can use fewer words, do so” (Apple). “Bigger ideas, fewer words” (Microsoft): “Ready to buy? Contact us.”
2. **Never say what the UI already shows.** If a number, total, icon, state or the layout already tells the person something, the text must not repeat it. `$0` already says there's nothing to buy, so a “Nothing to buy yet” caption is noise. Show no caption at all rather than a redundant one.
3. **Name things for what they are, not for what they aren't.** Use “Supplies”, not “Not in the model”, and “No chats”, not “No past chats yet”. Labels are nouns for things and verbs for actions.
4. **Lead with what matters to the person** (Monzo: “lead with impact”; Microsoft: “get to the point fast”). Front-load the keyword or the action: “Recheck 2 prices before ordering”, not “2 prices are over 60 days old. Recheck…”.
5. **Make the next step obvious.** When text points at work to do, start with the verb and make it clickable: “Replace 2 stand-ins with real parts”, “Find a source for 1 part (CNC)”, “Fix 3 parts before printing”.
6. **Plain and specific.** Use everyday words, active voice and contractions (it's, they're); no jargon the person didn't bring. Use exact numbers and names, not vague ones (“3 to price”, not “some items”).
7. **Calm and kind, never cute.** No “Oops”, “Uh-oh”, exclamation marks, or jokes in errors or anything that blocks work. Don't blame the person. Apologize only when the app is at fault, and only once.
8. **Consistent.** The same word for the same thing everywhere, and the same pattern for the same kind of message (§3b).

### 3b. Rules by element

1. **Casing:**
   - Title Case for buttons and menu items (macOS): “Export STL”, “Save to Library”, “Zoom to Selection”, “Add Price”.
   - Sentence case for tooltips, section titles, headers, helper text, placeholders, toasts and errors.
2. **Buttons are verbs**, 1–3 words, saying what happens: Add, Save, Apply, Done, Export STL, Add Price, Browse Parts. Never “OK”, “Submit”, “Yes”, “Continue” where a real verb exists, or “Click here”.
3. **Export:** one Export button (Title Case, never all caps) in the title bar, between Redo and the inspector toggle, whether or not the inspector is open. It opens a menu of formats: PNG Image, STL Mesh, 3MF Plates, Copy as Markdown and AirDrop, with labels only (no descriptions). Saving the scene is **Save Scene** (⌘S), in the File menu, ⌘K and the Library header.
   - **AirDrop** (also File menu and ⌘K) sends the visible solid parts, as posed on the canvas, to an iPhone as a USDZ, which opens in AR Quick Look at real size. `three/usdz/` builds it in a worker (three's `USDZExporter`, `quickLookCompatible`): meshes are baked into world space in meters (mirrored parts get their winding flipped, since USD has no negative scale), centred and stood on the floor, one material per colour; textures aren't exported. `electron/shareFile.mjs` writes it to the temp folder and opens AirDrop directly as a sheet on the window, through a native addon (`electron/native/sharing/`, Objective-C++ on Node-API: `NSSharingService` `sendViaAirDrop`, its delegate returning our window). Node-API is ABI-stable, so Electron upgrades need no rebuild; `npm install` builds it on macOS (`prepare` → `tools/native/build.mjs`, node-gyp; `npm run native` rebuilds it, output in the gitignored `build/`). Without the addon it falls back to the macOS share menu (`ShareMenu`) at the pointer, and outside Electron the file downloads. The spinner toast stays until AirDrop opens.
4. **No ellipses in labels.** Menu items, palette commands, buttons and tooltips never end in “…”, even when a sheet or picker follows: “Import SVG”, “From Image”, “Add Part”, “Add Price”, “Settings”. Progress text (“Saving…”, “Thinking…”) keeps it.
5. **Tooltips = name + shortcut**, with no period: `Move  V`, `Undo  ⌘Z`. Add a short sentence only for non-obvious tools.
6. **Section titles and headers** name the content: “Budget”, “Parts to buy”, “Supplies”, “Printed parts”. No questions, instructions or negations.
7. **Empty states:**
   - If something on screen already shows the emptiness (a $0 total, a 0 count, a lone section header, settings with nothing under them), show **no** empty text.
   - Otherwise use a short noun phrase, plus one action when there's a useful next step: “No parts” + [Browse Parts], “No saved scenes”, “No chats”.
   - Never add a description that restates the title (“No parts yet” / “Parts you add appear here.”). Never use “yet”, “nothing to … yet”, “will appear here” or “show up here”.
   - Inspector sections never explain how to use a feature (“Pin notes to any spot in 3D. Press M…”). An empty section shows just its title and header action; the tooltip carries the shortcut.
8. **Captions under numbers** add information the number lacks (“2 of 5 prices checked”, “$40 left” and “3 to price” on one `MetaLine`), or they don't exist.
9. **Errors and warnings:** say what happened, then how to fix it, next to the problem. Prefer the fix to the fault (Apple: “Choose a password with at least 8 characters”, not “That password is too short”). Example: “Nothing to subtract. Overlap a Cutout or Shift-click a part.” No error codes in the UI and no robotic “Invalid X”.
10. **Notices that ask for work** start with the verb and select or open the things they're about: “Replace 2 stand-ins with real parts”.
11. **Placeholders show an example**, never instructions: “e.g. 4× M3 holes, 0.2 mm clearance”.
    - Search fields are the exception: they name what they search, “Search parts”.
12. **Destructive actions** either take effect at once with Undo in the toast, or ask first in a `ConfirmDialog` (title “Delete ⟨name⟩?”, Cancel and Delete). Never arm a button on the first click and act on the second, and never delete on double-click.
13. **Toasts confirm in past tense** and name the thing, with Undo for destructive or bulk actions: “Deleted Cube” + [Undo], “Saved Robot Arm”, “Exported STL”. Not a bare “Saved” or “Done”, and never “successfully”.
14. **Footnotes and fine print:** one line, front-loaded, fragments are fine: “Estimate for a Bambu P1S: 2 walls, 4 top and bottom layers, 20% infill, best flat orientation. Slice to confirm.”
15. **Numbers:**
    - Tabular figures, units in a muted suffix (`mm`, `°`, `%`).
    - Use `×` for sizes: `40 × 36 × 20`.
    - Use numerals, not words (“3 parts”), and pluralize correctly (“1 part”, “2 parts”).
16. **No middle dots (`·`) between items, and no other separator glyph in their place** (a pipe, `•`, `—`). Separate facts with layout instead:
    - a meta line of facts: `MetaLine` (items 12px apart; `SectionHeader` and the part page and hover card subtitles take a list and use it);
    - a spec value with several facts: a list (`SpecValue`), rendered one per line by `SpecText`;
    - several shortcuts or settings: one row each (“Group ⌘G”, “Ungroup ⇧⌘G”), never “Group · Ungroup”;
    - one string (toasts, tooltips, labels): a plain sentence (“Inserted G1 with 23 joints”, “Connected to Claude”, “Printed TPU”).
    - Unit dots (`N·m`, `kg·cm`) are multiplication signs, not separators, and stay. In docs, “⟨text⟩” + [Action] notes a message with its button.
17. **Same word everywhere for the same thing:**
    - Parts are added, models are inserted, scenes are opened (in a tab) and closed, comments are posted, prices are added and checked.
    - Part types are **Solid / Cutout / Guide**.
18. **Icon-first.** Our own icons (`src/design-system`, §14) with custom tooltips (the `Tooltip` primitive), never native `title` on buttons. There's no third-party icon set.
    - When the library has nothing that reads clearly, draw a new icon with the `icon-design` skill (`.agents/skills/icon-design/SKILL.md`): 24 grid, 2px round strokes, an outline/filled pair for anything that toggles, previewed beside its neighbours before shipping.
19. **No status dots** unless they report an error or a live background process. The agent panel shows connection state only when disconnected.

### 3c. Words and patterns to avoid

| Avoid | Why | Use instead |
|---|---|---|
| “yet” (“No parts yet”) | Filler; the person knows they can add more | “No parts” |
| “Nothing to … yet” | Usually restates a visible 0 or $0 | No text, or a noun phrase |
| “… will appear here”, “show up here” | Explains the obvious | Omit, or name the action |
| “Not in …”, “Non-…”, “Un…” as a label | Defines by absence | Name the thing (“Supplies”) |
| “Please”, “simply”, “just”, “easily”, “successfully” | Padding or condescending | Cut |
| “We”, “Your …” | Unclear who “we” is; “Your Favorites” = “Favorites” (Apple) | Omit the pronoun |
| “Oops”, “Uh-oh”, “!” | Insincere, especially in errors (Apple, NN/g) | State the problem and fix |
| “Invalid …”, “Error: …”, codes | Robotic, not actionable | What to do instead |
| “Click here”, “Learn more” alone | Doesn't say where it goes | Describe the destination |
| “AI brief”, “AI …” as a feature name | Names our plumbing, not what the person gets | Name the result: “Save Scene”, “Copy as Markdown” |
| Quotes around placeholder examples | Visual noise | “e.g. Open Duck Mini, about 40 cm tall” |
| “You can …”, “There is/are …” | Weak openers (Microsoft) | Start with the verb |
| “a · b” (a middle dot, or a pipe or `•` in its place) | Text pretending to be layout | `MetaLine`, a line per value, separate rows, or a sentence (§3b-16) |

### 3d. Checklist before shipping any UI text

- [ ] Read it aloud. Could it lose a word, or a whole line?
- [ ] Does anything on screen already say this (a number, an icon, a state, the section title)? If so, delete it.
- [ ] Does it name a thing, or describe its absence? Name the thing.
- [ ] If it asks for work, does it start with the verb, and does clicking it help do the work?
- [ ] Is the most important word first?
- [ ] Same word as everywhere else for this thing? Right casing for this element?
- [ ] No banned words (§3c)?
- [ ] No `·` (or a stand-in glyph) between items? Use layout instead (§3b-16).

### 3e. Reference examples

Celebrated product copy and what it teaches:

- **Microsoft:** “Ready to buy? Contact us.” replaced a 16-word sentence; “Invalid ID” became “You need an ID that looks like this: someone@example.com”. Cut to the decision, and replace a fault with an instruction.
- **Datadog** (cited by NN/g): an empty favorites list says “Star your favorites to list them here”. An empty state teaches the one action that fills it.
- **Mailchimp:** password rules that grey out one by one as you meet them, instead of an error after you submit. Prevent the error, and give feedback in place.
- **Monzo:** “We've blocked your card and ordered you a new one” instead of “Your card was blocked and a replacement has been requested”. Active voice, impact first, the person's outcome in plain words.
- **Slack:** Slackbot says plainly that it's “only a bot”, and empty channels tell you you're caught up. Honest framing and a calm tone.

Before → after in this app:

| Before | After | Rule |
|---|---|---|
| $0 + “Nothing to buy yet” | $0 (no caption) | Don't repeat what the number shows |
| “Not in the model” | “Supplies” | Name the thing, not its absence |
| “No parts yet” / “Parts you add appear here.” | “No parts” + [Browse Parts] | No “yet”; no restating description |
| “$40 left before unchecked prices” | “$40 left” and “3 to price” (a `MetaLine`) | Specific numbers, plain words |
| “2 parts need changes to print well” | “Fix 2 parts before printing” | Verb first for work to do |
| “3 estimated stand-ins to replace with real parts” | “Replace 3 stand-ins with real parts” | Verb first |
| “Check” | “Add Price” | Button says what happens |
| “Saved” | “Saved Robot Arm” (the scene's name) | Toasts name the thing |
| “Save AI Brief”, “Copy AI Brief” | “Save Scene”, “Copy as Markdown” | Name the action, not an internal artifact |
| “What are we building?” | “What should Claude build?” | Say who “we” is |
| “Describe a part, or paste a photo” (placeholder) | “e.g. Desk lamp arm with three servo joints” (never a copy of a suggestion shown above it) | Placeholders show an example |
| “Save a part, import an SVG, or ask the agent to make one.” | “No models” | Empty states are a noun phrase |
| “No matches” + “Nothing found for “servo”.” | “No matches for “servo”” | Don't restate the title |
| “Save and Sync” (File menu, ⌘S) | “Save Scene” | One name per action everywhere |
| “Saved with today's date. Recheck after 60 days.” (under the price form) | No footnote; a stale price turns amber and its tooltip says why | Don't explain what the app handles for you |

Sources: [Apple HIG: Writing](https://developer.apple.com/design/human-interface-guidelines/writing), [Microsoft: Top 10 tips for style and voice](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice), [NN/g: Error-message guidelines](https://www.nngroup.com/articles/error-message-guidelines/), [NN/g: Designing empty states](https://www.nngroup.com/articles/empty-state-interface-design/), [Mailchimp Voice & Tone](https://styleguide.mailchimp.com/voice-and-tone/), [Monzo tone of voice](https://monzo.com/tone-of-voice), [Econsultancy: 15 microcopy examples](https://econsultancy.com/15-marvellous-microcopy-examples-and-how-they-improve-ux/).

---

## 4. Visual System

- **Type (SF Pro via system font):**
  - Body/base: 14px.
  - Inputs, buttons, inspector rows: 13px.
  - Meta and section labels: 12–12.5px.
  - Panel or empty-state titles: 15–20px.
  - Weights 400/500/600 only.
- **Control sizes:**
  - Inputs, segmented controls, menu items: 32px (`h-8`).
  - Small icon buttons: 28px (`xs`). Default: 32px (`sm`).
  - Bottom toolbar buttons: 44px (`lg`) with 22px icons.
- **Radius ladder (concentric):**
  - Inputs and buttons: 8px.
  - Menus and popovers: 14px.
  - Toolbar islands: 16–20px.
  - Composer and toasts: pill.
- **Surfaces (neutral greys, equal R = G = B; never blue-tinted greys like zinc or slate):**
  - `#121212` window chrome (darkest; slightly translucent in Electron), `#1b1b1b` canvas card (also the 3D scene background), `#1f1f1f` sidebar and inspector cards, `#222222` modals and Settings, glass `rgba(32–36, …)`.
  - Separate levels with lightness steps, not borders or shadows. Panel cards have no outline, and card headers have no line under them. The one exception is the canvas card: a near-transparent white ring (`inset 0 0 0 1px white/[0.05]`) drawn over the 3D view, so the scene separates from the chrome.
  - **Dividers inside panels are fine** and give them structure: full-width `white/[0.06]` hairlines between inspector sections (`Section`), above panel footers, between part-page sections, in menus (`MenuDivider`) and in modals.
- **Text tiers:** `white/90` primary, `white/60` secondary, `white/40` hints.
- **Dividers are always full width.** A horizontal hairline runs edge to edge of its container (menu, popover, panel, section, card), never inset by the container's padding.
  - Use `Divider` (or `MenuDivider` in menus). It cancels the container's horizontal padding, which the container publishes as `--pad-x`. `.glass-menu` defaults to 6px; `Section` sets 12px and Settings 24px.
  - A new container that holds dividers sets `--pad-x` to its horizontal padding (e.g. `[--pad-x:8px] p-[var(--pad-x)]`) instead of a plain `p-2`.
  - Borders on a block that already spans the container (panel headers, `Section`) count as full width.
- **Floating surfaces (`.glass`, `.glass-menu` in `index.css`; the names are historical):**
  - Use only for controls floating over the 3D canvas (toolbar, selection bar, toasts, comment cards) and for menus, popovers and tooltips.
  - **Matte, not glass:** a solid neutral fill (`#262626` floating controls, `#282828` menus) and a soft drop shadow with a 0.5px dark keyline. No translucency, backdrop blur, specular highlight or light outline.
  - Never on the panel cards or the window chrome.
- **Motion:**
  - 150ms for hover and press. Press scales to 0.94–0.97.
  - 180ms for popovers (`animate-pop-in` / `animate-pop-up`).
  - 240ms for panel collapse (width transition).
  - Easing `cubic-bezier(0.2, 0, 0, 1)`. Respect `prefers-reduced-motion`.
- **Previews** (`.preview` in `index.css`; `.preview-sm` for list thumbnails): part and scene thumbnails sit on a soft spotlight fill with 12px corners (8px small) and no outline or outer hover plate; hover brightens the fill and zooms the image. Parts and Library grids: 2 columns, 8px apart, 12px between rows, 12px from the card edge. The part page hero uses it at 14px. Only a state (the current scene's blue ring) draws an edge.
- **Loading** (`.shimmer`, `.skeleton-line` in `index.css`): a placeholder gets the `.shimmer` sweep, never a hand-written gradient. Loading tiles (`LoadingTiles`) are a `.preview` plus title and subtitle bars at the real tile's line heights, so nothing jumps when results arrive.
- **Focus:** a 2px blue `:focus-visible` ring only.
- **Scrollbars never take space.** Native scrollbars are hidden everywhere (`index.css`); `OverlayScrollbars` (mounted once in `main.tsx`) floats a 6px thumb over whatever is scrolling, fades it 900ms after scrolling stops, and lets you drag it. Never give a scroller a gutter or style `::-webkit-scrollbar` with a width. `.no-scrollbar` opts an element out of the thumb. While a thumb is dragged its scroller has `data-scrollbar-drag` (the agent feed uses it to stop following).
- **CSS layers:** custom classes live in `@layer base` / `@layer components` so Tailwind utilities can override them.

---

## 5. Layout

- **Docked side panels** (Figma reverted floating panels because they cramped the canvas).
  - Each panel is a rounded card (§2) with a 44px header row; window-level controls live in the title bar.
  - **Left (288px):** shows one view at a time, picked in the view rail (§2): **Parts · Robots · Objects · Layers · Library**, opening on Parts. Its header names the view.
    - **Robots** (`RobotsPanel`): published robots to insert with their joints (§8c). Search first (“Search robots”; Enter searches SimReady at once and inserts nothing), then Imported and a section per kind: Humanoids, Small bipeds, Quadrupeds, Arms (hands are in Parts → Hands). Tiles (2 columns, like Parts) show a preview, the name and the maker; a click inserts it (the toast shows progress) or drags onto the canvas, where it stands at the drop point (§7a-2). Imported comes first: robots inserted from a link, with the preview their import rendered (right-click to remove). Last comes **SimReady**: the makers' own arms, grippers and robot bodies from SimReady Central (Franka, UR, FANUC, Comau, Robotiq, OnRobot, AgiBot…), searched with the same field and inserted with their joints. Import Robot (a URDF / MJCF link or folder) is the + in the view's header.
    - **Parts** (`PartsPanel`): search first, then browse. Views stack with no header row of their own: inside a view the search field's glass icon becomes Back (Esc in an empty field also goes back), and the field names the view and searches only it (“Search servos”, “Search screws”; a part page searches its group). No scoped matches shows [Search All Parts].
      - **Search** (always on top, a `SearchField`; ⌘F opens Parts and focuses it from anywhere): matches name, maker, part number, aliases and group words, ranking a word that names the group first (“servo” → servos). A size makes hardware exact: “m3x12”, “M2.5 standoff 12”, “608”. ↑/↓ move, Enter opens the highlighted part, ⌘Enter adds it. Enter in a sidebar search never changes the scene on its own.
      - **Home:** Browse rows in two sections: Components (one row per non-empty `ComponentGroup`) and Hardware (one row per `HARDWARE_FAMILIES` family). Parts lists and searches only real components and hardware: basic shapes live in the toolbar's Shapes menu (A), and holes, slots and pivot axes in ⌘K.
      - **Category:** 2-column grid of real 3D thumbnails (`usePartThumbnail`, cached per exact variant). Hover opens a `HoverCard` beside the sidebar. Click opens the page; + adds; drag places it.
      - **Part page:** calm first, details on request. A draggable spotlight hero (no badge), the name (17px semibold), the maker on one muted line and the description; then **Key specs**: at most 3 plain-language rows for newcomers (`keySpecs` in `utils/keySpecs.ts`: Size rounded, Weight, and one headline per group, e.g. a servo's Strength as “Up to 2 kg at 10 cm”, a gripper's Can hold, a LiDAR's Range); **All specs**, collapsed: the exact datasheet values as label/value rows; **Details**, collapsed: part number, Mounting, 3D model source, Datasheet and Product Page; then Goes with. Amazon is a cart icon in the footer beside Add. The hardware page shares the hero and title.
      - **Footer:** part and hardware pages end in a bar below the scroll area (name, Amazon cart icon, Add), so the scroll fade never dims it.
      - **Scroll fade:** the list fades 28px at an edge only while there's more to scroll past it (`useScrollFade`, same look as the agent feed).
      - **Hardware page:** a live preview of the exact spec, the title, then the family's `HardwareConfigurator` and `HardwareSpecs` as hairline sections, and a footer with Find on Amazon + Add. Each family remembers its last spec.
        - **Head / Style / Ends:** the family's types as real 3D thumbnail tiles (3 across, `.preview-sm`, label under), drawn at the current size, finish and drive but the default length, so scrubbing the length doesn't re-render them. The chosen one has the Library's blue ring.
        - **Drive:** a `ChoiceGrid` of tall cells, each a `DriveIcon` over its name; the header's right side names the recess (“PZ2”, “2.5 mm hex key”, “1 mm slot”).
        - **Size** and **Finish** (swatch dot + name): `ChoiceGrid`s. Never solid blue chips: blue is for tools, tiles and focus.
        - **Length:** − / field / + (steps between stock lengths), then the stock lengths in one sideways-scrolling strip centred on the current length, its edges fading only while lengths are hidden past them. A custom length's hint makes the nearest stock lengths clickable.
        - **Specs** (Size, Thread with pitch, Standard, Head Ø × height) and **Holes** (`hardwareHoleRows`: clearance, counterbore or countersink, tap drill, nut trap, printed hole…) use the part page's `SpecRow`s, units muted.
      - **Drive:** every headed screw (Socket, Button, Flat, Pan) takes Hex · Torx · Phillips · Pozidriv · Slotted; Set takes Hex · Torx · Slotted (cross recesses aren't made in grub screws). Chips keep the `DRIVES` order on every head; `defaultDrive` picks the one a head starts with (Pan: Phillips, others: Hex). Every drive comes in every size of its head.
        - Where an ISO standard covers the pair, its table sets the head and recess and the Standard row names it: Socket Hex / Torx (ISO 4762 / 14579), Button Hex / Torx (ISO 7380-1 / 7380-1 TX), Flat Hex / Torx / Phillips / Pozidriv / Slotted (ISO 10642 / 14581 / 7046-1 H / 7046-1 Z / 2009), Pan Torx / Phillips / Pozidriv / Slotted (ISO 14583 / 7045 H / 7045 Z / 1580), Set Hex / Slotted (ISO 4026 / 4766).
        - Other pairs are commercial screws: the head keeps its usual standard's shape and the recess is sized for the thread (`commercialRecess`: Torx per ISO 14579, cross number per ISO 7045, slot per ISO 1580, set screw Torx matched to the ISO 4026 key). The Standard row says where the shape comes from (“ISO 7380-1 head”), and the shopping search leaves the standard out.
        - Code: `screwHead` (set screws `setScrewRecess`) and `screwStandard`. The drive is part of the spec (`spec.drive`), of the name when it isn't the default (“M3 × 8 Slotted Button Head Screw”, “Hex Socket Pan Head”) and of catalog keys (`hardware:type|size|length|finish|drive`).
      - Recesses are cut into the head with a real boolean (`cutRecess` in `three/hardwareMesh.ts`, three-bvh-csg), at the standard's key-engagement depth; Phillips and Pozidriv crosses taper like the ISO 4757 cone (stopping inside any head but a countersunk one), and Pozidriv adds its diagonal ribs. The recess walls render dark.
      - **Lengths are free:** any length from the shortest stock length up to 300 mm in 0.5 mm steps. Stock lengths (ISO 888 preferred + common retail) are one-tap chips, and − / + step between them. A custom length says “Not a stock length. Nearest: 13 or 14 mm.”; past the stock range it suggests threaded rod.
      - **Heat-set inserts come in stock lengths only** (`HEAT_INSERTS`, `stockOnly`), from the CNC Kitchen datasheet: M3 3 (Short), 4 (Voron, Ø5) and 5.7; M4 4 and 8.1; M5 5.8 and 9.5. Each length carries its own OD and printed hole, so the Length section is a `ChoiceGrid` with the variant and OD in its header. A key without a length (`hardware:heat_insert|M3`) is the standard (longest) insert.
      - **Finish** (`FINISHES`: Black, Stainless, Zinc, Brass, Nylon, Steel, and Silver / Black anodized for aluminum) sets the part color and the shopping search. Non-default finishes are part of the name (“M3 × 12 Button Head Screw, Black”). Chips keep one order across types.
      - **Motion and frame hardware** (`data/motionHardware.ts`, `data/frameHardware.ts`, tables in `data/motionTables.ts`): Ball Bearings (deep groove, flanged NSK F-series, thrust NSK 511xx and miniature F…M), Shafts & Linear Bearings (h6 shafts, THK LM bushings), Linear Guides (HIWIN MGN7–15 rails and C/H carriages), Aluminum Extrusion (Misumi HFS5 2020/2040, HFS6 3030, HNTT T-nuts for slot 6 and 8, HBLFSN5 brackets), Collars & Retaining Rings (Ruland set-screw and clamp collars, Rotor Clip DIN 471/472) and GT2 Pulleys (Misumi GPA pulleys and toothed idlers).
        - Every number comes from the named maker's catalog or standard; where a drawing leaves something out (slot wall slope, bearing internals, washer thickness, bracket plate thickness) the mesh draws it plainly and the envelope, bores, holes and pitches stay exact.
        - Each non-ISO type is one `MotionHardware` descriptor (name, dimensions, specs, holes, note, shop query, mass, seat cutout, size labels). `hardware.ts` routes every type that has one through it, so a new family needs a descriptor, a `HARDWARE_TYPES` entry, a family and a mesh builder (`three/bearingMesh.ts`, `frameMesh.ts`, `driveMesh.ts`, `motionHardwareMesh.ts`), nothing else.
        - Rails, shafts and extrusions are cut to length up to the maker's maximum (`maxLength`), so a custom length shows no “Not a stock length” warning. Rails lie along Z; extrusions and shafts stand along Y like pins. Mass comes from the catalog (kg/m or per piece), not from mesh volume.
    - **Objects** (`components/objects/ObjectsPanel.tsx`): things a robot handles or works around, searched live in NVIDIA's SimReady Central (§8e). Search first (“Search objects”; results follow typing after 300 ms, Enter searches at once and inserts nothing), else Browse rows (Kitchen, Food, Boxes and bins… in `objectCategories.ts`) that open a scoped search (“Search kitchen”, Back or Esc returns). Results are a 2-column grid of the asset's own thumbnail, name and maker, loading the next 40 as you near the end (infinite scroll, an `IntersectionObserver` 400px ahead). Hover opens details (`SimReadyTile`: caption, Size, Weight, Moving parts, Insert, Open on Hugging Face). Click or drag inserts; the toast shows download and conversion progress.
    - **Layers:** header with the part and cutout counts, a footer with the overall size (visible, non-reference parts), and rows with color/role glyph. Double-click renames. Eye and lock appear on hover. Right-click opens the part menu. An empty scene leaves Layers empty: just its header, no empty state.
    - **Library** (`LibraryPanel`), in the same voice as Parts:
      - **Search** first (“Search library”, matches names and descriptions; Esc clears), then **Scenes** (newest first) and **Models**, each a 2-column grid with + in its header: Save this scene (⌘S), and the New Model menu (Save Selection, Save Whole Scene, Import SVG, From Image).
      - **Tiles** match Parts tiles: a 4:3 thumbnail that zooms on hover, name, one meta line (`59 parts` and `2h` on a `MetaLine`, or `347 × 213 × 347 mm`). Scenes open in a tab carry an “Open” badge; this tab's scene has a blue ring. Models show + (Insert) on hover and drag onto the canvas.
      - **Thumbnails** come from the scene's saved `previewDataUrl`: a WebP rendered from the saved parts with the Parts thumbnail renderer when the scene is saved (`three/scenePreview.ts`: solid, visible parts only), never a viewport screenshot with grid and axes. Scenes saved before previews existed get one generated once, in the background, and written back (`library/useScenePreview.ts`). The hover card reads the summary's counts and `sizeMm`.
      - **Hover** opens details beside the panel (`HoverCard`): large preview, saved when, the description, Size, Parts, From catalog and Comments (each only when non-zero), then Open / Show Tab or Insert.
      - **Right-click or ⋯:** Open (Show Tab when it's open elsewhere), Rename, Duplicate (“Sprout copy”, “Sprout copy 2”…), Delete. Double-click a name to rename it in place; renaming a scene that's open renames its tab too.
      - **Delete** takes effect at once with “Deleted ⟨name⟩” + [Undo], which saves it back.
      - Rewrites (rename, duplicate, Undo) load the full record (`platformBridge.getScene`) and never resend the stored thumbnail, since the backend copies it to `ai-reference/preview.png`.
      - The backend lists scenes from cached summaries (`electron/library/sceneLibrary.mjs`, cache in `library/.scene-summaries.json`, refreshed by file mtime and size); a saved robot that needs upgrading is upgraded when it's opened (`utils/sceneRecords.ts`), not at startup.
      - Empty sections show one line and one action (“No saved scenes” + Save This Scene).
      - Save to Library keeps every part whole in `node.part` (CAD code and geometry, sculpt meshes, hardware). Inserting a model saved from a scene recreates those parts as one group named after the model, so they stay editable. Older saves without `part` come back as blocks, with a toast saying their CAD shapes weren't saved.
  - **Right (328px):** header tabs **Inspect · Pose · Simulate · Build · Agent** (`PanelTabs`; Pose only while the selection is on a robot, §8c; Simulate while the scene has joints, §8d). Undo/Redo, Export ▾ and its toggle sit in the title bar above it. Build is described in §8b.
  - Mode panels (Sculpt, Sketch, Import SVG) replace the Inspector while they're active, with a title and Done in their own header (§8).
  - Both collapse with a width animation (⌘B / ⌘I); the animated width includes the 8px gap, so the gap closes with the card. The toggles stay in the title bar.
  - **Resizable (`PanelResizer`):**
    - The 8px gap beside the canvas card is the handle: hovering it shows a 2px blue line in the gap, and dragging resizes. Left: 230–480px. Right: 290–620px.
    - Double-click resets the default width (288 / 328).
    - Dragging about 90px past the minimum collapses the panel and restores its default width for next time.
    - Widths persist in `localStorage` (`panel-widths`). The width animation is off while dragging.
- **Canvas overlays:**
  - Centered bottom toolbar.
  - Toasts above the toolbar.
  - No empty-scene prompt: an empty scene is just the canvas.
  - Annotation pins and cards.

---

## 5a. Scene Tabs

Several scenes stay open at once, each with its own parts, undo history, selection, comments and agent conversation.

- **Architecture:** `App.tsx` is the tab host; each tab is a `SceneWorkspace` (`src/SceneWorkspace.tsx`).
  - Every tab stays mounted (background tabs mount shortly after launch, §0f), so a background agent keeps building and can render its review shots. Background tabs are `invisible` + `inert`, and their `Viewport3D` is `paused` (no render loop; captures still render on demand). Closing a tab frees its WebGL context (`forceContextLoss`).
  - Up to 8 tabs (browsers cap WebGL contexts near 16). A ninth says “Close a scene to open another. Up to 8 stay open.”
  - App-wide state lives in the host and reaches scenes as `studio` (`StudioShared`): preferences, panel open state and widths, libraries, chat list, the agent connection, Settings. Per scene: everything about the scene, Left/Right panel tabs, the palette, toasts.
  - Only the scene in front listens to the keyboard, paste, the menu bar and the dev `__studio` hook. Background scenes skip re-renders for app-wide changes (custom `memo` comparator) and catch up when brought to front.
- **Where:** in the title bar (§2), from 8px after the sidebar toggle to 8px before the scene's actions. `App.tsx` lays the sidebar toggle and `SceneTabs` over each scene's title bar drag region. No glass: the tabs are part of the window chrome.
- **Tabs (`SceneTabs`):** 28px rounded pills (8px corners), 180px wide, shrinking to 96px, 6px apart, on the title bar's centerline.
  - The active tab sits on a flat `#262626` fill (no edge or highlight); its label is `white/90`, 13px medium, and its × always shows.
  - Background tabs are plain labels (`white/50`, `white/80` on hover) with a soft fill on hover and × on hover.
  - Nothing else: no icons or separators. While a scene's agent works, a 12px white spinner sits before its name.
  - Past their minimum width they scroll sideways (the wheel scrolls; an edge fades only while tabs are hidden past it, measured from layout so sliding tabs don't trigger it).
  - New tabs grow in (`animate-tab-in`); tabs slide into place after insert, close and drop (FLIP, 220ms).
  - Press selects. Drag past 4px reorders. Double-click renames inline. Middle-click closes. × closes (`Close  ⌘W`). Right-click: Rename, Duplicate, New Scene, Reopen Closed Scene, Close, Close Other Scenes, Close Scenes to the Right.
  - Resting 800ms on a background tab opens a small preview card under it: a fresh frame of that scene, its name, and its part count, or the agent's live activity while it works.
  - + (28px) 2px after the last tab (its glyph carries 6px of air, so it reads about as far out as the tabs are apart): `New scene  ⌘T`.
- **Opening and closing:**
  - New scenes are numbered so open tabs never share a name: Untitled, Untitled 2…
  - Library → a scene: shows its tab if it's open, reuses the tab in front if it's untouched (blank, unrenamed, unused), otherwise opens a new tab after it.
  - Closing a tab stops its agent, saves its chat and ends its session. The toast reads “Closed ⟨name⟩” + [Undo] (“…and stopped its agent” when one was running); Undo reopens it in place with its chat. Untouched tabs close silently. Closing the last tab leaves a blank one, which Undo removes again.
  - ⇧⌘T reopens the last 10 closed scenes. Duplicate copies the scene, not the chat.
  - When a background agent finishes: “Agent finished in ⟨name⟩” + [Show].
- **Shortcuts:** ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⌃⇧Tab and ⇧⌘] / ⇧⌘[ next / previous, ⌘1–⌘8 a tab, ⌘9 the last. They work while typing (except with Settings open). ⌘K lists every other open scene under Open Scenes, plus New / Duplicate / Close / Reopen Scene.

---

## 6. Bottom Toolbar

- **Toolbar (`ViewportToolbar`):**
  - Tools: Move V · Rotate E · Scale R · Comment M. Sculpt C appears between Scale and Comment only when Settings → Canvas → Experimental → Sculpt tool is on (off by default).
  - Then a divider, then **Shapes ▾** (A): a 4-column grid of basic-shape thumbnails (Plate, Cube, Shaft, Tube, Wedge, Sphere, Cone, Pyramid, Hex Prism, Capsule, Dome, Ring), then Sketch, Measure, Annotate and Import SVG.
  - **Measure (D):** also in ⌘K and the right-click menus (Measure From Here, which starts at the clicked point). Click two points; a blue line joins them with a matte label at its middle: the distance alone, units muted, scaled to read naturally (`formatLength` in `measureMath.ts`: metric is mm, then m from 1 m; imperial is inches to the nearest ¹⁄₁₆, then feet and inches from 1 ft). Points snap to a part's crease corners, then its edges (the hit part's `cad-edges`; meshes without them snap to the hit triangle's corners), within about 9 px; ⇧ places a free surface point. ⌥ locks the second point straight above or below the first (to a snapped corner's height, or the height under the pointer). Empty space measures on the floor. A third click starts a new measurement; Esc clears it, a second Esc leaves the tool. The unit system is a preference (Settings → Canvas → Measure: Metric / Imperial; older mm/cm/m/in values load as Metric, or Imperial for in).
  - **Annotate (N):** also in ⌘K and the empty-canvas right-click menu. Drag to draw coloured marks for the agent (circle a part, underline an edge), each with an optional label, so one message can say “yellow is right, orange is wrong”. A stroke lies on one camera-facing plane at the depth of the nearest part it crosses (the orbit target when it crosses none), so it stays put in 3D, and it's drawn over everything. On release the mark records the parts it circles (part centres inside a closed loop, `markMath.ts`), the parts it crosses, its colour and the view it was drawn from (`view`, a `look` view like `az:30,el:20`).
    - **Marks pill** (`MarkBar`, above the toolbar while the tool is on): four colour swatches (Red, Orange, Yellow, Green, `utils/markColors.ts`) and Custom color (the `ColorPickerPopover`, opening above), then the count and Clear marks, then Done (Esc). The colour applies to new marks and to the selected one.
    - **Selecting:** a click (no drag) on a stroke or its label selects that mark (`MarkLayer.hitTest`, within 10 px); a new mark is selected as it's drawn and its label field takes focus. While one is selected, the pill shows its label field (“e.g. Too thick here”; Enter saves, Esc reverts) and Delete mark (⌫); Esc deselects, a second Esc leaves the tool. Deleting one mark or clearing all toasts with Undo.
    - **Drawing:** `three/viewport/markLayer.ts` draws marks outside `stage.overlays`, so the agent's `look` / `compare` renders show them, and frames those renders to include them (not isolated or silhouette views). Labels are sprites (`markLabel.ts`: a pill in the mark's colour, constant pixel size, above the stroke's topmost point on screen), so they're in the renders too. The selection outline (Figma blue) is in `stage.overlays`, so renders never show it.
    - Marks are scene data (`project.marks`, saved with the scene) on the undo timeline; Clear Marks is also in ⌘K and the canvas menu. The agent sees them in `get_scene` (`marks`: colour name, label, parts circled, bounds, `seenFrom`), and a message sent while marks exist lists each one's colour, label and parts (`agentMarks.ts`). Custom colours are named by hue for the agent (“purple”).
  - Measurements are a view overlay (`three/viewport/measureTool.ts`, pure math in `measureMath.ts`): not parts, not undoable, never saved, exported or captured (they live in `stage.overlays`, which captures hide). Hover picking runs once per frame; the label is positioned after each render (`RenderLoop.afterRender`); the gizmo detaches while measuring.
  - **Measure toolbar** (`MeasureToolbar`): while measuring, the bottom toolbar is swapped for one with **Ruler** (the default), **Human** and **Dog**, then an X on the right (`Exit measure  Esc`). State lives in `workspace/useMeasure.ts`; leaving Measure resets it to Ruler and clears the figures.
    - **Human / Dog** are scale figures: a light-blue ghost follows the pointer (on a part's surface or the floor) and a click places it there, facing front (+Z); clicking again moves it. One of each. The ruler line stays while they're placed.
    - Once the human is placed, a Height field joins the toolbar: two fields (ft and in) where people say heights in feet (US, UK, Liberia, Myanmar, from `navigator.language`) or with Imperial units, otherwise cm (`heightsInFeet`). A US engineer measures parts in mm but still says a person is 5 ft 9 in, so this follows the region, not the Measure units. Extra or negative inches carry into feet (`toFeetInches` / `fromFeetInches` in `measureMath.ts`). It defaults to 175.3 cm, 5 ft 9 in (US adult men, CDC NHANES 2015–2018). The dog is a Labrador Retriever, 57 cm at the withers, and keeps its real size.
    - Figures are view overlays like measurements (`three/viewport/scaleFigures.ts`). They're drawn as one clean translucent layer: a depth-only pass first, then the fill with `depthWrite` off, so overlapping limbs never stack up brighter.
    - **The models are sculpted by the Basecase agent**, never hand-built from primitives: `node tools/figures/generate.mjs human dog` runs the real app headless (the same harness as §8a, `tools/parts/studioRun.mjs`) with the briefs in `tools/figures/briefs.mjs` (subject, pose, anthropometric or breed-standard proportions, find references, sculpt with replicad lofts, then a review pass against the references), and writes `public/figures/<kind>.glb` plus renders and the agent's notes in `tools/figures/generated/<kind>/`. Check the renders before shipping, and rerun when the agent gets better. `figureModels.ts` loads a GLB once per app, merges it into one smooth-shaded geometry and stands it on the floor; the human is normalized to unit height, so its scale is its height. `tools/figures/figures.test.mjs` checks the shipped files.
  - Active tool: solid blue fill.
  - Keep it to tools and creation only. Placement actions (Drop to Floor, Stack) live in the right-click menu, the Inspector and shortcuts (F, S).
- **No view-controls cluster on the canvas.** Grid, snap, trackpad mode and shortcuts live in Settings (§6a); camera views live in View ▸ Camera, ⌘K, the canvas right-click menu and keys 1–4 / Z.
---

## 6a. Settings (`SettingsWindow`)

- Opens from the app menu → **Settings** (⌘,), ⌘K, or Help ▸ Keyboard Shortcuts / `?` (opens the Shortcuts pane). It remembers the last pane.
- A sheet with a sidebar of panes, like macOS System Settings:
  - **Canvas:** Display (Show grid, Show reference images), Snapping (Move Off/1/2/5/10 mm, Rotate Off/5/15/45/90°), Measure (Units Metric / Imperial), Experimental → Sculpt tool (off by default).
  - **Navigation:** Two-finger scroll Orbit / Pan, plus pan and camera key reminders.
  - **Layout:** Show sidebar / inspector, reset panel widths.
  - **Region** (`components/settings/RegionPane.tsx`): Prices → Currency (US Dollar by default; ⌘K → “Currency Settings”).
  - **Agent:** Run with Claude / Codex / Gemini / Offline, the command (status under it, or where to sign in), target height.
  - **Build** (`components/settings/BuildPane.tsx`): Auto generate build guide (on by default, §8b).
  - **Printers** (`components/settings/PrintersPane.tsx`, `PrinterEditor.tsx`): My printers (name, model, nozzle, how prints are sent, address, serial, access code or API key, Test Connection, Make Default, Remove), Find on Network, Add Printer, and the slicers Basecase found (Get Bambu Studio when there's none). §8f.
  - **Shortcuts:** the full list (`ShortcutsList`).
- **Sheet:** 860 × 620, 18px corners, matte (dark 0.5px keyline + drop shadow, no light ring). The sidebar (224px, `#1c1c1c`) sits on the `#222222` sheet by lightness alone, with no border. Pane items are 34px with a plain 16px icon (`white/40`); the open pane gets a soft fill and `white/90` icon and label, nothing else. The sidebar title and the open pane's title (20px semibold, 64px header) both center on y = 32. Close (Esc) sits at the header's right, its glyph in line with the cards' right edge. No line under the header; the content fades under it instead (`useScrollFade`). Content scrolls vertically only (`overflow-x-hidden`), with 28px side padding.
- **Groups and rows** (`SettingsGroup` / `SettingsRow` in `src/components/SettingsRows.tsx`): a sentence-case group label (12.5px medium, `white/45`) above a rounded inset card; the pane title, group labels and cards share one left edge, and row content sits 16px inside the card (12px corners, `white/[0.035]`), rows separated by full-width hairlines. Rows are at least 52px with 16px side padding: label (13.5px, `white/90`, optional shortcut caps) with an optional hint (12.5px, `white/45`) on the left, the control on the right. `stacked` rows put a text field under the label and the hint under the field. Units are a muted suffix on the label (“Move mm”). Shortcuts use the same cards with 40px rows.
- Grid, snap, trackpad mode, the Sculpt tool and Auto generate build guide settings persist in `localStorage` (`preferences`); the currency in `currency`, rates in `exchange-rates`.

## 7. Inspector (Figma UI3 style)

- Sections are separated by full-width hairline dividers, never boxed cards. Section titles are sentence case and 13px semibold.
- Every Inspect view and mode panel scrolls with `useScrollFade`, like Parts: an edge fades only while there's more to scroll past it.
- **No selection:** Project description (collapsed by default; saved with the scene to `ai-reference/`; no placeholder, like Notes) and Comments (just the title and + when there are none). Scene stats live in Layers: the header shows parts and cutouts, and a footer shows the overall size.
- **Part selected:**
  - Inline-renamable name, then Duplicate / Save to Library / Delete.
  - Hardware shows the same `HardwareConfigurator` sections as Parts (type tiles, drive, size, length, finish) in place of Size and Shape. Specs and Holes come before Notes, collapsed; Holes carries + (Add clearance hole) in its header. Length typing and scrubbing are live; release commits one undo step. The color follows the finish unless it was set by hand.
  - No Solid · Cutout · Guide control: the part type is set from the right-click menu (one part or several).
  - Size W/H/D (+ wall T), Position X/Y/Z (Floor, Stack and Center actions), Rotation X/Y/Z with 90° steps.
  - **Shape** (Round, Taper, Bend, Twist): collapsible, open only when non-zero.
  - Collapsible sections keep their title where a plain section's sits and put the chevron at the far right, after any header actions.
  - Appearance (`ColorField` + material), comments on this part, Notes (sent to the agent; collapsed by default), then Product (maker · part number, specs, mounting, model source, links) for real components.
- **Several parts selected (`MultiInspector`), like a multi-selection in Figma:**
  - Title: the group name (renamed in place, one undo step on Enter or blur), or “N parts”. Under it, the part count and the selection's overall size (`39 × 50 × 39 mm`). Group/Ungroup, Duplicate, Save to Library and Delete sit beside it.
  - **Align:** one icon strip per axis (min · center · max) with Spread beside it (`AlignBar`; Spread needs 3+ parts).
  - **Position:** X/Y/Z of the selection's bounds center. Typing, scrubbing and math move every unlocked part together (`handleMoveSelection` takes an absolute target computed from the latest parts, so Enter + blur can't move it twice). Drop to floor and Center on origin in the header.
  - **Rotate:** X / Y / Z 90° turns the selection as one piece about its center (`handleRotateSelection`).
  - **Combine:** Union / Subtract / Intersect on one strip; Subtract's tooltip names the part it keeps.
  - **Appearance:** `ColorField` and material, each showing “Mixed” when the parts differ.
  - Strips (`StripGroup` + `StripButton` in `AlignControls.tsx`) are the pattern for a row of equal actions: a 32px soft track with 2px inset cells, never a grid of text buttons or tall tiles.
- **`NumberInput`:**
  - Drag the label to scrub (Shift ×10, ⌥ ×0.1). ↑/↓ steps, Enter commits, Esc reverts.
  - Accepts math (`40/2`).
- **Live vs. committed edits:** scrubbing, slider drags and typing call `onChange(value, live=true)`. Those skip undo history until release or blur, which commits one undo step (`commitParts(updater, live)` in `App.tsx`).

---

## 7a. Selection, Groups & Booleans

- **Selection is an ordered list** (`selectedIds` in `App.tsx`). The first id is the primary, and Subtract keeps that part.
- **Canvas:**
  - Click a part to select it, or its whole group. Clicking again keeps the group selected.
  - Double-click a grouped part to drill into just that part. Once inside a group, a single click selects another member.
  - Shift-click or ⌘-click toggles a part in the selection. Clicking empty space clears it.
  - Shift-drag draws a blue selection box and adds every unlocked, visible part it touches, plus their groups. Hit testing uses each part’s real silhouette (projected vertices + a 7×7 ray grid), not its bounding box. It runs in the capture phase and turns OrbitControls off for that drag, so Shift-drag never pans. Shift-scroll still pans.
  - Only primary clicks change selection; right-click never does.
- **Layers:**
  - A plain click selects that row; Shift/⌘-click adds to the selection.
  - Group rows are collapsible, double-click to rename, and select every member.
- **Moving several parts:** the gizmo attaches to a pivot at the selection’s center. Move, rotate and scale apply to every unlocked part and commit as one undo step.
- **Groups:** stored on each part as `group: { id, name }`, so they’re undoable and saved with the scene. Groups are flat (no nesting). ⌘G groups, ⇧⌘G ungroups.
- **Booleans:**
  - With 2+ parts, Union, Subtract (from the primary) and Intersect replace them with one mesh.
  - With one part, Subtract uses every visible Cutout that overlaps it.
- **Selection bar:** with 2+ parts selected, a glass pill above the toolbar shows the count, Union, Subtract, Intersect and Group/Ungroup.
- **Align (`AlignControls`):**
  - X/Y/Z × Left·Center·Right / Bottom·Middle·Top / Back·Center·Front, plus Spread X/Z for 3+ parts.
  - Several parts align to their shared bounds; one part aligns to the origin (Bottom = floor).
  - Bounds include each part's rotation (`halfExtents` in `utils/selection.ts`, checked against three.js `Box3`), so align, spread, drop to floor and the sizes in Layers and the Inspector stay right for rotated parts.
  - Available in the right-click Align submenu, the multi-selection Inspector (`AlignBar`) and ⌘K.
- **Drop to Floor (F):** loose parts each drop to the floor; when every selected part is grouped, the selection lands as one piece.

---

## 7a-2. Drag and Drop

- **Draggable onto the canvas:** Parts tiles, Shapes menu tiles, Library model tiles, Robots tiles and SimReady tiles (Objects and Robots). They use `PART_DRAG_TYPE` / `MODEL_DRAG_TYPE` / `ROBOT_DRAG_TYPE` (`{ url, name }`, imported on drop) / `SIMREADY_DRAG_TYPE` (`{ url, name, maker, license }`) from `src/data/dnd.ts`, and the tile’s preview is the drag image.
- **Where it lands:** at the drop point, snapped to the grid step. Dropping on a part stacks it on that surface; otherwise it sits on the floor.
- **Shapes menu:** fades out (stays mounted) while dragging, then closes on drag end. Removing the drag source would cancel the drag.
- **Image files** dropped on the canvas become reference images (§7b).

---

## 7b. Reference Images

- **Adding:** ⌘V anywhere outside a text field, drop image files on the canvas (at the drop point), ⌘K → “Add Reference Image”, or right-click the canvas → “Add Reference Image”.
- **What they are:**
  - An `image_plane` part with `imageDataUrl` and role `reference`.
  - Unlit, double-sided, with a thin frame that turns blue when selected.
  - Never printed, exported to STL or used in booleans. Listed in the brief as reference photos, not parts.
- **Size:** photos are downscaled to 2048px max (`utils/imageFile.ts`). They start upright with a 120mm long side. Width and height stay locked to the photo’s aspect ratio.
- **Hide all:** the image toggle in the Layers header (shown when the scene has photos), ⇧I, or ⌘K. It’s a view setting, not undoable; hidden photos dim in Layers and aren’t rendered or clickable.
- **Inspector:** an Image section with preview, Opacity, and Stand Up / Lay Flat (backdrop vs. blueprint on the floor). Notes describe what to take from the photo. The Layers row shows the photo as its glyph.

---

## 8. Mode Panels (Sculpt, Sketch, Import SVG)

There's no Shape tab. These panels appear in place of the Inspector only while they apply (`SculptAndDrawStudio`), with the title and a Done button in their own header.

- **Sculpt:** shown while the Sculpt tool (C) is on. The tool is experimental and hidden unless enabled in Settings; when it's off, C, the toolbar button, the ⌘K entry and the Shortcuts row are all gone, and turning it off mid-sculpt switches back to Move. Existing sculpted parts still render and export. Brushes, Size/Strength sliders, Mirror X/Z, Subdivide, Add clay presets. Done switches back to Move.
- **Sketch:** opened from Shapes ▾ → Sketch, ⌘K or right-click. Extrude / Revolve, Points / Freehand / Hole tools, snap, undo point, clear, then Output fields.
- **Import SVG:** opened from Shapes ▾, ⌘K, right-click or the Library. Drop zone, samples, paste code, preview, then Output fields. “Edit in Sketch” hands the outline to Sketch.
- Adding a part from Sketch or SVG closes the panel and shows the new part in the Inspector.
- Combine lives in the selection bar, the right-click menu and the multi-selection Inspector.

---

## 9. Agent (Claude Code over ACP) and Agent Panel

### Architecture
- The app is an ACP client (`electron/backend-service.mjs`). It runs one agent at a time, picked in Settings → Agent and saved in `library/agent.json`: **Claude Code** (`@agentclientprotocol/claude-agent-acp`, the default), **Codex** (`@agentclientprotocol/codex-acp`, which bundles its own Codex binary) or **Gemini CLI** (`@google/gemini-cli`, `gemini.js --acp`), each pinned in `package.json` and run with the user's own login. The offline tracer `electron/acp-3d-agent.mjs` remains selectable. Relative script paths in a command resolve against the repo root (`anchorArgs`).
- **Agent profiles** (`electron/backend/agentProfiles.mjs`, `codexProfile.mjs`, `geminiProfile.mjs`) hold everything that differs per agent, so each runs as the same CAD agent: the CAD instructions, only the CAD MCP server plus todos and web lookups, thinking that streams, and no shell or file tools.
  - **Claude Code:** session `_meta` (below).
  - **Codex** runs from its own home, `library/agent-config/codex-home` (`CODEX_HOME`): `auth.json` is a symlink to the user's, so the ChatGPT login and its token refreshes are shared; `config.toml` is written at every launch with the user's default model and effort copied over, `sandbox_mode = "read-only"`, the shell, unified exec, plugins, apps, browser and computer use, image generation and memories features off, `project_doc_max_bytes = 0` (no AGENTS.md) and detailed reasoning summaries. Overriding the user's own `~/.codex` instead didn't hold: the adapter replaces `mcp_servers` with the client's, plugins add MCP servers (computer use, Gmail, Drive…) and code mode exposed hundreds of tools. CAD instructions go in `_meta.jetbrains.air.customInstructions`; the agent starts in the `read-only` mode (`INITIAL_AGENT_MODE`), and `apply_patch` asks for permission, which is declined. Codex has no plan tool in this release, so its runs show no plan card.
  - **Gemini CLI** reads a generated system settings file (`GEMINI_CLI_SYSTEM_SETTINGS_PATH` → `library/agent-config/gemini-settings.json`, highest precedence: `tools.core` = write_todos and the two web tools, `mcp.allowed` = robotics_cad, folder trust off) and the CAD instructions as its whole system prompt (`GEMINI_SYSTEM_MD`). It runs with `--approval-mode yolo --allowed-mcp-server-names robotics_cad`: its permission requests and tool calls carry no input or server name, so the allowlists are the boundary. Google no longer signs in personal accounts to Gemini CLI (“no longer supported for Gemini Code Assist for individuals”, since Antigravity replaced it on 2026-06-18; Antigravity's `agy` has no ACP mode), so a personal account needs a Gemini API key: the sign-in banner's **Add API Key** stores it encrypted with Electron `safeStorage` (`library/agent-config/agent-keys.json`, memory only where there's no encryption) and the profile passes it as `GEMINI_API_KEY` with `security.auth.selectedType = gemini-api-key`, leaving `~/.gemini` untouched. Gemini has no effort control over ACP, so the slider is hidden.
  - Codex and Gemini sessions use `library/agent-workspace` as their working folder, so the repo's AGENTS.md and file tree never reach them. Claude Code keeps the repo root, where its saved sessions live, but loads nothing from it: `settingSources: []` (no project or user CLAUDE.md, AGENTS.md, settings, hooks or permission rules), plus `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` and `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1` (no git status). Before that, every CAD session carried this whole file and the repo's git status as context, so it read “Add support for end effectors” as a change to Basecase's code instead of the robot.
- **Signing in:** a first session that fails with an auth error (`isAuthError`) puts `signIn` (the agent's browser methods, and `apiKey` when it takes a key) in the status instead of an error. The Agent tab shows “Sign in to use ⟨agent⟩” with the agent's own method (`authenticate`) and Add API Key, plus the agent's message when sign-in failed.
- **Steering** works wherever the agent advertises it (`_meta.steering.supported`: Claude Code and Codex); Gemini's messages queue for after the run.
- **Session settings:**
  - Claude Code's built-in tools are limited to TodoWrite, Agent (subagents, below), WebSearch and WebFetch. File, shell and edit tools are off.
  - CAD instructions are appended to the system prompt (`electron/cad-agent-prompt.mjs`), once: the MCP server's own `instructions` are a one-line pointer (they were a second copy of the whole prompt). The prompt is a short core (role, frame, check integrity, workflow, part rules, kernel choice, assembly and service, cost, an index of guides, about 170 lines). The rest lives in guides (`electron/cad-agent-guides/`: photos, shells, replicad, servos, fasteners, electronics, build, joints, motion, simulation, new_design, priors, simready), which a tool result attaches the first time it applies (`cad-mcp/guideTools.mjs`: the first `look` brings photos, the first block named head or shell brings shells, the first servo brings servos…), once per lane; `get_guide` fetches any of them. Codex and Gemini get the core without the Claude-only subagent section. Part designers get a cut-down prompt with the shell, replicad, servo and fastener guides inline.
  - **Check integrity** is a core rule: never narrow a range, change a role, hide, offset or delete a part to pass a check; report a check that seems wrong instead. The prompt never says "make every check pass" (a test enforces it).
  - Thinking is `adaptive` with `display: "summarized"`, so reasoning streams to the UI.
  - Host-session env vars (`CLAUDE_CODE_*`, `CLAUDECODE`, and the desktop host's `ANTHROPIC_BASE_URL`) are stripped, so the agent uses the user's login. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` is set, so subagents always run in the foreground and the lead's turn waits for them. `ENABLE_CLAUDEAI_MCP_SERVERS=false` keeps the user's claude.ai connectors (Drive, Docs…) out of CAD sessions.
- **Permissions:** anything other than the CAD tools, TodoWrite, Agent (part designers) and web lookups is declined and shown as a toast.
- **One session per chat lane:** one agent process; each scene tab runs up to 4 chats at once (**lanes**, `src/workspace/agentLanes.ts`), each with its own ACP session (`sessions`: lane key → session id in `acpAgent.mjs`). A lane key is the tab id for the tab's first lane (`main` lane) and `<tab>__<lane>` for the others.
  - Each session's MCP server gets its own bridge URL (`…/<token>/w/<lane key>`), so CAD requests land in that tab's scene and are attributed to that chat. `agent-request`, `agent-status`, `agent-blocked`, `acp-session` and `acp-session-update` events carry the lane key as `workspaceId`; `useTabs.routeEvent` routes them to the tab (`splitLaneKey`), and answers requests for a closed tab with “This scene was closed.”
  - Prompt, steer, cancel, resume and new-conversation calls take the lane key. Sessions start lazily on a lane's first message (the first tab's `main` lane gets one at launch). A reopened chat resumes its session on the next message. Closing a tab cancels and closes every lane's session (`closeWorkspace` with a tab id); dropping one lane closes only its key.
  - Callers without a workspace id (bench, `tools/parts/generate.mjs`) use `main`, the first tab's first lane.
  - A conversation lives in one lane: opening it from History shows its lane, or the tab that has it.
- **Surviving reloads:** the agent runs in the main process, so a renderer reload (Vite full reload, ⌘R) never stops it. Tabs keep their ids across reloads (`open-scenes` stores `tabIds`), so lane keys still match. While a prompt runs, the backend journals it per lane key (`electron/backend/liveRuns.mjs`: the messages the renderer sent with the prompt or a steer, `run`, then every session update). Each tab asks for its runs on mount (`useAdoptedRuns`): the chat is rebuilt from the saved conversation plus the journal (`restoreRunMessages`), the lane shows as running, and `acp-run-end` finishes it. The bridge re-sends unanswered `agent-request`s for that tab (`AgentBridge.replay`); the renderer handles each request id once. Journals are dropped once the renderer has the result (`forgetAcpRun`). Queued messages and Revert Changes don't survive a reload.
- **Concurrent chats (lanes):** New Chat or opening a chat while the current one runs puts it in another lane; the running chat keeps going in the background. A lane is reused when idle; past 4 lanes the oldest idle one (never `main`) is saved and closed. With 4 running: “Up to 4 chats run at once. Stop one to start another.” When a background lane finishes: “Agent finished “⟨chat⟩” · Show”. Scene-wide state (busy spinner, Stop on tab close) covers every lane; the scene record and tab snapshot keep the current lane's chat.
- **Subagents (part designers):** `options.agents` defines `part-designer` (`electron/backend/subagents.mjs`: a role preamble + the CAD instructions; no Agent, TodoWrite or web tools). Built-in types that aren't CAD work are denied (`disallowedTools: Agent(general-purpose)`, `Agent(statusline-setup)`; `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` drops Explore and Plan). Claude Code never asks permission for Agent calls, so the ACP permission handler can't gate them, and `Agent(<type>)` in `tools` removes the tool instead of narrowing it. Any subagent inherits the session's tools, so none can touch files. A subagent's report arrives as its last `SubagentHandback` call (`rawInput.message`), which the designer's row shows as its report instead of a step.
- **Scope:** every request is about the model in the scene (prompt “Scope”: “add support for end effectors” means design them into the robot). The prompt's “Parallel part designers” section has the lead launch one per subassembly in one message after the block-out, each briefed with its part ids, reference rows, photos, interfaces and sizes, then review and mirror. The adapter stamps a subagent's updates with `_meta.claudeCode.parentToolUseId`; `acpTranscript` nests its tool calls (`children`), report (`childText`) and thinking (`childThought`) under the Agent call, shown in the Subagents card (§9 Panel).
- **Who made an edit:** Claude Code sends `_meta["claudecode/toolUseId"]` with every MCP call; the MCP server (`withToolCall` in `cad-mcp/shared.mjs`, AsyncLocalStorage) forwards it to the bridge as the `x-tool-use-id` header, and `agent-request` carries it as `toolUseId`. `ActorIndex` (`src/workspace/agentActors.ts`) maps it to an actor: the lane (`<lane>`) or a subagent (`<lane>/<Agent call id>`).
- **Part ownership:** every agent write claims the part for its actor. A write to a part claimed by another *active* actor is skipped with a problem the agent reads (“left_knee not changed: the “Left leg” part designer is working on it…”). A lead and its own subagents never block each other; sibling subagents and other chats do. Claims lapse when the subagent's Agent call completes or the lane's run ends. The user's own edits are never blocked.
- **CAD tools** come from an MCP server (`electron/cad-mcp-server.mjs`): `get_scene` (one compact line per part, `cad-mcp/sceneText.mjs`; `group` / `ids` read part of it; Claude Code saves any text result over 50,000 characters to a file the CAD agent can't read, so a big scene drops its notes, then lists only groups), `model_part`, `get_part_code`, `add_parts` (block-out), `update_parts`, `delete_parts`, `mirror_parts`, `look` (multi-view renders, optionally isolated by ids), `check_scene`, `robot_skeleton` and `set_status`.
  - Evidence: `list_evidence` / `read_evidence` open the files the user attached (images come back as images, text as text). `find_images` lists the photos on a web page (WebFetch drops them) and `view_image` downloads up to 4 for Claude to look at, downscaled to 1568px by the renderer (`downscale_image` request). Both refuse local and private addresses.
  - `robot_skeleton` (`electron/robot-skeleton.mjs`) reads a published URDF or MJCF and returns the exact zero-pose joint positions, axes and offsets in the studio frame. It reads no meshes, so shapes still come from the photos.
  - `find_robot_description` searches GitHub (at most 2 searches and 4 tree reads, to stay inside the unauthenticated rate limit) for a named robot's URDF/MJCF files, and returns raw URLs for `robot_skeleton`. Without it, whether the agent found the description was luck, and scores swung 10+ points between runs. Repositories are ranked by exact-name match before stars, because a top-starred variant (Berkeley Humanoid **Lite**) once led the agent to build a different robot (r25: 62 vs 84).
  - `check_skeleton` checks the model against the same published description: every moving joint must sit inside some part. It fits the floor offset, and lists joints outside the model with their distance and the nearest part. A joint whose left and right frames disagree along its axis (an artefact of the CAD export) is checked as an axis line, not a point.
  - `compare` puts a reference image (`ref-N`, an evidence path or an image URL) beside renders of the model from a matching viewpoint, followed by a checklist: silhouette fractions, shell shapes, feature ownership, and shadows that aren't geometry. The agent uses it after the block-out, per subassembly and at the end.
  - `look` and `compare` take `az:<deg>,el:<deg>` views as well as the named ones (az 0 = front, +90 = the robot's left side).
  - For a straight-on view (front, side or back) and a reference photo on a plain background, `compare` also measures both silhouettes (`src/utils/silhouette.ts`). The photo is segmented by flood-filling the border colour; the model comes from a white-on-black render. It prints span width per tenth of height and flags bands off by more than 15%, since perspective photos distort widths 5–10%. Chasing every band of a perspective photo (r23) cost Memo's drawing match 0.87 → 0.73. On Memo it reproduces the held-out drawing's errors (hands ×0.85 too narrow).
  - `compare` also prints the model's silhouette profile: width and depth for each tenth of the height, as fractions of total height, with the widest parts per band (from part bounds). The agent checks its proportion table against these numbers instead of eyeballing.
  - **Photo masks:** `compare`, `fit_view`, `trace_outline`, `photo_scale` and `score_fit` mask photos with Apple Vision's `VNGenerateForegroundInstanceMaskRequest` (`electron/native/vision/`, Objective-C++ on Node-API, built by `tools/native/build.mjs`, run in the MCP server process where the photo bytes are, about 20–35 ms a photo). Without the addon or before macOS 14 they flood-fill plain backgrounds as before. Every mask goes through `checkMask` (`src/utils/photoMask.ts`): refused over 60% of the photo or 50% of its edge, and refused when the subject is cut off at the top or bottom unless `ids` is passed. All 13 chat references mask (the flood fill refused 8, and counted 74% of a G1 photo as robot).
  - **Automatic compare** (`cad-mcp/autoCompare.mjs`): `check_scene`, and the first whole-model `look` after `add_parts`, append a width-band verdict for up to 4 of the chat's photos (`ReferenceImages.ofLane`), skipping an unchanged scene.
  - **Sketch targets:** `compare` treats SVG references (an evidence file or pasted code) or `target: true` as outlines to match (`utils/targetFit.ts`): overlap, outline gap in mm, top and bottom corner radii, widths per tenth, a red/blue overlay. SVGs in mm compare at true scale.
  - `fit_view` fits azimuth, elevation and field of view to a photo's silhouette (silhouette renders one per frame, scoring in the image worker), seeded from EXIF focal length for image URLs; `trace_outline` turns a photo outline into 12–32 `profileBody` points in mm; `photo_scale` sets mm per pixel from a part of known size; `score_fit` is one 0–100 number over the photos for choosing between alternative block-outs. `look` takes `labels` (flat colour per part, the same number in every view, a legend), `grid` and `detail` (2,000 px for Claude).
  - **Image caps** (`cad-mcp/imageCaps.mjs`, `CAD_AGENT_KIND`): Claude's reference photos, `view_image` and detail renders go to 2,000 px, not the 2,576 it reads: the API rejects any image over 2,000 px once a request holds more than 20 images, history included. Default renders stay 1,024 px. Other agents keep today's sizes.
  - `find_objects` searches SimReady Central (objects, or kind `robot` for arms and grippers) and `insert_object(url, position)` inserts one (§8e); both are web tools, so offline benchmark runs don't have them.
  - `find_parts` lists the real-parts catalog (`src/data/components.ts`, `hardware.ts`) through the renderer (`agentCatalog` in `src/agent/agentCatalog.ts`): catalog keys, exact sizes in the CAD frame, key specs, mounting details, ports, and prices (`agentCatalogPrices.ts`: checked or dated list price, N·m per dollar, the margin against the scene's hardest stance and holding joints, the budget left; hardware pack prices). Candidates are never sorted cheapest-first.
  - `add_parts` / `update_parts` results end with the running budget line (“BOM ≈ $412 of $800 (actuators $286)”, `utils/budget.ts`) and a premium-pick line for a part over 2× the cheapest one of its class that meets the same spec (`premiumPick.ts`). `set_build` returns the budget plan (actuators ≤ 60%, compute ≤ 15%, power ~10%). `size_actuators` (`cad-mcp/costTools.mjs`, pure logic in `utils/actuatorSizing.ts`) picks, per joint, the cheapest actuator that passes Stance and Heat, plus one tier up, across bus and battery families, and totals battery, regulator and adapter.
  - **Ports and placement:** catalog components carry mounting ports (`src/data/componentPorts.ts`, in the GLB frame, each checked against its mesh by `componentPorts.test.ts`); hardware and CAD parts get theirs from `src/agent/ports.ts`. `get_ports` lists them in the world frame. `mate` places a part by a port against a target port in closed form (no solver) and records it in `ScenePart.mates`. `fasten` picks the ISO stock length from grip and engagement, places the screw, washer, insert or nut, adds the holes to each CAD part's code (marked `// basecase: holes`) and checks driver access along the axis. Tool writes wait for in-flight writes to the same ids (`pendingWrites.mjs`).
  - **Mirroring:** `mirror_parts` places catalog parts by datum (`mirrorDatum.ts`): the mesh is never mirrored, so the copy flips the local axis the part is most symmetric about, and its output and holes land on the mirrored ones (0.000 mm on Ribbit's 8 servos, from 25 mm). A CAD copy's code is wrapped in `mirror()` (`// basecase: mirror x`) and its ports flipped (`mirroredPorts`). Copies keep `mirrorOf`; mirroring again replaces the twin, and edits on either side add a re-mirror hint to the result.
  - **Relations:** recorded mates re-apply when either part is moved or remodeled (`mateFollow.ts`, after every tool call, chains followed, one undo step per call); moving the mated part by hand releases the mate with a note instead of snapping it back; a lost port is reported as a broken mate and the part stays put. `mate` takes `frame` (a joint axis) and `joint` (declares a coaxial or slider mate through `define_joints`; a servo output becomes the actuator). `define_skeleton` stores joint frames, link lengths, actuators and symmetric pairs in `project.skeleton` (agent frame, `types/skeleton.ts`); `frame` on `add_parts` / `update_parts` places a part relative to a joint, and moving the joint moves it; `mirror_parts` puts framed copies on the paired joint; `size_actuators` runs on the skeleton before any geometry (`source: skeleton`, `mass_g`); `define_joints` is seeded from it and flags a servo output more than 0.5 mm off the skeleton axis. `set_interfaces` stores one contract per part designer (`project.interfaces`), and `check_interfaces(owner)` checks envelope, datums (0.2 mm), bolt patterns, seam screws (from the fastener chains) and ownership (`ActorIndex.editsFor`); designers run it before handing back.
  - `find_in_scene` finds parts by words, group, kind, a region or nearness; `get_scene` over 20 parts returns a summary per group (box and ids), with full lines for `ids` / `group`. `get_part_code` suggests the nearest ids for an unknown one.
  - `check_assembly` (`src/assembly/`, analysis worker, 30 s box; WARN only, at most 12 lines): fastener chains (stack, thread end, engagement ≥ 1.5·D or the insert length if shorter, tip in air, uncut hole, unseated or sunk head, tip past its insert, orphan insert), what holds each part (a fastener or 2 mm pocket capture; notes like a strap are unverified), the removal-order fixed point with straight, L-key and ball-end drivers, “drive before installing X” build notes, EN 45554 service steps (battery 2, electronics 5, servos 10; servo rows are pessimistic until units can come out whole) and split planes for parts that enclose their contents. The bridge also returns its plan, service rows and enclosures as data, for the micro-eval graders.
  - `sweep_design` (`utils/designSweep.ts`, `agentSweepRequest.ts`) tries one parameter (a servo for a set of joints, a battery offset, foot length or width) on copies of the scene in memory and returns deltas in static torque, servo price, the cheapest passing set, stability and a derated hold-and-shove sim in a worker. It never edits the scene.
  - `craft_review` (WARN hints, not gates): envelope sharp share, printed bricks (solidity over 0.85), radius ladder, wall consistency, fastener vocabulary, exposed heads, each part weighted by its visible share (`visibleShares`, splatted into 5 views in an analysis worker); `faceted: true` for a hard-edged design language.
  - `check_scene` uses mesh-level checks (`src/three/interference.ts`, three-mesh-bvh):
    - parts that pass through each other, with depth (touching is fine)
    - flush same-facing surfaces that flicker, with area
    - solid parts still left as block-out primitives
    Fasteners are masked against their own stack up to 0.45·D + 0.3 mm, flush faces are reported only between non-hardware parts (fix flicker with a recess, never by moving parts), a twin-difference lint flags mirrored pairs whose clashes, volume or size differ by more than 10% (not contact area: a correctly mirrored servo is a rotated copy), and repeat calls lead with what's new (`repeatLines.mjs`, per lane). On Ribbit it went from 72 lines to 9, none for a screw in its own hole.
    The finished model must have none of these. Designed fits aren't interference (`utils/designedFits.ts`): a heat-set insert may sit its datasheet press fit, (OD − printed hole) / 2, into a printed part, and a tighter hole is reported with its size and the hole the insert needs. A screw into a catalog part is told to line up with that part's real hole (catalog meshes model their tapped holes). Inserts never count as flush faces, since they're buried in their boss.
  - Review renders (`captureViews`) add a headlight, raise exposure and lift the background, so dark parts show their holes and seams.
  - `add_parts` places catalog parts with `{ id, catalog: "component:<id>[|<variant>]" | "hardware:<type>|<size>|<length>[|<finish>|<drive>]", position, rotation }`. They keep the manufacturer geometry, and the agent designs brackets around them. An unknown key is reported as a problem; the rest of the call still applies. Parts sold in versions (STS3215 C001/C018/C044/C046) need the version in the key; a wrong one is an error listing the versions.
  - Any part can stand for a bought supply with `supply: "supply:<id>"` (the battery's envelope): it's counted as that supply in the BOM and weighs what the supply weighs. `material` also takes `pla`, `petg`, `asa`, `tpu` for a part's own filament.
  - `model_part` takes `expect_size`: a part whose compiled bounding box misses it by more than 1 mm or 3% is rejected, not placed. `expect` adds measured requirements (through holes by count, Ø and axis; minimum wall; flat base; symmetry; genus; bodies), frozen per part id in `cad.expect`: a later call can't loosen them silently, and any change is reported. Ports declared in the code (OpenSCAD `echo("PORT", name, [x,y,z], [ax,ay,az], kind[, d])`, replicad `return { shape, ports }`) are stored in `cad.ports`, in the code frame with the axis pointing out of the part; bore, screw, boss and face ports are verified against the mesh.
  - Build tools (§8b): `get_bom`, `set_build` (extras, budget, default filament), `check_printability` (for the scene's printer), `slice_plates` (§8f: the slicer's own time, grams, supports and warnings; never starts a print), `define_joints`, `verify_design`.
- **References:** every chat image is saved to `library/references/ref-N.<ext>`; numbering continues across sessions, so names stay unique. The prompt tells the agent the names in the order shown.
- **Bridge:** the MCP server talks to the app over a token-protected HTTP bridge on 127.0.0.1. The backend forwards each request to the renderer as an `agent-request` event, and the renderer answers via `respondToAgent`.
- **Agent frame:** Z up, front faces −Y, left +X. `src/agent/agentScene.ts` converts to the Y-up viewport (`scene = (x, z, −y)`), including Euler rotations and mirrored CAD geometry (winding flipped).

### CAD kernel (fidelity)
- Parts are code:
  - **OpenSCAD** (`openscad-wasm`, `--backend=manifold`) with **BOSL2** (`vendor/BOSL2`, pinned commit in `.commit`) and the COTS library `vendor/robotics/robotics.scad`. The library has STS3215, MG996R, SG90, Dynamixel XL430 and XL330 servos and pockets, `qdd_actuator` / `qdd_pocket` pancake actuators (QDD_S/M/L) for humanoid-scale joints, mechanism modules (`servo_u_bracket`, `linear_lift`, `parallel_gripper`), wheels, casters, horns, screws, heat-set holes, a 608 bearing, a Pi Zero, a Pi 5 and an 18650 cell.
  - **replicad** (OpenCascade B-rep) for true fillets, shells and lofts.
- **Sandbox:** `electron/cad-kernel/kernel.mjs` runs as a child process under Node's permission model: read-only access to `node_modules`, `vendor` and the kernel folder, with no writes, no subprocesses and no network. The kernel client keeps a pool of up to 4 processes (half the CPU cores) with a 90s timeout per part. Each lane's MCP server has its own pool; a lane's subagents share it.
- **OpenSCAD defaults:** `$fa = 6; $fs = 0.5` on the same line, so error line numbers stay correct. A retry with `$fn = 41` works around a CGAL hull assertion at very low segment counts.
- **BOSL2 patches** (marked `basecase` in `vendor/BOSL2/shapes3d.scad`; re-apply them when you update BOSL2):
  - `cuboid` shrinks a rounding or chamfer that would meet itself (2r = size) to just under the limit.
  - `cuboid` roundings on one edge axis (e.g. `edges="Z"`) extrude a 2D hull instead of a 3D CGAL `hull()` of corners. The 3D hull crashed on everyday enclosures.
- The kernel runs one job at a time per process, so an OpenSCAD instance and its logs are never shared.
- **Errors teach the fix:** OpenSCAD errors keep BOSL2's message and the user's line and module ("Must give two of spacing, n and size — at line 3, in grid_copies()"), without the raw assert source. Common replicad errors get a one-line hint. OpenCascade exceptions are decoded (`replicadSupport.mjs`: `getExceptionMessage`, `getStandard_FailureData`), so a failed fillet reads "StdFail_NotDone: BRep_API: command not done" instead of "[object WebAssembly.Exception]". The agent's replicad code runs inside an inner function, so its own `const` names never clash with the injected helpers.
- **Audit on every compile** (`cad-kernel/audit.mjs`, in the kernel process): non-manifold edges located, with the fix "fuse with at least 0.2 mm overlap"; bodies and sealed voids (a hollow shell is one body with a void, by signed volume per surface); genus; open edges; an explicit error for an empty part; craft metrics (`craftMetrics.mjs`). `model_part` compares the convex-hull volume and body count with the last revision (`cad.audit`) and warns when the hull drops below 50% or the body count rises; raw volume isn't the signal, since deliberate hollowing cuts it.
- **replicad edge helpers** (`replicadEdges.mjs`): `edgeKeys`, `newEdges` (edges a boolean created), `convexEdges`, `edgesOnPlane`, `filletEdges` / `chamferEdges`, which retry edge by edge and at half size and report "fillet … hit N of M intended edges".
- Every compile returns errors (unknown names count as errors), the local bbox, volume and triangle count. The agent must self-check against these.
- **Rendering:** CAD parts are `kind: 'cad_part'` with `cad.{language, code, positions, indices, edges, originOffset, baseSize}`. They render with creased normals and crisp edges, and their code is appended to `DESIGN_BRIEF.md` (§3b).
- **Agent workflow** (the prompt's core; details in the guides): read every attachment and evidence file → find its own evidence (web; `find_images` + `view_image` for views the user didn't provide; `robot_skeleton` for published robot descriptions) → measure photo proportions and anchor scale → post a reference sheet (sources, key dimensions with confidence, structure, gaps) → plan the architecture (part tree, budget split, each enclosing shell's split plane and what must stay serviceable) → block out → `compare` and fix proportions → `define_joints` + `size_actuators` → `model_part` each part (recipes from `find_recipes`, parts placed with `mate`, joined with `fasten`) → inspect with `look(ids)` → mirror → detail pass, `check_scene`, `check_assembly` and `craft_review` → verify each reference with `compare`, ticking off the feature inventory. Up to 3 rounds.
- **Guide examples** (`electron/cad-agent-guides/examples.mjs`): a silhouette-intersection shell, a tapered limb and an egg head (OpenSCAD), a fillet-after-boolean with a smaller-radius fallback and a loft (replicad). `examples.test.mjs` compiles each through the kernel and requires one clean body. Sizes are ratios of one dimension so they don't leak into designs.
- **Recipes** (`vendor/robotics/recipes.scad`, `modules.scad`, included by `robotics.scad`; `mechanisms.scad` on request, since it pulls in BOSL2's gears, joiners and hinges): proven modules that echo `PORT` lines (name, position, outward axis, kind, diameter): seam_shell, split_shell + silhouette_body, printed_block, heatset_boss, counterbore_cut, rib, vent_slots, joint_disc, servo_cradle, servo_u_link, servo_link, servo_base, battery_bay and hatch, pi5_tray, gear_pair, gt2_pulley_pair, four_bar, snap pins, pip_hinge, plus `arm_template` and `biped_template`. Place them with `placed(pos, r, prefix)` so ports follow (a plain `translate` moves geometry, not reported ports); the kernel drops duplicate echoes from `diff()`. `find_recipes(query)` (`electron/cad-mcp/recipes/`) returns use, parameters, ports and a snippet that compiles; snippets stay on neutral objects and are never pasted into the prompt. `recipes.test.mjs` compiles every recipe in the kernel and checks ports and fits (servo in cradle, ±110° sweeps, hatch, gear mesh); `templates.test.mjs` checks the templates against the catalog STS3215's horn face. Not proven by printing yet: the GT2 groove, the 0.3 mm hinge gap. Avoid BOSL2 names in recipe code (`screw_head` collided; ours is `socket_head`). `npm run recipes:harvest <scene.json> <part>` turns a saved part into a candidate recipe in `scratch/recipes/` for review.

### Live presence
- **Cursor:** each scene op moves its agent's blue cursor (`AgentCursor`, `AGENT_COLOR`, the Figma blue `#0d99ff`) to the part before the change lands: one cursor per active actor (`useAgentCursors`), labelled “Agent” for a chat whichever agent runs it, and with its description for a part designer (“Left leg”). A designer's cursor goes when its Agent call completes; a lane's when its run ends. New parts pop in (`animateSpawn`).
- **Subagent colours:** the lead is blue; each subagent gets its own colour from `DESIGNER_COLORS` (`theme.ts`: amber, teal, violet, rose, green, cyan; never the selection blue or cutout red). A designer's colour is its place among the chat's Agent calls (`designerSlots` in `utils/designers.ts`), so the feed, the cursor, the canvas frame and a chat reopened from History always agree, with nothing stored. `colorCursors` (`workspace/designerFrames.ts`) colours each cursor.
- **Subagent frames:** while a subagent works, the parts it has claimed get corner brackets in its colour around their shared bounds (`three/viewport/agentFrames.ts`, `ViewportProps.agentFrames`). They're drawn in `stage.overlays`, so they never rebuild parts and never show in captures; bounds refresh after each render, so moves, poses and spawns follow. Hovering a subagent in the feed focuses its frame (thicker, plus a faint box outline, adding the parts it wrote) and dims the others; a finished subagent's parts frame on hover too. Claims reach the cursor state through `useAgentCursors.claim`.
- **Status:** `model_part` emits a `focus` event while compiling ("Designing ⟨part⟩").
- **Camera follow:** the camera frames the model while the agent builds (`frameAll`), and stops following once the user orbits or zooms.
- **Undo:** one undo step per tool call. **Revert Changes** restores only the parts that chat's last run changed (their state before the run; parts it added are removed), so other chats' and the user's edits stay (`runEdits.ts`, `AgentLane.edits`).

### Panel
- **No header row.** History opens from the Agent tab: while it's the open tab, hovering its pill widens it as a chevron fades in from the left beside the label, and clicking anywhere on the pill opens the chat list (`ChatHistory`). New chat sits in the composer next to +.
- **History list:** as wide as the inspector's header content (the card less its 8px header padding; the menu anchors to the tab row, not the pill), grouped by last use (Today, Yesterday, Previous 7 days, then by month) under quiet group labels. Rows are one line: the title, and the time on the right, which Delete replaces on hover. Running chats in this scene sit in a **Running** group at the top, each with the agent spinner and no time. The current chat sits on a soft fill. Any chat can be opened while others run (§9 Concurrent chats).
- **History:**
  - Conversations are saved to `library/conversations/` after each run, and when their tab closes.
  - Opening one restores the transcript and resumes the ACP session (`resumeSession`), so Claude keeps its context.
  - Each chat has a delete action.
- **Transcript (`segments`):** thoughts, markdown text (`Markdown`, GFM) and tool steps appear in the order they streamed.
  - **Follow:** the feed sticks to the bottom while the agent streams. Scrolling up (wheel, scrollbar, keys) stops the follow until you scroll back to the very bottom; a round “Scroll to bottom” button shows meanwhile. Sending a message re-sticks it.
  - **Edge fades:** a 28px mask fades the top and/or bottom of the feed only while there's more to scroll to past that edge (`feedMask`).
  - **User messages** taller than about 9 lines collapse with a fade and Show More / Show Less. Attached images open in `ImageViewer`; folders show as chips with their file count.
  - **No horizontal overflow:** the feed is `overflow-x-hidden`, and text uses `overflow-wrap: anywhere` (code blocks and tables scroll inside themselves). Tables keep their natural width (`MarkdownTable`: columns size to their content, a cell wraps past 240px) and scroll sideways, fading 24px at an edge only while columns are hidden past it.
  - Only content updates (thoughts, text, tool calls, plan) create a reply; session metadata from the adapter is ignored.
  - **Thoughts:** a light-bulb row (`ThoughtIcon`) styled like tool steps, with no rule or border. While streaming it reads “Thinking” and shows a short window of the newest lines under a top fade. Once done it folds to “Thought ›”, which expands to the full text inline. Thoughts never scroll on their own, so the wheel always scrolls the conversation.
  - **Tool steps** (`ToolStep`, labels in `toolRules.ts`): one quiet row like Thought: a 16px glyph from `toolIcons.tsx`, a plain-language label (“Designing Left Coxa Bracket”, “Inspected …”, “Studied 4 attached files”, “Looked at 2 photos”) that shimmers while running, and a › when there's more. No status icons and no green checks: done is the past tense, failed turns the whole row red. Details (the parts touched, the search, the file) open under the label at the same 13px, with the code (`CodeBlock`) or photos. Only details a person can use: no camera angles, no engine names. Every Basecase tool has a label; an unknown one is humanized (`some_tool` → “Some tool”), never shown as `mcp__…`.
  - **Disclosures** (Thought, tool details): a plain click anywhere in the open text folds it; a drag that selects text, or a click on a link, button or code, doesn't (`Disclosure.tsx`).
  - **Part links:** part names and ids in replies (prose and inline code) and in step details link to the part: clicking selects it on the canvas (`PartLinksProvider.tsx`, matching in `partIndex.ts`: whole words, case-sensitive, longest first, names under 3 characters skipped; a name several parts share selects them all). Code blocks and existing links are left alone.
  - **Groups:** 3 or more consecutive calls of one tool fold into one row with a count (“Designed 4 parts ›”, “Ran 3 checks ›”, `toolGroupLabels.ts`) that expands to the steps. Hidden steps (status, todos) don't break a run; text, thoughts and other tools do (`toolGroups.ts`).
  - **Subagents card** (`DesignersCard`): consecutive Agent calls, even a lone one, gather into one card (`PlanCard`'s soft fill). The UI calls them subagents, never part designers. Its header reads just “Subagents”, with no count or progress bar. Each row (`DesignerRow`) is the designer's arrow glyph in its colour (`DesignerGlyph`, the canvas cursor's shape, with no pulse), its name and, after it, the current step shimmering, then “3 parts” when done or “Couldn’t finish” in red. Hovering a row frames its parts on the canvas. Clicking a row (its chevron nudges right on hover) opens the subagent over the whole Agent panel (`SubagentView`, sliding in with `animate-push-in`): a header with Back (Esc), its glyph and name, and Select 3 Parts once done (no status in the header); then its own feed (`SubagentFeed`) following the bottom like the chat: the lead's brief as the user message, its thinking, its steps (grouped like the chat's), the chat's “Working…” line at the bottom while it runs (`WorkingStatus`), and its report. The composer stays mounted underneath, so a draft survives. While open, its parts stay framed on the canvas (`openedFocus`); the open subagent is per scene (`useAgentSession.openedDesigner`) and closes on its own when its chat isn't shown. While designers run, the lead's status reads “Waiting on ⟨name⟩” or “Waiting on subagents”.
  - **Plan card:** shows the agent's TodoWrite list with live status.
  - **Reply actions** (`ReplyActions`, under the last reply while the chat is idle): a run that was stopped (Stop, or the agent's turn or token limit) ends in “Stopped” + [Continue], which sends “Continue” as a message; a run that failed ends in “Couldn’t finish. ⟨reason⟩” (`AcpChatMessage.failed`, the error without IPC prefixes; the toast still shows) + [Retry], which resends the last user message with its images and folders (`resendPayload`, so it works on chats reopened from History) and replaces the failed reply, or keeps it when it streamed work. Revert Changes sits in the same row.
- **Empty chat:** the feed is just empty; no title, intro or suggestions.
- **Composer:**
  - The placeholder is a short example, with no “e.g.”, cycling every 3.6s (`CyclingPlaceholder`, `placeholder-cycle` in `index.css`): each wipes in from left to right behind a soft mask edge (1.15s), holds, then fades out (0.5s) before the next. It stays on the first under reduced motion. The examples fit the state: idle (“Desk lamp arm”), with attachments (“Match the photos”), or while the agent works (“Longer legs”).
  - The + menu has Attach Images and Attach Folder. Paste or drop images, files or whole folders.
  - **Model menu** (`ModelMenu`, right of the composer's bottom row, before Send): the model's name (“Default”) with a chevron. Nothing is hard-coded: the list is whatever the agent reports at connect (the session's `model` config option, or Gemini's `models` list switched with `session/set_model`; `electron/backend/sessionModels.mjs`, `modelControl.mjs`), so new models show up when an agent updates. Older models are dropped by one rule for every agent (`latestModels` in `modelFamilies.mjs`): the newest version of each family, in the newest generation, plus whatever the agent starts on (Claude: Default, Opus, Fable, Sonnet, Haiku; Codex: 6.1 Sol, 6 Astra, 6 Luna). Default shows the model it runs muted on the right (Opus 5.5); with no choice made the menu shows the agent's own default (Codex reads it from the user's config). Below a divider, an **Effort** slider (stacked `Slider`) over the selected model's levels; the backend learns each model's levels at connect by switching the first session through them (about 0.1 s) and restoring it, and it's hidden for a model without levels. Until moved it shows Claude Code's own effort. The choice is app-wide and kept per agent (`localStorage` `agent-choices`), sent with each prompt (`model`, `effort`), and applied to the lane's session only when it differs (`ModelControl.apply`; effort uses the agent's own option id, e.g. Codex's `reasoning_effort`). Picking a model keeps the menu open so effort can follow. Below another divider, **Context** (`ContextStatus`): the share of the context window in use (bar, amber from 80%), then “84.2K of 200K tokens · $0.42”. It comes from the chat's last ACP `usage_update` (`contextFromUpdate`; subagents' are ignored), is kept per lane and saved with the conversation, and is hidden until the agent reports usage.
  - Up to 20 images go inline with the message (downscaled to 1568px); click a thumbnail to open it in `ImageViewer`.
  - **Evidence folders** (`src/utils/evidenceFiles.ts`): readable files are copied to `library/evidence/<id>/` (up to 400 per folder): images downscaled to 1568px, text files (notes, URDF/MJCF, BOMs, code) as is, and STLs as `.mesh.txt` summaries with exact bounding box, volume and triangle count. Other files (PDF, HEIC…) are counted as skipped. Loose non-image files and images beyond the inline limit become an “Attached files” folder. The prompt lists every file and tells the agent to read them all with `read_evidence`.
  - **Steering:** sending while the agent works injects the message into the running turn (ACP `_session/steering`, `steerAcpPrompt`); Claude reads it between steps and its reply continues below it. If the turn can't take it (offline agent, or the run just ended), it's queued and marked “Sends after this run”. Stop drops queued messages (“Not sent”). The round button is Stop while the agent works and the composer is empty, and Send whenever there's a draft; Esc in an empty composer stops.
  - Agent choice (Claude / Codex / Gemini / Offline), its command and the target height live in Settings → Agent (⌘K → “Agent Settings”). The composer's label names the active agent (`agentKinds.ts`); the canvas cursor always reads “Agent”; tool calls from every agent are normalized to `mcp__server__tool` (`toolIdentity.ts`: Claude Code's `_meta`, Codex's `{ server, tool, arguments }`, Gemini's generated call ids), so steps read the same.
  - The send button becomes Stop while running.
- Agent replies that link out open in the system browser (Electron `setWindowOpenHandler`).

---

## 8a. Real Components (Parts library)

Servos, motors, boards and sensors are real products with exact geometry, never estimates. The step-by-step procedure for adding one (identify, mesh, measure, catalog entry, ports, price, verify) is the `add-part` skill, [.agents/skills/add-part/SKILL.md](.agents/skills/add-part/SKILL.md); keep it in sync with this section.

- **Measuring a mesh:** `node tools/parts/probe.mjs <id> [--axis=x|y|z]` prints a part's bounding box, colours, a height map and every through-hole with its diameter and faces, in the mesh frame `componentPorts.ts` uses.

- **Data:** `src/data/components.ts` (one `ComponentInfo` per product: maker, part number, specs, mounting, links, model source, `pairsWith`). Every number comes from the linked datasheet or drawing. Sizes come from the converted mesh (`component-meshes.json`), so they always match what you see.
- **Scene parts:** `kind: 'component'` + `componentId`. The mesh (`public/parts/<id>.glb`) loads once and is shared (`three/componentMeshes.ts`; never dispose `userData.shared` geometry). Components can't be resized (Inspector, scale gizmo and agent `update_parts` all keep their size). The Inspector skips Size, Shape and Appearance and shows a Product section last, below Notes, collapsed by default.
- **Where meshes come from** (`tools/parts/`):
  1. **Manufacturer CAD first.** `sources.json` lists each official STEP (URL, license, orientation). `node tools/parts/convert-step.mjs <id>|--all` tessellates it with OpenCascade (`occt-import-js`), keeps face colors, turns Z-up into Y-up and writes the GLB. Raw downloads live in git-ignored `tools/parts/cad/`.
     - `"files": [...]` combines several files that share one assembly frame (an enclosure and its PCBA). Check the result: files exported in their own origins don't line up.
     - Files too big for WebAssembly, or IGES whose trimmed surfaces fail, use `"reader": "native"` (`step-native.py`, native OpenCascade through `cadquery-ocp`; point `OCP_PYTHON` at that Python).
     - Makers that publish a robot description instead of an assembly (URDF/MJCF + STL, or one fused STL) go through `node tools/parts/convert-urdf.mjs <id>`: it assembles the meshes at the zero pose. `"rootLink"` takes just the gripper of a full arm; `"modelColors": false` ignores simulation debug colors.
     - Extra bodies (field-of-view cones, keep-out volumes, spare accessories laid out beside the product, the rest of an arm around its gripper): `"hideMeshes"` drops bodies by name, `"keepBox"` keeps only what lies inside a box in the file's own frame.
     - Colors: CAD "no color assigned" defaults (SolidWorks lavender `#cad1ee`, `#97a3da`) become neutral grey; `"colorMap"` sets a real finish for any CAD color (e.g. Trossen's red/blue part colors → black).
     - Orientation: set `"rotate"` so the part sits the way it's mounted (servo horn up, boards component side up, cameras lenses toward +Z, grippers and hands flange down with fingers up), then check front, back, top and side renders.
     - When a published file is incomplete (e.g. no housing surfaces), don't ship it: model the part from the official drawing instead (step 2) and record why in `sources.json` (`note`).
  2. **No official CAD:** the studio's own agent models it from the official drawings. `tools/parts/specs/<id>/` holds the record and drawing images; `node tools/parts/generate.mjs <id…>` (random free port, so stale tabs on familiar ports can't attach) runs the real app headless (like the benchmark) and saves the GLB plus the part code, renders and the agent's notes in `tools/parts/generated/<id>/`. Never hand-model or estimate a component.
  - Community models (GrabCAD, Thingiverse, other robots' repos) don't count as manufacturer CAD.
  - **Checked CAD:** when the maker publishes only drawings (Raspberry Pi 4) or the file comes from a reseller (Unitree GO-M8010-6), a third-party STEP may ship if it's measured against the official drawing first: board or body outline, mounting holes and connector or flange positions within about 0.1 mm. It gets `model.source: 'checked'` with `checkedAgainst: '<maker>'`, and the card says “3D model by ⟨author⟩, checked against the ⟨maker⟩ drawing”. If no file passes, model it from the drawing (step 2).
- **Amazon links:** a verified product page (`kind: 'product'`) when the exact part is listed, else a search (`kind: 'search'`, labeled Find on Amazon). Never guess an ASIN. Hardware tiles link to an Amazon search for the exact spec (`hardwareShopUrl`).
- **Groups added for the whole loop:** Power (Pololu regulators, MPD 18650 holders, and battery packs and cells), Wheels (Pololu, goBILDA, REV, Pololu ball casters), Linear Actuators (Actuonix, Progressive Automations) and Displays & Audio (round and rectangular displays, Pi Touch Display 2, ReSpeaker mic arrays, speakers, I2S amp).
  - Power parts carry typed data the checks read: `battery` (nominal and full-charge volts, Ah, continuous C, `cell` format for single cells), `regulator` (input range, output volts and amps) and `holder` (cell format, count, series or parallel).
  - Gear-ratio versions (Actuonix) are `variants` with no `actuator`; a version's list price falls back to the base part's.
  - Still without maker CAD (download blocked, behind a sign-in or terms, or never published): ODrive S1 and Micro (Onshape only), Jetson AGX Orin dev kit (NVIDIA sign-in), CANable 2.0, mjbots fdcanusb, Same Sky AMT10 encoders (terms), Omron D2F switches, ATI and Bota F/T sensors, Interlink FSR 402, Keystone 1121 21700 holder, Seeed Round Display for XIAO. Add them only through §8a's pipeline.
  - `tools/parts/generate.mjs` has `battery` (flat, long side along X) and `cell` (on its side along X) poses for packs and cells modeled from their drawings.
- Estimated generic parts (servo, stepper, board, camera, ultrasonic, hinge, linear actuator, L/U-brackets, beam, standoff, gripper, wheel, bearing block) live in `BLOCKOUT_ONLY`: the agent can block out with them and old scenes still render them, but Parts never lists them. Add a part to Parts only when its geometry is exact.

---

## 8c. Joints, Poses and Motion

A robot is posable once its degrees of freedom are declared. Posing never edits parts: the modeled pose is the design, and a pose only changes what the canvas shows.

- **Data** (`types/robotics.ts`, saved with the scene in `ProjectSettings`): `joints` (`RobotJoint`: revolute in degrees or prismatic in mm, parent and child parts, `parentJoint` when links between joints have no geometry, origin and axis, range, limb), `pose` (the pose on the canvas: values by joint id plus an optional whole-body `root` offset), `poses` (saved) and `animations` (`RobotAnimation`: keyframes with every animated joint, smooth or linear, loop).
- **Several robots per scene:** `buildRig` finds each robot (joints linked through a parent joint or a shared part, plus unlisted parts grouped with one robot's parts) as `rig.robots` (key = its first base joint id, name = its parts' group). The scene pose holds every robot's joint values and each robot's body offset in `roots` by key; `robotRig` gives one robot alone for IK, gaits and mocap, and `withRobotPose` puts its result back without touching the others. Saved poses and animations carry `robot`; the Pose tab, ⌘K Rest Pose, walk cycles and Import BVH work on the selected robot only, and the agent tools take `robot` (default: the selected one, or the only one). Imported robots get unique joint ids (a second G1's are `left_knee_joint_2`), and scenes saved with repeated ids are renumbered when they open (`uniqueJointIds`).
- **Joints follow their mount:** `frame` stores the pivot in its first parent part's own frame (`anchorJoint`); `resolveJoints` reads it back, so moving or undoing the robot keeps joints in place.
- **Kinematics** (`utils/kinematics.ts`): `buildRig` turns joints into a tree; each part moves with the deepest joint that lists it as a child, a joint's mount moves with the joint above it, and an unlisted part follows its group only when the whole group moves with one joint (a group spanning a whole robot says nothing). `forwardKinematics` composes rest-frame rotations from the base out. `solveIK` is damped least squares (Levenberg–Marquardt) with joint limits; torso joints are stiffer so limbs reach first; `preBend` starts knees and elbows bent the way their range opens (straight joints are singular).
- **Fasteners follow what they clamp** (`src/assembly/followers.ts`, `rigJoints.ts`): in verify, poses and the sim, a screw moves with the deepest joint whose moving set holds everything it clamps, ignoring that joint's own servo (the horn-screw exception); nuts follow their screw, inserts their host. Joints never list fasteners. On Ribbit it reproduced the agent's 672 hand-listed moving screws on all but one fixed pseudo-joint.
- **Joints belong to their parts.** Deleting parts deletes every joint whose moving side is gone and drops the deleted ids from the rest (`jointsWithoutParts` in `kinematics.ts`, run by every `commitParts`); undo brings parts and joints back together.
- **Undo:** pose changes are on the scene's undo timeline. Each history step (`Snapshot` in `SceneWorkspace`) holds the parts, the joints and the pose; `usePosing` reports every pose edit (sliders, the ring, saved poses, Rest pose, the agent's `pose`) through `onPoseEdit`, and edits less than 700 ms apart fold into one step, so a drag undoes in one go. Playback, scrubbing and pausing aren't recorded.
- **Canvas:** `Viewport3D` takes per-part rest → posed motion (`pose`). Measurements, interference (check_scene), servo outputs and sweeps run in the modeled pose (`withRest`); renders show the pose. Moving a part while posed maps the edit back to the modeled pose.
- **Pose tab** (right panel, beside Inspect, only while the selection is on a robot; P opens it, selecting the first robot if needed). It shows that robot's animations, poses and joints: while it's open, clicking a part picks the joint that turns it, and a single ring on its axis (an arrow for a slider) turns it in 1° / 1 mm steps (Shift is free). Picking a toolbar tool leaves the tab. Contents: Animations (play, scrub, + → Walk Cycle, Import BVH; right-click for Loop, Rename, Delete), Poses (Rest pose and Save pose in the header; click applies), then one collapsible section per limb (Head, Torso, Left arm…) with label · slider · value rows. The selection bar hides while posing.
- **Animation** (`utils/animation.ts`): `sampleAnimation` (Catmull-Rom or linear; whole-body turns slerp), `buildKeyframes` (values and IK goals per keyframe), `buildGait` (any number of feet; stance feet stay planted, swing feet lift; stride, lift, period, duty, crouch, bob, sway, heading and oscillators default from the leg length). Playback runs in `usePosing` and drives the canvas directly; pausing commits the frame as the pose.
- **Posable hands** (`data/articulatedParts.ts`): catalog parts whose maker publishes a URDF / MJCF with the joints (Amazing Hand, LEAP, ORCA, Ability, Dex3-1, Dex5-1, Allegro, Linker L10 and O6) go in from Parts → Hands (click, + or drag) as that articulated model: links as `mesh` parts, fingers as joints, turned by the same `rotate` as their catalog mesh (`importRobot`'s `rotate` option uses tools/parts' `(x, z, −y)` frame), framed and selected. The palm carries `componentId`, so the Inspector shows Product and the BOM counts the hand once. If the description can't be downloaded, the fixed catalog mesh goes in instead. Hands without a published description (Inspire, HOPEJr, Aero) stay one mesh.
- **The maker's data is never missing:** an import captures everything the checks and tools use (link masses and centres of mass, joint ranges, torque and speed limits), and every link records where it came from (`ScenePart.robotLink`: robot, link, source link, `rotate`, data `version`). When imports start capturing something new: add it to `publishedData` (it feeds both the import and the upgrade) and bump `ROBOT_DATA_VERSION`. Robots below the current version are upgraded from their description alone (no meshes), matched by link and joint name so poses and edits are kept: open scenes when they load (undo history included), saved scenes in the background when the app starts (saved back in place, `keepUpdatedAt`). Older robots without a recorded source are found by name (a preset, a Parts hand, Robots → Imported); one that can't be found gets a toast to insert it again. Animations report joints faster than their speed limit.
- **Published robots** (`utils/robotImport.ts`): URDF and MJCF (defaults classes, includes, hinge chains on one body, visual geoms) with STL / OBJ / DAE / GLB meshes from a URL (GitHub links and Git LFS work; `package://` is resolved against the repository) or a folder. Each link with geometry becomes a `mesh` part (simplified with meshoptimizer toward a ~220k-triangle budget, never past 0.2% error, so cracked published meshes keep more triangles instead of tearing; not printed, not resized); every revolute / prismatic joint keeps its axis and limits. Robot frame (REP-103) → scene: `(y, z, x) × 1000`. Collada keeps the file's own axes. Every import from a link renders a preview (`robotPreviewImage` in `utils/robotPreview.ts`: the Library's thumbnail renderer, cropped to the robot, WebP) after the robot is inserted and remembers it (`localStorage` `robots-imported`). Presets ship theirs in `public/robots/<id>.webp`, made by the same import: `node tools/robots/previews.mjs [id…]` (rerun it when a preset is added). Presets (`ROBOT_PRESETS`, each checked to import whole): Unitree G1, H1, H1-2, Apptronik Apollo, Booster T1, Berkeley Humanoid; ROBOTIS OP3, Open Duck Mini v2; Unitree Go2, Go1, B2, ANYmal C, Spot; SO-101, Franka Panda, UR5e (the Robots view, ⌘K, File → Import Robot). MJCF `<frame>` elements are followed, and collision-class or group-3 geoms are skipped.
- **Motion capture** (`utils/mocap.ts`): BVH through three's `BVHLoader`, bones matched to landmarks by name (Mixamo, CMU, Daz `lShldr`, UE `upperarm_l`…), robot joints matched by name (`left_knee`, `LL_KFE`, `FL_calf`…). Retargeting points each robot segment the way the performer's segment points (so proportions and rest poses can differ), moves the body by the hips scaled by leg length, and keeps feet on the floor while the performer stands. The Retarget sheet shows the match (changeable), In place, Loop and frame rate.
- **Agent tools:** `get_rig`, `pose` (values, IK goals, body offset, save / apply), `animate` (keyframes or a gait; reports IK misses, limits, collisions and the floor at 8 times; preview frames), `retarget_motion` (an attached .bvh or a URL), `import_robot` (preset or URL); `define_joints` takes prismatic joints and `parent_joint`.

## 8b. Build: BOM, Budget, Printability and Engineering Checks

The Build tab (right panel) and the agent's build tools turn a model into something you can print and buy. Everything here is computed from the scene; nothing comes from agent text. The rules come from docs/research/Printable humanoid engineering (cited there), never from other local projects.

- **Project settings** (`ProjectSettings` in `types/robotics.ts`, saved with the scene): printer (a My printers id, a catalog id, or `default`; old `bambu-p1s` maps to the P1S), print quality (`printProcess`), default filament, infill, budget, purchase-only extras, declared joints.
- **BOM** (`utils/bom.ts`): components counted by part (and version), hardware by exact normalized spec (`hardware:type|size|length|finish[|drive]`), parts with `supplyId` as that supply, printed parts as filament grams per material (shell + infill model, Bambu densities) plus estimated supports, then spools with a 15% margin; extras by key. Stand-ins (block-out kinds) and parts tagged CNC, laser-cut or hand-modeled COTS are listed as needing a source.
- **Prices:**
  - **Checked:** `library/purchases.json` (app-wide, keyed by catalog key) holds the price the user saw, with pack size and local date; the listing (link, title, note) is optional. Amazon links are saved as canonical `/dp/ASIN` URLs, other store links as typed. Over 60 days old is Stale. The app never fetches Amazon, and the agent never states a price that isn't in the BOM.
  - **Currency** (`utils/currency.ts`, `currencyStore.ts`, `useMoney`): every amount is stored and computed in US dollars and converted only when shown, so the BOM, checks, budget and agent tools never mix currencies. The 30 ECB currencies; rates come from Frankfurter (`RATES_SOURCE`) once a day at startup, else the bundled `BUNDLED_RATES` (`data/exchangeRates.ts`; refresh them when you touch it). A price or budget typed in another currency keeps what was typed (`PurchaseRecord.entered`, `ProjectSettings.budgetEntered`) beside its dollar value, so it reads back exactly. Components format with `useMoney()` (never a module-level helper, or the React Compiler caches the old currency); plain text for the agent uses `formatMoney` / `formatWhole`, adds `currencyNote` when it isn't USD, and `set_build` takes `budget` in the user's currency. Checks rerun when the currency or rates change. Amazon links stay on amazon.com.
  - **Estimated:** `data/listPrices.ts` holds list prices from maker and US distributor stores (never Amazon), each with store, URL and date. Shown as "≈ $" and counted only in the estimated total.
- **Supplies** (`data/supplies.ts`): generic bought goods (wiring, chargers, filament, tools, and the generic batteries and buck converter older scenes use) with an Amazon search for the spec. Batteries and regulators with exact shapes are Power components (§8a).
- **Printability** (`three/printability.ts`, `utils/printReport.ts`): each printed part in its own frame tries the 6 axis orientations plus up to 6 large flat faces it can rest on (or the face the user picked); the scene's printer bed and keep-outs come from the printer catalog (§8f), long parts across the diagonal; overhangs past 45°, support volume under faces within 30° of horizontal (the stock profile's threshold, Morgan 2016 drop method); walls under 0.84 mm by inward rays; time from extruded volume; MaxRects-packed plates (§8f). Labelled estimates until the plates are sliced.
- **Engineering checks** (`utils/engineering.ts`), each Pass / Warn / Fail / Not run with a one-line summary (`detail`) and, when something's wrong, one line per problem (`items`, each selecting its parts). Name joints and parts as people read them (“Left shoulder roll: clear to −75° of −100°; at −100° the left hand meets the hip pitch left”), never by id; summarize repetitive results (“No torque data for 23 joints”) instead of listing them:
  - Weight: total mass and centre of mass from printed mass, catalog weights, fastener volume × finish density, supply weights; estimates flagged.
  - Servo torque (`actuatorRules.ts`, `engineeringCrouch.ts`): stall and rated torque at the servo supply voltage (a regulator's output, else the battery's nominal), interpolated over the datasheet's voltage points and scaled down below the lowest. Leg pitch joints carry the whole robot on one leg (two for 3+ legs) at the gait's crouch, at least 30°: τ = m·g·lever·sin(θ/2). **Stance** PASS ≤ 0.40 of stall, WARN to 0.60, FAIL above; **Heat** 0.67 × τ ÷ rated PASS ≤ 1.0, WARN to 1.6, FAIL above. Other joints hold their limb across the range: PASS ≤ 0.40 of stall and ≤ rated, FAIL above 0.60. Rated falls back to ¼ of stall. **Peak** is Not run until a trained walk policy is simulated with force limits at 0.7 × stall. The thresholds come from robots that walk (docs/research/Agent harness/actuator_sizing.md): no walker meets the old 1/5-of-stall rule at the knee. Actuator numbers per version in `ComponentInfo.actuator` / `variants`, with sources.
  - Peak torque (`engineeringPeak.ts`, `agentPeak.ts`, `utils/peakTorque.ts`): `verify_design` with `peak: true` walks the latest walk policy in MuJoCo for 14 s with two shoves of 0.3 × weight, every force limit at 0.7 × stall at the supply voltage. Per leg joint: the 99th percentile (25 ms windows) of the torque the joint *asks for* (the position servo's command before its force limit; the delivered force can never pass the limit) over stall. PASS ≤ 0.8, WARN ≤ 1.0, FAIL above stall for more than 50 ms or a fall. The walk's RMS replaces 0.67 × stance in Heat. Not run without a walk policy. Building the MuJoCo model still runs on the main thread (about 0.5 s the first time, hulls cached per part after, `mjcfHull.ts`), as the live sim does.
  - Budget (`engineeringBudget.ts`): the BOM estimate (checked plus list prices) against the budget. FAIL over, WARN above 90%.
  - Range changes (`engineeringRanges.ts`, WARN): a joint narrower than its first definition (`project.firstRanges`, set once by `define_joints`), with the old value. The agent can't clear it.
  - Servo alignment: each servo's output on its joint axis, the output read from the servo mesh's top cap.
  - Joint support: each joint held on both sides by a bearing on the axis, a second servo, or a link that reaches past both ends of a dual-shaft servo.
  - Range of motion: the distal parts swept through the range against the rest and the floor, with mesh interference; reports how far each joint end is clear. Fails for designed joints. Published robots' joints (`RobotJoint.published`) only warn: their limits are the motor's, reached with other joints moved, and contact under 5 mm is links meeting at a hard stop.
    - A servo's output turns with its joint: its horns, spline and output gear (the mesh bodies centred on its output line, `three/analysis/rotorSplit.ts`) rotate with the link they drive, so screws seated in a horn never “hit” their own servo. Pose and animation checks test the parts riding an output against the servo's case alone (`outputRiders.ts`). Meshes whose horn shares vertices with the case (DS3218, XM430, XM540, the XL430's front horn) can't be split and fall back to one rigid body.
  - Published robots: link masses (`ScenePart.massG`) and centres of mass (`ScenePart.com`, in the part's frame), both from `<inertial>`, count as known weights, and each joint's torque limit (`effortNm`: URDF `effort`, MJCF `actuatorfrcrange` / actuator `forcerange`) stands in for servo data: Pass ≤ half of it, Warn ≤ it. Servo alignment and joint support only run when a joint has servos.
  - Battery (`utils/powerSources.ts`): a Power pack in the scene, else a holder with matching cells (series multiplies volts, parallel multiplies capacity), else a lone cell, else a battery supply (older scenes).
  - Servo voltage: battery full-charge voltage against each servo's listed maximum (an STS3215 C001 shuts down above 7.4 V). When the battery is too high but a regulator in the scene outputs inside every servo's range (and takes the battery as input), it passes and names the regulator to wire them to. Current and runtime: peak current against the battery's C rating, plus fuse and runtime estimates.
  - Regulator input: with regulators in the scene, the battery's nominal and full-charge voltage against each regulator's input range.
  - Standing stability: centre of mass over the support polygon, with tipping angle.
  - Heat near servos: PLA touching a servo (PLA softens at 54 °C; servos run at 60–70 °C).
- **Joints** (`RobotJoint`): parent and child parts, actuators, range, limb. With an actuator, the pivot and axis come from the servo's real output. Downstream parts follow from the joint tree.
- **Library joint modules** (`vendor/robotics/robotics.scad`): `STS3215` follows the Feetech drawing: axis 12.5 mm from the case center, Ø19.95 aluminium horns with 4 × M3 on Ø14 on both faces, 1.4 mm beyond the case. `servo_u_bracket` bolts to both horns. `heatset_hole` sizes include the ~0.25 mm printed-hole shrinkage and 1 mm extra depth.
- **UI:**
  - **Budget:** the estimated total (checked prices, plus list prices for the rest, marked ≈), a budget field, and a bar (solid for checked prices, light for the estimate) with “$40 left” or “$12 over budget” against the estimate. No price counts (“3 to price”, “2 of 5 checked”): the bar and the ≈ already say how much is estimated.
  - **Build guide** (`GuideSection`, `src/guide/`), right under Budget: a step-by-step assembly PDF. Generating runs in a worker (`guide.worker.ts`; `generateGuide` packs the parts, the worker measures contacts, plans, draws and writes the HTML, the main thread saves the PDF), so the app stays responsive and you can keep working; a toast with Open says when it's done. While it runs, the card keeps its cover (the new cover replaces it as soon as it's drawn), shows the step being drawn, the time left once it can be estimated, and Stop. An out-of-date guide says so in amber and its button reads Update. Every scene with built parts keeps a current guide (`useGuideAutoUpdate`, Settings → Build → Auto generate build guide, on by default): 15 s after the last change to what the guide shows (`guideFingerprint`), while no agent in the scene is working, it generates or regenerates quietly, with no toast on success or failure. Background runs go one at a time across tabs. Stop, or a failed run, leaves that version alone until the scene changes again; opening another scene in the tab cancels a run. Steps follow the order `check_assembly` proves (`provenOrder.ts`); parts the planner couldn't place come first by the heuristic, and their steps say “Order not checked”.
    - **Open** (the cover, the Open button, the toast, the agent's guide link) shows the guide in the app (`GuideViewer`), not the system PDF viewer. The HTML the PDF is printed from is kept beside it (`library/guides/<id>.html`, read with `guide:html`), parsed into pages, each in its own shadow root with one shared stylesheet (`guide/viewer/`), and prefetched at idle. A guide with no saved HTML is regenerated, then opened. The cover thumbnail flies into the first page on a spring (`springEasing.ts` turns a spring into a CSS `linear()` easing), keeping the thumbnail's tilt, while the next pages rise in behind it; closing flies the page nearest the centre back into the thumbnail. Pages fit the window height; pinch, ⌘-scroll or − / + / 0 zoom about the pointer, ← / → and the toolbar's arrows turn pages, Esc or the × at the top right closes. The toolbar floats at the bottom: Previous page, “3 of 60”, Next page, Zoom out, Zoom in, Show in Finder, Open PDF.
    - Regenerating is incremental: the worker keeps the guide's renderer for 2 minutes after a run (at most 2), syncing only parts whose identity changed, and caches contacts and every drawing (cover, item thumbnails, modules, steps) by the identities of the parts it shows (`GuideCache`, keys sent from the main thread's `WeakMap`). An unchanged scene regenerates in about 2 s; an edit redraws only the steps that show the changed parts.
  - **Checks:** Run Checks. Before a run, every check (`ENGINEERING_CHECKS`) is listed by name as Not run; after, rows show the result and you click them to select the parts involved.
  - **Parts to buy:** quantity and packs, ≈ estimate or price, open listing, Add Price sheet (price first, typed freely and shown as `$1,200.50`, Enter saves; the listing fields fold under Listing); Export BOM as CSV or Markdown (shown only when there are lines). Empty, it reads just “No parts”.
  - **Supplies.**
  - **Printing** (`PlatesSection`): Printer (My printers, Add Printer), Quality (the slicer's process presets), Material, Infill; the plates with time and grams (≈ until sliced), each opening Print mode; Lay Out Plates, Slice / Slice Again, Open in Bambu Studio (or OrcaSlicer); Skip N printed parts. §8f.
  - **Printed parts** (collapsed): per-part size, time, plate, copies and issues.

## 8d. Simulate & Train (MuJoCo)

Stages 3 and 4 of the robotics loop (§1); milestones in [docs/Robotics loop.md](docs/Robotics%20loop.md). The **Simulate** tab (right panel, shown while the scene has joints) runs the scene's robots under MuJoCo physics and trains policies for them.

- **One engine, one model.** MuJoCo runs the live sim (`@mujoco/mujoco`, DeepMind's official WebAssembly build) and training (the `mujoco` Python wheel), both at the **same pinned version**, from the same generated MJCF. Never add a second physics engine. What you train is what you saw.
  - **Updating MuJoCo:** `node tools/sim/update-mujoco.mjs [version]` (latest when omitted) bumps `package.json` and `electron/trainer/pyproject.toml` + `uv.lock` together, then runs `node tools/sim/smoke.mjs`, which fails if the two engines differ in version or in result. Never bump one side alone. We consume upstream releases; we don't fork MuJoCo's C code.
- **The scene is the source of truth.** `src/sim/mjcf.ts` (`buildMjcf`) writes the MJCF from the scene; never hand-edit or store a model file as truth. Fix the design, and the model follows.
  - Bodies: one per joint (`buildRig`), holding the parts that joint moves, under a root body with the robot's base. Robots with leg joints float (free joint); others are welded to the floor. Parts with `physics.dynamic` (SimReady objects, §8e) get a free body per group, with their own mass and friction, and collide with robots, scenery and each other. Every other solid part is fixed scenery.
  - Body frames keep the world's orientation at rest (origin = the joint's pivot), so sim poses map back to parts without rotations (`simDeltas` in `useSimulation.ts`).
  - Frames: scene mm Y-up → MuJoCo m Z-up as `(x, −z, y) / 1000` (the agent frame). The robot faces −Y.
  - Geoms: the convex hull of each part's mesh (hull vertices only, `maxhullvert` 96, `inertia="convex"`), mass from `partMasses` (§8b), inertia from the hull. Robot geoms collide with the floor and scenery, not with each other (rest-pose hulls overlap); exact self-collision stays with the mesh sweeps in `three/interference.ts`.
  - Joints and position actuators (a servo): range from `RobotJoint`, force limit from the servos' stall torque (`actuatorOf`), else the published `effortNm`, else an estimate from the weight the joint holds (labelled in the Model section). `kp` reaches full torque about 10° off target, `dampratio` 1, armature from the torque.
  - The start state is the pose on the canvas, lifted to just above the floor.
- **Simulating never edits parts.** Like posing (§8c), the sim only moves what the canvas shows (`Viewport3D.setPose`). Ending it, or editing parts or joints while it runs, returns the canvas to the posed model.
- **Off the main thread.** `src/sim/sim.worker.ts` runs `SimEngine` (`src/sim/engine.ts`, no DOM, so it also runs in Node) in real time × speed and posts body poses per frame. `Simulation.run()` steps a fresh model headless in its own worker (for agent checks) without touching the live one.
- **Controllers:** Hold pose, an animation's keyframes (does the walk cycle really walk?), a trained policy, or Limp. Push shoves the robot sideways with half its weight for 0.15 s.
- **Grab and fling:** while a simulation is loaded, the Move and Rotate gizmos grab instead of edit (`Viewport3D` `onGrab`; parts never change). The dragged part's body is pulled toward the gizmo on a critically damped spring scaled by its robot's mass, with gravity compensated (`SimEngine.grab`, like MuJoCo's viewer perturbation), so a slow drag lifts or turns the robot and a quick release flings it. A multi-selection grabs its first part, and its gizmo follows the robot.
- **Result:** per robot "Standing" or "Fell at 2.4 s" (tilt over 60° or the root below 45% of its start height), tilt and distance moved; Peak torque lists the hardest-working joints (peak / limit, time at the limit), and a click selects the joint's link.
- **Training** (`useTraining.ts`, `electron/trainer.mjs`, `electron/trainer/train.py`):
  - Runs as a child process through **uv**, which installs the pinned Python, MuJoCo and PyTorch on first use into `library/trainer-env` (`--frozen` against `uv.lock`). Without uv the Train section says how to install it.
  - Users pick tasks, not rewards: **Stand** and **Walk** (a forward speed), with a 5 min / 20 min / 1 h budget. Floating robots only.
  - PPO (rsl_rl-style: ELU MLP 256-128-64, adaptive KL step, GAE) over 64 robots stepped together by MuJoCo's threaded `rollout`; about 20K steps/s on an M-series Mac.
  - **Sim-to-real by default:** every robot gets its own friction (0.6–1.3×), link masses (±15%) and servo stiffness (±15%), a random heading and start noise, and is shoved every 2–5 s.
  - Progress streams as `train-progress` events (one JSON line per batch). Stop saves what it learned. The policy is checkpointed every minute, then evaluated in a clean 8 s run.
  - Results go to `library/policies/<id>/`: `policy.json` (the app runs it), `policy.onnx` (anything else runs it) and the `model.xml` it trained on. The scene keeps a `PolicyRecord` in `project.policies`.
- **The policy contract** (`src/sim/policy.ts`, mirrored in `train.py`): observation = gravity, angular and linear velocity in the root frame, command, joint positions − default, joint velocities, last action; action = default + 0.25 × clip(a, −1, 1), every 20 ms. Change both files together and bump `POLICY_VERSION`.
- **Agent tools** (`src/agent/agentSim.ts`, `cad-mcp-server.mjs`): `simulate` (seconds, controller `hold` / `limp` / `animation:<name>` / `policy:<name>`, shoves by direction and share of body weight, rendered frames) reports falls, tilt, travel and each joint's peak effort against its limit; `train_policy` (stand / walk, minutes) starts training and returns; `training_status` reports progress and the policies with their clean-run results. The prompt has the agent simulate every legged design (hold, then shoves) and fix the design, not the test. `__studio.simTool(kind, payload)` runs the same tools in dev.
- **Not done yet:** sim results as engineering check rows (Pass / Warn / Fail), Reach for arms, action latency randomization, self-collision between non-adjacent links, cloud GPU training.

## 8e. SimReady objects and robots

NVIDIA's [SimReady Central](https://huggingface.co/spaces/nvidia/simready-central) indexes about 3,600 OpenUSD assets that makers host in their own Hugging Face datasets: props (NVIDIA's ~2,500, ForgeCAD, Palatial, LG, Vertiv) and robots and grippers (Franka, UR, FANUC, Comau, Standard Bots, Robotiq, OnRobot, AgiBot, Menlo). Most NVIDIA props and the makers' arms and grippers carry a MuJoCo physics variant: masses, convex colliders, physics materials, joints with limits, actuator force ranges.

- **Nothing is bulk-downloaded.** The renderer searches the Space's public API directly (`src/simready/search.ts`: `POST /search`, hybrid text + SigLIP2 vector query, `filter_url_regexp` by maker namespace for the Objects / Robots shelves, 40 per page by `offset`; thumbnails from `/images`). CORS echoes any origin. If the Space is down, the views say “Couldn’t reach SimReady Central.” with Try Again.
- **Insert = download one package, convert, import.** `electron/simready/` (`SimReady` in `index.mjs`, IPC `simready:fetch` / `simready:file`, HTTP `/simready-fetch` / `/simready-file`): lists the package's files at its pinned commit through the Hugging Face tree API, skips `source_assets/`, `.thumbs/`, `.metadata/` and non-albedo textures (normal, ORM, roughness…), caps a package at 600 MB, downloads into `library/simready/<ns>--<dataset>--<package>--<sha12>/files/`, converts, then deletes the raw files and keeps `model/`. Converted models are reused until `CONVERTER_VERSION` changes.
- **The converter** (`convert.py` + `frames.py`, `meshes.py`, `looks.py`, `physics.py`, `glb.py`) runs through uv with pinned `usd-core`, numpy and Pillow (`pyproject.toml`, `uv.lock`, env in `library/simready-env`), like the trainer. It selects the MuJoCo variant when the asset has one, reads rigid bodies (mass from the body or its colliders, else density × volume), joints as a tree from the base (loop-closing joints left out), limits, drive or `MjcActuator` force limits, velocity limits and friction, converts to meters with Z up, and writes `model.json` plus one geometry-only GLB per body (`meshes/<n>.glb`) and one `visual.glb` for the asset: a node per body, a primitive per material, UVs and each albedo texture once (JPEG, at most 1024 px). Materials are read from UsdPreviewSurface, OmniPBR / OmniSurface MDL inputs and OpenPBR-style names, per geometry subset; a texture that's authored but missing never falls back to the material's white tint.
- **Import** goes through the robot importer (`Source` kind `converted`, `utils/robotImport/simready.ts` → `Model`), so links become `mesh` parts and joints posable joints. `simready/loadAsset.ts` adds `simready` (url, name, maker, license) to every part, `physics: { dynamic, friction }` to objects with no moving joints (dynamic when the maker gave a mass), names single-body objects after the asset, and `mesh.visual` (`{ key, node, matrix }`) pointing at the body's node in `visual.glb`.
- **Textures:** `three/simreadyVisuals.ts` loads an asset's `visual.glb` once (from the cache, or by downloading the package again when it's missing, so saved scenes open anywhere) and bumps a version the viewport adds to its mesh version. `partMesh/simreadyVisual.ts` draws the textured pieces in the part's frame; the plain mesh stays as an invisible stand-in for picking, shadows, measuring and the sim. Until the visual loads, and in thumbnails, the part shows its dominant colour (by surface area). Setting a colour by hand drops the texture.
- **Licences:** shown per asset (most are CC-BY 4.0; OnRobot BSD-3-Clause, FANUC Apache-2.0, UR its own). The Details card links to the asset on Hugging Face.



## 8f. Printing: printers, plates, slicing and sending

Stage 5 of the loop (§1). The plan, findings and what's still unverified: [docs/Print plan.md](docs/Print%20plan.md). Nothing about a printer is hard-coded: the P1S is one catalog entry.

- **Printer catalog** (`src/data/printerCatalog.ts`, generated; types and helpers in `data/printers.ts`): 92 printers from the machine profiles Bambu Studio ships (`Resources/profiles/<Maker>/machine`, inheritance resolved): bed polygon, height, keep-out zones, nozzles, default plate type and, for the 0.4 mm nozzle, the machine, default process, process presets by layer height and a filament preset per material. Regenerate with `node tools/printers/import.mjs [--app /path/BambuStudio.app]` when Bambu Studio updates; never edit the file by hand. Custom printers take a build volume.
- **My printers** (`library/printers.json`, `electron/print/printers.mjs`): app-wide, one default. On first launch the list is seeded from the printer selected in Bambu Studio (`BambuStudio.conf`), sending through Bambu Studio. Access codes and API keys are encrypted with `safeStorage` in `library/agent-config/printer-keys.json` (`AgentKeys` with `file`), never in the scene. A scene's `project.printer` resolves with `resolvePrinter` (a My printers id, a catalog id, or the default printer).
- **Plates** (`src/print/`): the analysis worker returns a printer-independent `PrintShape` per shape (poses: 6 axes plus up to 6 flat faces the part rests on, each with its rotation, footprint, overhang, support and contact). `choosePose` picks one for the bed (`bed.ts`: keep-outs, 90° turn, diagonal fallback); `pack.ts` packs per material with MaxRects around the keep-outs; `buildPrintPlan` returns plates with a matrix per item (part frame → 3MF bed frame, Z up) and a hash per plate. User choices live on the part (`ScenePart.print`: `down` face, `plate`, `at`, `turned`, `copies`, `skip`), so they undo like any edit.
- **3MF** (`print/threeMf.ts`, run in the analysis worker): one file per material, plates laid out on Bambu's plate grid (plate i at column × width × 1.2, row × −depth × 1.2, columns = ⌈√n⌉ rounded as Bambu does), plain 3MF core, names kept. Export ▸ 3MF Plates downloads them.
- **Slicing** (`electron/print/`: `slicers.mjs` finds Bambu Studio, OrcaSlicer, PrusaSlicer; `slice.mjs`, `jobs.mjs`): the CLI runs headless per material with **flattened** profiles (the CLI doesn't follow `inherits` for loaded files and falls back to a 200 × 200 × 100 plate), `--arrange 0`, infill and the printer's default plate type (`curr_bed_type`) written into the process. Results come from `result.json` and the sliced 3MF: time, grams, supports, warnings and the plate thumbnail per plate, cached per material by plate hash in `library/prints/<scene>/`. The CLI can't take per-object filaments with 3MF input and crashes on edited Bambu projects, so materials are separate jobs. `electron/print/slice.test.mjs` slices for real when Bambu Studio is installed.
- **Sending** (`electron/print/index.mjs`, connectors in `electron/print/connectors/`): Bambu Studio (default for Bambu printers: opens the sliced plates, where Print uses the user's own sign-in), Bambu Connect (URL scheme), Bambu LAN (Developer Mode: FTPS upload + MQTT `project_file`, live status, AMS trays), Moonraker, PrusaLink, OctoPrint (plain G-code pulled from the sliced 3MF). Find on Network reads Bambu SSDP and mDNS. **Only the user starts a print**: Print Plate N opens a Start Print sheet (plate, material and AMS slot, Clear the bed); the agent's `slice_plates` never sends.
- **Print mode** (⌘P, File ▸ Print, Build ▸ Lay Out Plates, ⌘K): the canvas shows one plate (`three/plates/plateView.ts`, its own WebGL canvas while open; the scene viewport pauses) with the bed, its keep-outs and the parts in print orientation (shared geometry). Drag to move (saved as `at`), F Lay on Face, R Turn 90°, ←/→ plates, Esc closes. The Print panel replaces the inspector: Printer, the selected part (Lay on Face, Turn 90°, Plate, Copies, Don't print), the plate (thumbnail when sliced, warnings, Send / Print Plate N, Open in Bambu Studio, Mark Printed / Failed) and the plate list; the bottom bar lists plates, Auto Arrange and close.
- **Prints tracker** (`print/tracker.ts`, `project.prints`): a record per plate sent (parts with their shape keys, printer, state from live status or marked by hand). A part counts as printed while its shape is unchanged, and Skip N printed parts (on by default) leaves those parts off the plates, so editing one bracket after printing gives a plate with just that bracket.

`bench/` measures how close the agent's model is to the real robot. Never tune the agent for one robot: every change must be general engineering practice.

- **Tasks** (`bench/robots.mjs`):
  - **URDF robots:** Reachy Mini, Open Duck Mini v2, Berkeley Humanoid and Unitree G1 are scored against meshes assembled from their published URDFs, at the zero pose or a `pose` override (G1's elbows are straightened to match the photos).
  - **Photos only:** robots marked `offline` run with web tools off (`STUDIO_AGENT_OFFLINE=1`), which tests design skill rather than lookup. G1 runs this way.
  - **No public CAD:** a task can give `frontDrawing`, a held-out orthographic front drawing that scores the silhouette (`bench/drawing.mjs`). Memo (a home robot with no public CAD) was scored this way from four photos; those inputs aren't public, so it's no longer in `bench/robots.mjs`, but its results below stay for history. MicroDuck has only a kinematic skeleton.
  - **Single parts** (`part-xl430`, `part-oak1`): the agent models a catalog part itself from photos, without placing it. The result is scored against the manufacturer's own mesh (`bench/glb.mjs` reads the GLB) over all 24 axis orientations. The judge compares it with renders of the real part in `judge-refs/`.
  - **New concepts:** text-only briefs (a wheeled home helper, a desktop biped), judged against the brief.
  - **Builds** (`build: true`): a brief that must also pass the build checks (`build-humanoid`: a ~50 cm Sprout-style humanoid for the P1S with an $800 budget). The run also saves `scene.json` (open it in the app), `build-bom.txt`, `build-print.txt` and `build-verify.txt`.
- **Vision judge** (`bench/judge.mjs`). For concepts it also gets the assembly tree (part names by subassembly) and `render-internals-iso` (outer shells hidden), so it can credit mechanisms behind covers.
- **Vision judge details:** headless Claude Code with only the Read tool grades the renders on a fixed 0–10 rubric. Replicas are graded against the photos (proportions, shapes, structure, details, overall); concepts against the brief (brief, engineering, cad, design, overall). It lists the five biggest problems, and runs after every benchmark run (`--no-judge` skips it).
- **Run:** `node bench/fetch.mjs <robot>` once, then `node bench/run.mjs <robot> --port 519x --run <name>`. Each run starts its own Vite server and headless Chrome (playwright-core) and sends the robot's photos to Claude Code through the real app. It saves `agent.stl`, `parts.json`, renders and `overlay.png` to `bench/runs/<name>/<robot>/`.
  - Give each concurrent run its own free port. The harness refuses to use a busy one.
  - Each run works on a snapshot copy of the app in the temp folder, with `node_modules` linked. Edits made during a run can't hot-reload into it, and its chats and images stay out of `library/`.
- **Score** (0–100):
  - 4/9 mean silhouette IoU (front, side, top), at the best of 4 yaw turns (all 24 orientations for single parts).
  - 5/18 Chamfer distance relative to 10% of height.
  - 1/6 height ratio.
  - 1/9 width and depth proportions, on robust 0.5–99.5% surface extents.
  - Part count is reported but not scored: URDFs merge each link into one mesh, so matching their count would punish real fasteners and catalog parts.
- **Replay:** `node bench/replay.mjs <run> <robot> [--views …] [--only "a,b;c"] [--keep]` rebuilds a run's final model from its tool calls, recompiling each part. It renders the model (optionally subsets of parts, for bisecting visual artefacts) and saves `fit.json` and `parts.json`. `--chat <conversation.json> --stop-at N` replays a saved chat up to its Nth tool call (subagents included), `--stop-at-call N` a run, and `--scene <start.json>` starts from a saved scene; it always writes `scene.json`.
- **Archive:** every run writes `scene.json`, `summary.json` (with `metrics`: seconds, cost, tokens, tool calls by name, from `events.jsonl` and the ACP prompt `usage`) and the judge's cost, and appends a line to `bench/runs/index.jsonl`. `node bench/report.mjs --index` lists runs by date, commit and cost.
- **Weekly:** `node bench/weekly.mjs [--robots a,b] [--concurrency 3] [--dry]` runs the whole bench and writes `bench/runs/weekly-<date>/report.md`.
- **Micro-evals** (`bench/micro/`): each task is a fixture built in code, one instruction and a code grader; 29 tasks from real design critiques and planted faults (assembly, service, cost, check integrity, craft, mirroring), 10 held out. `node bench/micro/run.mjs [--tasks A1,A2] [--seeds 3] [--tune]` runs them live (mean, pass^k, cost, time); never tune on `--heldout`. `node bench/micro/dry-run.mjs` grades start scenes and known fixes without an agent and must print “All graders behaved”. Graders call the app's checks through `adapters.mjs` / `appAdapters.mjs` (`check_assembly`, `craft`, `bom`, `size_actuators` data); a check with no data reports “unavailable”, never a pass. `node bench/micro/from-critique.mjs --chat <conversation.json> --message N` turns a critique into a task stub.
- **Pairwise judge:** `node bench/pairwise.mjs pair|judge|agree|rank|runs` asks twice with the order swapped, allows Unknown, keeps a verdict only when both orders agree, ranks with Bradley–Terry, and reports agreement with the user's labels (one JSONL line per pair: `{"id","a","b","winner":"a|b|tie|unknown","aspect","items":{"a","b"}}`). It replaces 0–10 scores for comparisons.
- **Lessons:** `node bench/playbook.mjs add --title … --lesson … --evidence <run>/<robot>` appends to `docs/Lessons playbook.md`. Append only; supersede, never edit.
- **Compare:** `node bench/report.mjs [runs…]`. After changing the scorer, run `node bench/rescore.mjs <run…>` so old runs use the same metric. `node bench/joints.mjs <urdf>` prints a URDF's zero-pose joint positions.
- `bench/data/` and `bench/runs/` are git-ignored, since they hold downloaded meshes and results.
- **Results** (current scorer; runs vary about ±3 points):

  | Robot | r1 baseline | r3 / r4 |
  |---|---|---|
  | Berkeley Humanoid | 63.9 | 81.8 / 77.7 |
  | Reachy Mini | 75.2 | 78.7 / 76.9 |
  | Open Duck Mini v2 | 68.8 | 73.9 / 75.8 |

  Silhouette IoU is 0.70–0.85 and Chamfer distance 1.3–2.2% of height.

  Harder tasks: Unitree G1 runs photos only; Memo (retired) has no public CAD; the two concepts are text-only. The vision judge varies about ±4 between runs.

  | Task | Metric | r5 baseline | r7 | r8 | r9 |
  |---|---|---|---|---|---|
  | Unitree G1 | geometry score | 62.3 | 80.6 | 73.0 | 86.7 |
  | Unitree G1 | judge | 56 | 60 | 64 | 56 |
  | Memo (retired) | front drawing IoU | 0.845 | 0.818 | 0.771 | 0.844 |
  | Memo (retired) | judge | 56 | 64 | 62 | 64 |
  | Concept: home helper | judge | 56 | 62 | 70 | 64 |
  | Concept: desk biped | judge | 62 | 60 | 64 | 66 |

  Rounds 12–20, nine runs each (current scorer; Memo is drawing IoU × 100; concepts are the judge score):

  | Task | Best | Mean | Worst |
  |---|---|---|---|
  | Dynamixel XL430 (part) | 91.9 | 90.3 | 89.4 |
  | Luxonis OAK-1 (part) | 90.8 | 87.4 | 85.8 |
  | Berkeley Humanoid | 88.5 | 82.7 | 71.5 |
  | Reachy Mini | 86.4 | 79.9 | 73.0 |
  | Unitree G1 (photos only) | 84.4 | 76.9 | 43.1 |
  | Open Duck Mini | 77.9 | 73.8 | 66.9 |
  | Memo (retired, drawing IoU) | 87.2 | 85.6 | 82.5 |
  | Concept: home helper | 66.7 | 62.0 | 53.3 |
  | Concept: desk biped | 66.7 | 65.2 | 63.3 |

  Known limits:
  - Run-to-run spread is 10–40 points on robots. It's driven by the agent's choices (pose, photo reading, whether research finds the URDF) more than by tools.
  - Memo's front photo is a perspective render with the hands angled, while the held-out drawing is orthographic. Matching the photo exactly (r20, every band within 10%) lowered the drawing IoU, so that task had a ceiling near 0.87 with those inputs. The same holds for any task scored against an orthographic drawing from perspective photos.
  - Concept scores depend on a strict judge. 9/10 means production-grade design and engineering.

  What each round changed:
  - **r7:** photo reading, `compare` and the proportion table.
  - **r8:** shape recipes and the mechanism checklist.
  - **r9:** the numeric profile in `compare`, the explicit neutral pose and the real-parts catalog. Most of the remaining gap is shell shape (head heights) and the part-count term, since reference URDFs count every mesh.
- **Lessons so far:**
  - Build in the neutral home pose: URDFs and CAD assemblies are drawn with every joint at zero.
  - For open-source robots, read the published robot description with `robot_skeleton`. WebFetch summarizes pages and loses exact numbers.
  - Score sizes on robust surface extents (0.5–99.5 percentiles), so thin antennas and cables don't dominate.
  - The agent must see the reference next to its own render (`compare`). From memory it misreads shadows as geometry, puts features on the wrong part, and drifts on relative sizes such as base vs column.
  - A proportion table per subassembly (z range and width as fractions of height) before the block-out fixes most layout errors on robots with no published CAD.
  - Proportions come right before shapes do. The prompt's shape recipes (tapered `prismoid`, front/side silhouette intersection, replicad lofts, ellipsoid heads) are how shells stop looking like boxes.
  - Prompt examples leak into results. A servo-housing example made the agent add vents and a split housing to the XL430 that the real part doesn't have. Keep examples on unrelated objects, and require a feature inventory from the references: model what's there and nothing else.
  - Every code example in the prompt must compile exactly as written (extract and run it). This has caught the replicad XZ-plane sign trap, a silently empty spline boolean at certain point counts, and `shell()` failing silently on spline bodies.
  - Test new tools against a real headless snapshot, not hand-made fixtures. In round 9, a fixture with an extra `size` field hid a crash in `compare`.
  - New designs are judged on whether mechanisms are visible and credible: an actuator per DOF, a lift with rails and a carriage, visible wheels, a stability check, and somewhere for the electronics to live.
  - Benchmark hygiene:
    - Run each benchmark from an app snapshot.
    - Preflight the CAD kernel, since a sandbox path error silently turns every part into a block.
    - Never compare runs scored by different metric versions.
  - Compare block-out bounds with ratios measured in the photos before adding detail.

---

## 10. Annotations (comments in 3D)

- **Comment tool (M):**
  - Click a part or the floor to drop a pin.
  - Pins attached to a part follow it (`partId` + `offset`).
  - Pins are Figma-style speech-bubble markers, numbered by creation. On hover they expand to preview the first comment.
- **Thread card (glass):** header `#n on Part`, then Resolve, Delete thread, Close. Comments can be edited (marked “edited”) or deleted. Reply composer at the bottom.
- **Deleting** a thread or a comment asks first in a `ConfirmDialog` (“Delete thread #2?” with its comment count, or “Delete comment?” quoting it). Deleting a thread still toasts with Undo.
- **Persistence:** resolved threads are hidden on the canvas but still listed in Inspect → Comments. Annotations save with the scene and appear in `DESIGN_BRIEF.md` (§4) and `design-spec.json`.

---

## 11. Menus, Palette & Shortcuts

- **Right-click (`ContextMenu` primitive):**
  - **Part:** Duplicate, Save to Library, Comment Here, Measure From Here, Align ▸, Drop to Floor, Stack, Reset Rotation, Zoom, Solid/Cutout/Guide, Subtract Overlapping Cutouts, Ungroup, Select All, Lock, Hide, Delete.
  - **Several parts** (right-click inside the selection keeps it): Union, Subtract from {first}, Intersect, Align ▸, Drop to Floor, Solid/Cutout/Guide (checked only when all match; reference photos keep their role), Group/Ungroup, Duplicate, Select All, Save to Library, Delete.
  - Submenus (`submenu` entries) open on hover, flip left near the window edge, and can hold custom content.
  - **Empty canvas:** Add Part, Comment Here, Measure From Here, Add Reference Image, Sketch, Annotate, Clear Marks (with marks), Import SVG, Select All, camera views, Reset View, Show Grid, Save Scene, Export STL.
  - Select All (⌘A) is in every menu. Like ⌘A and ⌘K, it skips hidden parts and hidden reference photos.
  - Right-drag and two-finger press-drag pans never open the menu. macOS fires `contextmenu` on press, so the canvas menu opens on release, and only if the pointer moved 5px or less (`menuPressRef`). Windows' release-then-`contextmenu` order is handled the same way. A two-finger tap within 400ms of a wheel event (scroll, pinch or momentum) is ignored too (`TRACKPAD_TAP_GRACE_MS`). Scrolling closes an open menu.
- **⌘K command palette:** every part, model, tool, view and scene action.
- **Shortcuts:**
  - Tools: V/E/R/C/M, D measure, N annotate, A shapes. P opens the Pose tab.
  - Placement and view: F floor, S stack, Z zoom, 1–4 views.
  - Edit: ⌘Z / ⇧⌘Z, ⌘C / ⌘X / ⌘V, ⌘D, ⌫, ⌘A select all, ⌘G / ⇧⌘G group, Esc (closes draft → thread → comment mode → measurement → Measure tool → selection).
  - App: ⌘S Save Scene, ⌘F Find Parts, ⌘P Print (Lay Out Plates), ⌘, Settings, ⌘B / ⌘I panels, ? Settings → Shortcuts.
  - Scenes: ⌘T new, ⌘W close, ⇧⌘T reopen, ⌃Tab / ⇧⌘] next, ⌃⇧Tab / ⇧⌘[ previous, ⌘1–⌘9 (§5a).
  - **Copy, cut and paste** work on the clipboard events (the Edit menu's native roles, so text fields keep native editing). Copied parts live in memory, shared by every tab; the system clipboard holds only a marker type (`application/x-basecase-parts`), so ⌘V pastes parts only while nothing newer was copied, and a pasted image still becomes a reference plane. Pastes keep names, get new ids and groups, and drop `jointId`. In the same scene each paste steps 15 mm (like Duplicate); after a cut or in another scene the first paste lands in place. Cut reads “Cut ⟨name⟩ · Undo”.
  - Every new command gets a palette entry, and a tooltip shortcut when it has one.

---

## 12. 3D Canvas

- Background `#1b1b1b` (the canvas card) with a soft CSS vignette.
- **Lighting:** a `RoomEnvironment` environment map (intensity 0.5, like the Parts thumbnails), a hemisphere light, the shadow-casting key light, a cool rim light, and a soft fill that follows the camera. Dark plastic reads through its reflections, so don't remove the environment map.
  - Near-black part colors render no darker than HSL lightness 0.13 (about `#212121`; `displayColor` in `three/buildPartMesh.ts`). Maker CAD often paints black plastic `#020202` (the STS3215), which no light can show.
- **Infinite grid** (`three/infiniteGrid.ts`): a camera-following shader plane on y = 0, not a fixed `GridHelper`.
  - 1 / 10 / 100 / 1000 mm lines fade in and out by on-screen density, so there's no moiré when zoomed out or at grazing angles.
  - The red X and blue Z axes run forever, and the grid fades into the distance (the fade distance scales with zoom).
  - `toneMapped: false` keeps line contrast exact; lines sit about 15–25 levels above the background, and the axes are brighter.
- Edges: Figma blue `#0d99ff` for selection, red `#ef4444` for cutouts.
- **Selection outline** (`three/viewport/selectionOutline.ts`): selected parts also get a 2.5px Figma-blue outline around their combined silhouette, drawn over everything (so a part inside a shell still shows), and around a multi-selection or group as one shape. Before each render the selected meshes are drawn into a 4× MSAA single-channel mask (camera layer 7, override material), then a quad in `stage.overlays` (so captures never show it), covering only the selection's screen rectangle, dilates the mask. Nothing is rebuilt; with no selection the pass is skipped.
- Catalog components (manufacturer meshes) and hardware (fasteners) draw their edge lines only when selected or set as a cutout. Unselected, their dense feature edges showed through enclosing shells as dark specks; the judge read those as overlapping geometry.
- B-rep edges are drawn only at creases (over 20° between the faces on each side). Smooth seams from lofts, splines and tangent fillets aren't outlined, so lofted shells don't get contour stripes.
- The directional light's shadow `normalBias` scales with the shadow frustum (about 1.5 shadow-map texels), so large robots don't get shadow-acne specks.
- Solid part faces use a small polygon offset, so edge lines always draw cleanly on top. Without it, outlines lying on another surface (a flush panel, a coincident face) flicker as dark speckles.
- Gestures: two-finger orbit (or pan), Space-drag pan, pinch zoom, gizmo drag.
- **Cursors** (`CURSORS` in `src/design-system/cursors.ts`, Figma-style): the canvas has its own arrow (near-black, white 1.5px stroke, every corner rounded, soft shadow), the same shape as the blue `AgentCursor`, so the two read as a pair. Comment mode shows a bubble in the pin's shape and the arrow's colors; its tip corner is where the pin's corner lands. Sculpt shows an outlined crosshair. Space-pan keeps the system grab hands.
  - They're CSS cursors drawn by the OS (never a DOM element following the pointer), so they never lag. Each is a 32 × 32 px SVG shipped at 2x in `image-set()` for Retina, with its hotspot on the exact pixel the tip shows (the arrow's stroke tip at (3, 3)).
  - The canvas element inherits its wrapper's cursor (`.canvas-cursor > canvas` in `index.css`), because three.js controls write `cursor: auto` onto the canvas. Comment pins use the arrow too.
- **Zoom range** 25 mm – 12 m camera distance (`MIN_DIST` / `MAX_DIST` in `three/viewport/types.ts`), enough for humanoids.
  - The far plane is 80 m, and the near plane scales with distance.
  - Grid fade, shadow plane and the directional light's shadow frustum all follow the camera distance.
- **The camera can go under the floor** to inspect undersides: orbit (drag and two-finger scroll) is limited only near the poles (`MIN_POLAR` / `MAX_POLAR` in `three/viewport/types.ts`). From below, the grid draws at 60% strength (it never writes depth, so parts on the floor show through it without z-fighting), and the shadow plane faces up, so it's culled and never hides parts.
- **Shift while using the gizmo** turns off grid, angle and scale snapping for smooth motion. A “Snapping off” glass chip shows while dragging. Commits keep 0.1 mm / 0.1° precision instead of rounding to 0.5 mm / 1°. Shift-dragging a gizmo handle never starts a box select (`transformControls.axis` check).

---

## 13. Functional Invariants (never break these)

1. CSG booleans: Union, Subtract (cutouts) and Intersect.
2. Exact parts only in Parts: real components (servos, motors, boards, sensors, cameras), ISO hardware (screws, nuts, washers, inserts, standoffs, pins, bearings) and basic shapes. Estimated stand-ins (generic servo, board, bracket, wheel, gripper…) aren't listed but still render in old scenes and as agent block-outs.
3. Vertex sculpting with brush size and strength (behind the Sculpt tool setting).
4. Binary STL export and SVG-to-3D extrusion import.
5. AI workspace sync: scene, part dimensions, annotations and markdown brief saved to `ai-reference/` and `library/`.
6. Vite ignores `library/` and `ai-reference/` (`server.watch.ignored`), so saving never reloads the page.

---

## 14. Shared Design System (`src/design-system`)

Use these primitives. Never hand-roll a styled `<button>` or input when one fits.

- `Button` (primary, secondary, ghost, danger, contrast; xs/sm/md; optional `title` + `shortcut` tooltip)
- `IconButton` (required `title`, `shortcut`, `isActive` solid accent, `isToggled` soft fill; xs/sm/md/lg)
- `Tooltip` (portal, 500ms delay, instant while “warm”), `Kbd`. A tooltip never shows while the popover its trigger controls is open: give every popover or menu trigger `aria-expanded={open}` (and `aria-haspopup="menu"` for menus), and `Tooltip` stays hidden while it's true. Don't hand-roll `disabled={open}` or drop the title instead.
- `NumberInput` (scrub, math, live/commit), `Slider` (double-click resets; `stacked` puts label and value above a full-width track), `Switch`, `TextInput` (`bare` for inline rename), `TextArea`, `Select`
- `SearchField`: the search at the top of a sidebar view. 40px tall, 10px corners, 14px text, a 16px glass icon; the whole field is the click target. `onBack` swaps the glass icon for a Back button in the same spot (the text doesn't move), for drilled-in views. Idle it shows its shortcut as key caps on the right (hidden on focus); with a query, a round clear button takes that spot. Focus is a 1px blue ring with a soft 3px blue halo. Use it for any list-filtering search; keep `TextInput` for form fields.
- `ColorField`: swatch + hex field. The picker opens beside the inspector with a saturation/brightness square, hue strip, hex input, eyedropper (`EyeDropper` API) and “In this scene” colors. Never list fixed swatch rows. `ColorPickerPopover` is the same picker on its own anchor (`side: 'top'` opens it above a floating bar, as the marks pill's Custom color does).
- `SegmentedControl` (sliding thumb, `tone: 'danger'`) for choices inside content, `ChoiceGrid` for a choice from a list that wraps (sizes, finishes, drives; `stacked` puts an icon over the label) on the same soft track and thumb (`CHOICE_TRACK`, `choiceCellClass` in `choiceStyles.ts` for hand-built strips), `PanelTabs` for a card's views (quiet labels, the current one on a soft pill; content-sized; when they don't fit they scroll sideways (the wheel scrolls too) with a 24px edge fade only while tabs are hidden past it, and the current tab scrolls into view clear of the fade; a tab's `menu`, while it's the current tab, widens its pill on hover as a chevron fades in, and a click anywhere on the pill opens it; for optical balance its right padding is 11px, selected or not, and 7px with the chevron, whose glyph carries 3px of air), `AgentSpinner` (a white `textPrimary` ring; `color` tints it), `Section` (hairline; collapsible with a chevron at the right, styled like the header actions: down when collapsed, up when open), `SectionHeader`
- `Divider`: full-width hairline that cancels the container's `--pad-x` (§4)
- `MetaLine` (`items`, falsy ones skipped): a line of facts separated by 12px of space, never a glyph (§3b-16). The last item truncates. `SpecText` (`components/PartDetails.tsx`) renders a `SpecValue` list one fact per line.
- `FloatingIsland` + `IslandDivider`, `PopoverMenu` + `MenuItem` (`detail`: muted text on the right) / `MenuLabel` / `MenuDivider`, `ContextMenu` (at least 210px, grows to fit its longest label + shortcut, up to 280px)
- `CURSORS` (`cursors.ts`): the canvas cursors (§12); `ARROW_PATH` is shared with `AgentCursor`.
- **Icons** are all our own (no icon dependency). Every one draws through `Glyph` (`glyph.tsx`): its strokes go into a mask and one `currentColor` rect is painted through it, so overlapping strokes never double up at translucent colours. Each takes `className`, `style` and `strokeWidth` (2 by default; Plus, Close and the chevrons are drawn at 2.5 through their spec's `weight`, since thin small controls read too light).
  - The UI library (`glyphs/`, about 100: `PlusIcon`, `CloseIcon`, `ChevronDownIcon`, `MoveIcon`, `SettingsIcon`, `UnionIcon`…) is generated from `tools/icons/library.mjs` by `npm run icons`; edit the drawings there, never the generated files. `node tools/icons/sheet.mjs <out.png>` renders the whole set.
  - View icons (`icons.tsx`): `PartsIcon`, `RobotsIcon`, `ObjectsIcon` (a bottle), `LibraryIcon`, `LayersIcon`, each `{ filled?, className? }` (outline idle, filled active); `DriveIcon` (`{ drive }`: a screw head with its solid Hex, Torx, Phillips, Pozidriv or slot recess; one state). Agent feed glyphs (`toolIcons.tsx`, one path each so they stay clean at `white/45`): `ShapeIcon`, `EditIcon`, `DeleteIcon`, `CodeIcon`, `LookIcon`, `CompareIcon`, `CheckIcon`, `SearchIcon`, `WebIcon`, `FileIcon`, `PhotoIcon`, `JointsIcon`, `PoseIcon`, `RunIcon`, `TrainIcon`, `ToolIcon`, `ThoughtIcon`. The UI reuses them where the idea is the same (`SearchIcon`, `LookIcon` for show, `DeleteIcon`, `EditIcon` for rename, `PhotoIcon`, `RunIcon` for play, `PoseIcon`). New icons follow the `icon-design` skill.
- `SpecRow` (`components/PartDetails.tsx`): the part page's label-left, value-right row (13px); used by part pages and `HardwareSpecs`.
- `SceneTabs` (`src/components`): the scene tab strip (§5a)
- `ExportMenu` (`src/components`): the title bar's Export button and its format menu.
  - `PopoverMenu` anchors to its parent (the trigger's `relative` wrapper) but renders in a portal with fixed positioning, so docked panels with `overflow-hidden` never clip it. It flips to the other side when its preferred side has no room, stays 8px inside the window, and follows the trigger on resize and scroll.
- `Modal` (portal sheet; `headerActions` sit before Close), `ConfirmDialog` (a small `Modal` with Cancel and a danger action, focused so Enter confirms), `Toast` (with action), `EmptyState`, `Badge`
  - While any modal is open (`isModalOpen()`: an `aria-modal` element in the page), canvas shortcuts don't run and clicks don't dismiss what's under it (the comment card).
- `CodeBlock`: code with syntax colours (`utils/highlight.ts`: OpenSCAD, JavaScript/replicad, Python, shell; Xcode dark palette), Copy and Expand on hover; Expand opens the code in a wide `Modal` with line numbers and Copy. `Markdown` renders fenced code with it.
- `HoverCard`: rich details on hover (450ms delay; neighbours wait 220ms while warm so you can cross a tile to reach the card's links). `beside="aside"` opens it next to the panel instead of over the grid. It slides in from the panel (`animate-card-in`), is 320px wide, unpadded (content pads itself) and never taller than the window.
  - The Parts card (`CatalogDetails`): spotlight hero with a badge for where the model came from (maker CAD, from the drawing, ISO dimensions), name, maker and part number (a `MetaLine`), a two-line description, a Size headline plus four spec tiles (`Stat`), and a footer with Buy on Amazon and icon links. Mounting stays on the part page.
- `useScrollFade(px?, axis?)`: returns `{ ref, style }` for a scroll container; fades top and bottom (left and right with `axis: 'x'`) only while content is hidden past them.
- Thumbnails (`three/partThumbnails.ts`) render at 480 × 360 with a studio environment map, so metals read on dark tiles; dark parts get more exposure.
- `ImageViewer`: full-window image viewer. Pinch or ⌘-scroll zooms at the pointer, two-finger scroll and drag pan, double-click toggles fit / 100%+, − + 0 keys, ← → and a filmstrip for several images, Esc or a backdrop click closes. Controls float in glass islands.
- Tokens in `theme.ts` (`THEME_COLORS`, `LAYOUT`, `DRAG_REGION`, `NO_DRAG_REGION`) mirror the `@theme` block in `index.css`.

---

## 15. Verification Checklist

- [ ] `npm run check` passes (format, ESLint, Ruff, types, tests) and `npm run build` succeeds.
- [ ] `npm run test:e2e` passes after UI or viewport changes.
- [ ] Visual changes: don't start dev servers, previews or screenshots to check how they look. A maintainer runs the app and reviews the UI; say the change is done and what to look at, and they'll say if it needs work.
- [ ] Nothing in §0f regressed (no full-scene rebuilds, no always-on render loop, no large IPC payloads).
- [ ] Stoplights, title bar controls and tabs all center on y = 22, 8px from the top and from the cards; cards keep 8px gaps, 12px corners and 12px content insets (§2).
- [ ] No fake stoplights or slogans. Every new or changed string passes the copy checklist (§3d): nothing repeats what the UI already shows, nothing is named by its absence, no “yet”.
- [ ] Text and controls meet the §4 minimums (nothing smaller than 12px except key caps).
- [ ] Floating surfaces are matte (solid fill + shadow, no blur or highlight); cards and chrome are solid (chrome slightly translucent only via Electron vibrancy).
- [ ] Rail icons center under the close button (x = 26); card header rows center on y = 66 with the first rail icon.
- [ ] Greys are neutral (no blue tint); no outlines on cards and no line under card headers (dividers inside panels are fine).
- [ ] Dividers run edge to edge of their container (`Divider` / `MenuDivider`, never an inset `mx-*` hairline).
- [ ] New UI uses `src/design-system`, has tooltips with shortcuts, and appears in ⌘K when it’s a command.
- [ ] Update this file whenever a new UI pattern or copy convention is adopted.
