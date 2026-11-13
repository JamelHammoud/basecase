# AGENTS.md — Basecase contributor guide

**Basecase** is a 3D robotics CAD studio with an AI agent. This file is the rulebook for every contributor, human or agent, whatever model or tool they use. It holds the rules that apply to **every** change; each area's detail lives in a guide under [`docs/guide/`](docs/guide/), listed in the index below.

**Rules live in this repo, nowhere else.** When a maintainer gives a lasting rule or preference (how something should look, behave, be named, be committed), write it here or in the guide for its area, in the same change. Never keep it only in an agent's private memory, a chat or a tool-specific file: the next contributor, on another model, never sees those.

**Before you change an area, read its guide. When you change how it works, update that guide in the same change.** A guide, brief or prompt says only what the code does once that change lands: never a lane, file or step another pull request will add. Work that only makes sense together lands as one pull request. Code folders carry a short `AGENTS.md` that names their guides (`electron/`, `src/three/`, `src/components/`…); agents load the nearest one on their own, so add one when a new area grows.

**Keep this file a map.** It's loaded into every agent session: under 200 lines and 32 KiB (Codex stops reading there), checked by `npm run check:docs`. Area detail goes in its guide; add here only what applies to every change. Write rules plainly, without IMPORTANT or capitals, and only what the code can't tell; a rule that must never bend becomes a lint, hook or test. Why it's laid out this way: [Agent instructions](docs/research/Agent%20instructions.md).

**Writing any code?** Follow §0. It's mandatory, and the tooling enforces it: `npm run check:changed -- <your files>` must pass before you finish. Test only your change: never run the whole suite (`npm run check`, `npm test`) for one change; CI runs it on every push (§0a). Throwaway scripts, debug tests and local outputs go in the gitignored `scratch/` folder, never in `src/` (§0g).

**Writing any user-facing text** (labels, buttons, headers, captions, empty states, toasts, errors, tooltips, agent-facing UI)? Follow [Copy](docs/guide/copy.md) (§3), and run its checklist (§3d, repeated below) on every string you add or change.

**Adding a part** (a servo, board, sensor or any product, often from an Amazon or store link)? Follow [.agents/skills/add-part/SKILL.md](.agents/skills/add-part/SKILL.md) step by step, whichever agent you are.

**Security audit, vulnerable package or toolchain update?** Follow [.agents/skills/security-audit/SKILL.md](.agents/skills/security-audit/SKILL.md) (`npm run security` scans). Code that touches IPC, the HTTP bridge, file ids, outbound fetches or the CAD kernel follows [Security](docs/guide/security.md) (§0h).

## Guide index

| § | Guide | Read it before you touch |
|---|---|---|
| 0d, 0e | [Running and testing](docs/guide/running-and-testing.md) | `npm start` / `electron:dev`, the app origin, the web demo and landing, tests, perf benches, e2e |
| 0f | [Performance](docs/guide/performance.md) | the viewport, part meshes, batching, workers, captures, autosave, boot |
| 0h | [Security](docs/guide/security.md) | IPC, the HTTP bridge, file ids, outbound fetches, the CAD kernel sandbox, generated HTML |
| 0i | [Releases and updates](docs/guide/releases.md) | the release workflow, signing, betas, the updater, packaging, agent CLI downloads |
| 0j | [Windows](docs/guide/windows.md) | spawning, paths, signals, anything OS-specific |
| 2 | [Window framing](docs/guide/window-chrome.md) | the title bar, view rail, card grid, vibrancy, boot screen, app icon, menu bar |
| 3 | [Copy](docs/guide/copy.md) | any user-facing text |
| 4 | [Visual system](docs/guide/visual-system.md) | type, sizes, radii, surfaces, dividers, motion, hover controls, loading, scrollbars |
| 5 | [Layout and sidebar views](docs/guide/layout.md) | the side panels, Parts, Robots, Objects, Layers, Library, panel resizing |
| 5a | [Scene tabs](docs/guide/scene-tabs.md) | tabs, opening and closing scenes, `.basecase` files |
| 6, 6a | [Toolbar and Settings](docs/guide/toolbar-and-settings.md) | the bottom toolbar, Measure, Annotate, Settings panes |
| 7–8 | [Inspector and selection](docs/guide/inspector-and-selection.md) | the Inspector, selection, groups, booleans, drag and drop, reference images, Sculpt / Sketch / Import SVG |
| 8a | [Parts catalog](docs/guide/parts-catalog.md) | real components, meshes, the parts pipeline, parts the agent sources |
| 8b | [Build](docs/guide/build.md) | Checks, BOM, prices, currency, printability, engineering checks, the build guide |
| 8c | [Joints and motion](docs/guide/joints-and-motion.md) | joints, kinematics, the Pose tab, animation, robot import, mocap |
| 8d | [Simulate and train](docs/guide/simulate.md) | MuJoCo, the MJCF writer, training, policies |
| 8e | [SimReady](docs/guide/simready.md) | SimReady search, the converter, textures |
| 8f | [Printing](docs/guide/printing.md) | printers, plates, 3MF, slicing, sending, Print mode |
| 8g | [Forge](docs/guide/forge.md) | `forge/`, the native trainer, our batched physics, parity with C MuJoCo |
| 8h | [Cases](docs/guide/cases.md) | `src/cases/`, worlds, robot slots, live driving, recording, datasets (`src/datasets/`), the gallery |
| 8i | [Skills](docs/guide/skills.md) | `src/skills/`, task contracts, the solver race, Arena, Motor Kit |
| 8j | [Routines](docs/guide/routines.md) | `src/routines/`, the coordinator, ML nodes, scenario tests |
| 8l | [Cameras](docs/guide/cameras.md) | `src/cameras/`, camera parts and lenses, stationary camera views, live views, fisheye, the agent's `operate`, the depth eye |
| 8k | [Robot runtime](docs/guide/robot-runtime.md) | `hw/`, the daemon, servo emulators, the motor lock, calibration (`src/reality/`) |
| 0k | [Proof](docs/guide/proof.md) | `verify/`, Gatekeeper, gates, the hidden twin, the Stage 8 session |
| 0l | [Loop](docs/guide/loop.md) | `tools/loop/`, how agents open, review and merge pull requests, CI repair, nightly releases |
| 9 | [Agent](docs/guide/agent.md) | the ACP agent, its profiles, lanes, CAD tools and kernel, the agent panel and composer |
| — | [Benchmark](docs/guide/bench.md) | `bench/`, scoring, micro-evals |
| 10 | [Annotations](docs/guide/annotations.md) | comments in 3D |
| 11 | [Menus and shortcuts](docs/guide/menus-and-shortcuts.md) | right-click menus, ⌘K, shortcuts, copy and paste |
| 12 | [3D canvas](docs/guide/canvas.md) | lighting, the grid, edges, selection outline, cursors, zoom, gizmo |
| 14 | [Design system](docs/guide/design-system.md) | `src/design-system` primitives and icons |

Plans and research live beside them in `docs/` ([Robotics loop](docs/Robotics%20loop.md), [Performance plan](docs/Performance%20plan.md), [Print plan](docs/Print%20plan.md), [Windows plan](docs/Windows%20plan.md)); engineering facts kept from removed code comments are in `docs/notes/`.

## Working agreements

- **Hobby project.** Basecase is built by Jamel and friends, not a company. No legal, compliance or company concerns in plans, docs or copy. Pick the best tool for the job, whatever its licence.
- **Commits:** agents work in their own git worktree on a `loop/…` branch and open a pull request from Jamel's account; the review lane checks it and the merge lane lands it once `check` and `agent-review` pass ([Loop](docs/guide/loop.md), §0l). A maintainer's own session may also push to `main`. Read `git status` and the staged list first (§0g). Never credit an LLM or tool anywhere: no `Co-Authored-By` trailer for Claude, Codex, Gemini or any other model, no “Generated with” line, no bot author, in commits, pull requests or anywhere else. The `commit-msg` hook and Check's `credit` job reject them.
- **Several agents may share this checkout.** Before you edit or commit, check `git status` for changes that aren't yours, never overwrite or revert them, and commit only your own files and hunks.
- **Don't judge visual changes yourself.** Don't start dev servers, previews or screenshots to see how a change looks; run the checks (§15), say what changed and where to look, and a maintainer reviews it in the app. Make visual tweaks big enough to notice (a 2 → 2.25 stroke at 16px is invisible). CI may capture, assert geometry and diff pixels; none of that judges looks. Capturing screenshots for help articles and pull requests is fine (§0l); judging how they look isn't. During the robotics build, one maintainer visual review happens at Stage 8 (§0k).
- **Performance fixes never trade one problem for another.** Don't pause, throttle or defer loading to keep the UI smooth; move the work off the main thread or make it cheap (§0f).
- **Ready to build is a verdict, not an opinion.** Only Checks in the Build tab (§8b) say a design is ready; only the user can ignore a blocker. A problem someone finds by hand becomes a check and a seeded fault test. The catalog never limits a design: the agent sources what's missing, and the finished robot uses only referenceable parts.
- **Agent priorities** (the CAD agent's output, its prompt, tools, checks and the bench): designs that can actually be assembled and serviced come first, then cost-aware part choices, then parts that look expertly designed; silhouette and proportion scores matter less ([Agent](docs/guide/agent.md#priorities)).

## 0. Code Conventions (mandatory)

These rules hold for every human and agent, on every machine. They're enforced by tools, not memory: don't rely on yourself to follow them, run the tools.

### 0a. Tooling

- **Prettier** formats (`.prettierrc.json`: single quotes, 120 columns). **ESLint** (`eslint.config.mjs`) enforces everything else. Custom rules live in `tools/eslint/`.
- `npm run check` = `check:tracked` (§0g) + `check:docs` (this file's size, the guide index, links and § references in every `AGENTS.md` and guide) + `format:check` + `lint` + `lint:py` (Ruff, `ruff.toml`, run through `uvx`) + `typecheck` + `test`: the full run, which CI does on every push. For your own change run `npm run check:changed -- <files you changed>` (`tools/check-changed.mjs`, seconds): Prettier and ESLint on those files, Ruff on Python, `check:docs` when Markdown changed, `tsc -b` when TypeScript changed, and only the tests that import them (`vitest related`). Name your files: with none it takes everything `git diff HEAD` and untracked files show, other agents' work included. Run the full `npm run check` only when a maintainer asks or you change tooling, configs or dependencies, and never rerun a long suite to confirm a small change. `npm run lint:fix` and `npm run format` fix what they can. `npm run test:e2e` drives the real app headless (see §0e); run it after UI or viewport changes. `npm run security` (`tools/security/`) scans dependencies, Node, Electron, the Python locks, secrets and risky code, writes `scratch/security/<date>.md` and fails on any critical or high finding (§0h).
- **Node** is pinned in `.nvmrc` (CI reads it) and `engines.node`: the latest release of the active LTS. npm runs dependency install scripts only for packages approved in `allowScripts` (`npm install-scripts ls`).
- **Hooks run automatically:**
  - Git pre-commit (`simple-git-hooks` + `lint-staged`, installed by `npm install`): formats and lints staged files, then runs `check:tracked`; a commit with lint errors or internal files fails.
  - Claude Code (`.claude/settings.json` → `tools/hooks/claude-post-edit.mjs`): after every Edit/Write, the file is formatted and lint-fixed, and remaining errors come back to the agent. Fix them before moving on.
- **Agent-neutral layout.** This file is the instructions for every coding agent, and every contributor. Skills (step-by-step procedures in the Agent Skills format: a folder with `SKILL.md` and its scripts) live in `.agents/skills/`; `.claude/skills` is a symlink to it so Claude Code finds them. Put new skills there, never in a provider's folder. Provider folders (`.claude/`) hold only that provider's wiring (settings, hooks), and the scripts they run live in `tools/`.
- **No escape hatches.** Inline `eslint-disable` comments are ignored (`noInlineConfig`), and `@ts-ignore` / `@ts-expect-error` are comments, which are banned. Fix the code. Never loosen `eslint.config.mjs`, `tsconfig*.json` or the Prettier config to make something pass; changing a rule needs a maintainer's OK, and the change is recorded here.

### 0b. Rules (all errors)

| Rule | Limit | How to comply |
|---|---|---|
| No comments (`basecase/no-comments`) | none, except `@vite-ignore` / `#__PURE__` pragmas | Name things so the code reads on its own. Lasting context (why a value is what it is, platform quirks, bugs avoided) goes in the area's guide (`docs/guide/`) or `docs/notes/` (`ui.md`, `core.md`, `node.md`) |
| Banned copy (`basecase/copy`) | none in user-facing strings in `src/` and the app menu | Cut the word or the line (§3c); the list is `BANNED_COPY` in `verify/rehearsal/uiRules.ts`, linted through `tools/copy/banned.mjs` |
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

### 0g. What never gets committed

Anything that only serves this session or this machine stays out of git. Put it in a gitignored place from the start; don't create it in `src/` and plan to delete it later (a stray debug test once blocked a 400-file commit).

- **Scratch work goes in `scratch/`** (gitignored, skipped by ESLint and Prettier, not typechecked): debug tests, one-off scripts, probes, dumps, renders, notes. Import app code with relative paths (`../src/guide/guidePlan`). Run scratch tests with `npm run scratch` (`vitest.scratch.config.ts`; `npm run scratch -- scratch/foo.test.ts` for one); they're never part of `npm test`. Large or temporary outputs can also go in the system temp folder.
- **Internal notes go in `internal/`** (gitignored, skipped by ESLint and Prettier): research, plans, chat and session analyses, design explorations, anything written for the maintainers rather than for contributors. `docs/` holds only what a contributor needs: the guides (`docs/guide/`), the plans this file links to, `docs/notes/`, the lessons playbook, `docs/market/` (the market lane's research, read by the lead), and the research the code cites. If a doc in `docs/` cites something in `internal/`, move the source into `docs/` or drop the citation.
- **Local data stays where it is:** `library/` (scenes, chats, references, prices, agent config and keys), `ai-reference/`, `bench/data/` and `bench/runs/`, `tools/parts/cad/`, `tools/parts/generated/*.log`, `electron/trainer/.venv/`. Code and committed tests never read from `library/` or `ai-reference/`: a test that needs a scene builds its fixture in code, so it runs on a clean clone.
- **Never commit** secrets (`.env*`, API keys, tokens, `auth.json`), per-machine settings (`.claude/settings.local.json`, `.claude/launch.json`), caches (`__pycache__/`, `.ruff_cache/`, `node_modules/.cache/`), build output (`dist/`, `release/`, `electron/native/*/build/`), logs, stray tool outputs (`result.json` from the Bambu Studio CLI), or absolute paths to someone's home or temp folder (a record that points at a downloaded file stores its URL, not where it landed).
- **Deliberately committed outputs:** `public/parts/*.glb` and `tools/parts/generated/<id>/` (the part pipeline's results, §8a), `public/figures/*.glb` and `tools/figures/generated/<id>/` (the Measure tool's scale figures, §6), `build/icon/compiled/` and `build/icon/compiled-dev/`, `public/robots/*.webp`, `src/skills/contract.wasm` (`npm run build:contract`, §8i), `src/routines/coordinator.wasm` and `coordinator.build.json` (`npm run build:routines`, §8j), `src/routines/kit/` (Motor Kit policies with their manifest, §8j), `src/forge/forge.wasm` and `forge.build.json` (`npm run build:forge-web`, §8g), and help screenshots in `site/public/help/` (§0l).
- **`npm run check:tracked`** (`tools/check-tracked.mjs`, run by `check` and the pre-commit hook) fails on tracked files that `.gitignore` excludes (untrack them with `git rm --cached`) and on absolute paths into a home folder, `/private/tmp` or `/var/folders` in any tracked text file. Placeholder homes in tests (`me`, `user`, `name`, `example`, `runner`) are allowed.
- **Before committing**, read `git status` and the staged list (`git diff --cached --stat`). Anything not in the categories above that you didn't mean to write gets moved to `scratch/` or deleted. When a new tool writes local output, add its folder to `.gitignore` (and to the ESLint / Prettier ignores if it holds code) in the same change.

### 0d–0f, 0h–0j in brief

The full rules are in the guides; these are the ones every change must keep.

- **Run and test** ([guide](docs/guide/running-and-testing.md)): `npm start` runs the production bundle, `npm run electron:dev` hot-reloads. test your change with `npm run check:changed -- <files>`, never the whole suite; prefer integration tests on real pipelines; `npm run test:e2e` after UI or viewport changes; `npm run perf:agent` / `perf:viewport` after viewport, mesh, capture or agent-tool changes. A new bridge route needs a `ROUTES` entry in `webBackend.ts`, and desktop-only UI checks `IS_WEB_DEMO`.
- **Performance** ([guide](docs/guide/performance.md)): the app must feel instant. The viewport never rebuilds everything; parts are immutable (replace, never mutate). Heavy geometry, agent checks, captures, thumbnails and printing run in workers, never on the main thread. Render on demand, never an always-on `requestAnimationFrame`. Small payloads across IPC and HTTP. Profile anything over 16 ms in a production build.
- **Security** ([guide](docs/guide/security.md)): every `/api/*` middleware goes through `guardBridge`, IPC through `trustedIpc`; ids that become paths through `checkedFileId`; agent-controlled fetches through `publicFetch`; no `shell: true`, no `dangerouslySetInnerHTML`; every security fix gets an exploit test.
- **Windows** ([guide](docs/guide/windows.md)): every change keeps macOS and Windows 11 working. Never spawn `.cmd` / `.bat`; find tools with `findOnPath`; build paths with `path.join`; no signals on Windows (watch a stop file); open files with `openFile` or Electron's `shell`.
- **Releases** ([guide](docs/guide/releases.md)): Actions → Release with a version higher than the last; never a draft, never a stable version as a prerelease.

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

## UI rules every change keeps

The full system is in [Visual system](docs/guide/visual-system.md), [Copy](docs/guide/copy.md) and [Design system](docs/guide/design-system.md). These hold everywhere:

- **Hidden elements never push content.** Anything that shows only on hover, focus or a state (row actions, grips, badges) takes no space while hidden: overlay it (`absolute`), never reserve room with `opacity-0`. Row actions float over the row's right end on a gradient of the row's own fill (transparent → opaque over about 32px), so text runs the full width; an invisible control takes no clicks (`pointer-events-none` until shown).
- **Every delete asks first, except parts in the scene and Routine steps.** Deleting, removing or clearing anything a person made (marks, chats, library items, poses, policies, printers, queued messages…) opens a confirmation (`confirmAction` or `ConfirmDialog`, title “Delete ⟨name⟩?”, Cancel and Delete) before it happens; a toast with Undo may follow. Never delete on the first click, on double-click, or at once with only an Undo toast. Removing parts from the scene (⌫, Delete in the Inspector or right-click menu) is ordinary editing: it happens at once with a “Deleted ⟨name⟩” toast and Undo. So is removing a step from a Routine (⌫ or right-click Delete): at once, with a “Deleted ⟨step⟩” toast and Undo. Agent tools (`delete_parts`) and the Annotate eraser, whose whole job is erasing, don't ask.
- **Use `src/design-system`.** Never hand-roll a styled button or input when a primitive fits; a pattern used twice becomes a component there. Our own icons only (the `icon-design` skill for new ones), custom tooltips with shortcuts, and every command in ⌘K.
- **Comfortable, not compact:** nothing under 12px except key caps; inputs and menu items 32px. Neutral greys (R = G = B), surfaces separated by lightness, no outlines on cards, dividers edge to edge, one accent (`#0d99ff`), red only for cutouts and destructive actions. Floating surfaces are matte (solid fill + shadow, no blur).

### Copy checklist (§3d)

Run it on every string you add or change:

- [ ] Read it aloud. Could it lose a word, or a whole line?
- [ ] Does anything on screen already say this (a number, an icon, a state, the section title)? If so, delete it.
- [ ] Does it name a thing, or describe its absence? Name the thing.
- [ ] If it asks for work, does it start with the verb, and does clicking it help do the work?
- [ ] Is the most important word first?
- [ ] Same word as everywhere else for this thing? Right casing for this element (Title Case buttons and menu items, sentence case for the rest)?
- [ ] No banned words (“yet”, “please”, “Oops”, “Invalid…”; §3c) and no `·` or stand-in glyph between items (§3b-16)? `basecase/copy` lints both; the rest of §3c is yours to catch.

## 13. Functional Invariants (never break these)

1. CSG booleans: Union, Subtract (cutouts) and Intersect.
2. Exact parts only in Parts (parts the agent sources are listed too, marked Added by Agent, until promoted, §8a): real components (servos, motors, boards, sensors, cameras), ISO hardware (screws, nuts, washers, inserts, standoffs, pins, bearings) and basic shapes. Estimated stand-ins (generic servo, board, bracket, wheel, gripper…) aren't listed but still render in old scenes and as agent block-outs.
3. Vertex sculpting with brush size and strength (behind the Sculpt tool setting).
4. Binary STL export and SVG-to-3D extrusion import.
5. AI workspace sync: scene, part dimensions, annotations and markdown brief saved to `ai-reference/` and `library/`.
6. Vite ignores `library/` and `ai-reference/` (`server.watch.ignored`), so saving never reloads the page.

## 15. Verification Checklist

- [ ] `npm run check:changed -- <your files>` passes (format, ESLint, Ruff, types, related tests). The full `npm run check` and `npm run build` run in CI.
- [ ] Changes to IPC, the HTTP bridge, file ids, outbound fetches, the CAD kernel or dependencies follow §0h; `npm run security` reports no critical or high finding.
- [ ] `npm run test:e2e` passes after UI or viewport changes.
- [ ] Visual changes: no dev servers, previews or screenshots to check the look (see Working agreements); say what changed and what to look at.
- [ ] Nothing in §0f regressed (no full-scene rebuilds, no always-on render loop, no large IPC payloads).
- [ ] The window grid holds (§2): stoplights, title bar controls and tabs center on y = 22; cards keep 8px gaps, 12px corners and 12px content insets; rail icons center on x = 26 and card headers on y = 66.
- [ ] Every new or changed string passes the copy checklist above.
- [ ] The UI rules above hold: nothing hidden pushes content, deletes ask first, §4 minimums, neutral greys, matte floating surfaces, full-width dividers.
- [ ] New UI uses `src/design-system`, has tooltips with shortcuts, and appears in ⌘K when it's a command.
- [ ] The guide for every area you changed is updated, and any new lasting rule is written down here or in its guide.
