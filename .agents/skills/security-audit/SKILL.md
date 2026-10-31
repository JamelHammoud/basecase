---
name: security-audit
description: Audit Basecase for security problems and fix them — scan dependencies (npm, Electron, Node, the Python sidecars), secrets and risky code, update the toolchain to supported versions, review the app's attack surface (Vite HTTP bridge, Electron IPC, agent bridge, agent web tools, CAD kernel sandbox, renderer HTML), fix every critical and high finding, and verify. Use when someone asks for a security audit, scan, review or hardening pass, mentions a CVE, advisory, sev0 or vulnerable package, or asks to update packages, Node or Electron for security.
---

# Security audit

Basecase runs an AI agent that reads untrusted web pages and files, then drives a desktop app that can spawn processes and write to disk. So in this app a small bug becomes remote code execution. This skill is the whole pass: scan, update, review, fix, verify, report. Run it top to bottom; each step says what “done” looks like.

**Goal:** no critical or high finding left. Fix moderates when it's cheap, and list the rest as accepted risks with a reason.

## 0. Toolchain first

- `source ~/.nvm/nvm.sh && nvm use` (reads `.nvmrc`). In a tool shell that doesn't load nvm, put `~/.nvm/versions/node/v<version>/bin` first on `PATH` for every npm command.
- If `npm run security` says Node is missing security releases: `nvm install <latest of that major>`, then update `.nvmrc`, `engines.node` in `package.json` and nothing else (CI reads `.nvmrc`).
- If Node has a newer **LTS** major, move to it (same three places). Odd majors are never LTS.

Done when `node -v` matches `.nvmrc` and the scan's Node section is clean.

## 1. Scan

```bash
npm run security
```

The script is `tools/security/audit.mjs`. It writes `scratch/security/<date>.md` and `.json`, and exits 1 on any critical or high finding. `--only=npm,node,electron,python,secrets,code,outdated` runs a subset. The checks:

| Check | What it does |
|---|---|
| npm | `npm audit` over prod and dev dependencies, with the advisories and the fix npm proposes |
| node | Running Node against nodejs.org: end of life, missing security releases, behind the LTS. Also `.nvmrc`, `engines` and CI pins |
| electron | Installed Electron against the latest 3 majors (only those get fixes) and the latest patch of its major |
| python | `uv export` → `pip-audit` for `electron/trainer` and `electron/simready` |
| secrets | Key patterns (Anthropic, OpenAI, Google, GitHub, AWS, HF, Slack, Stripe, private keys) in tracked and unignored files, and secret files that aren't ignored. Uses `gitleaks` on git history when it's installed (`brew install gitleaks`) |
| code | Risky patterns: Electron hardening flags, `shell: true`, TLS off, unsafe deserialization, raw HTML sinks, `new Function`, `openExternal`, servers, tag-pinned GitHub Actions |
| outdated | `npm outdated`, majors flagged |

Read the whole report. `review` items aren't failures: each needs a look at whether its input can be attacker-controlled.

## 2. Update dependencies

Work in this order, and run `npm run check` after each group so a breaking upgrade is easy to find.

1. **In-range:** `npm update`.
2. **Electron:** always on a supported major: `npm install -D electron@<latest>`. The native addons are Node-API, so they need no rebuild. Read the breaking changes for each major you skip ([electronjs.org/docs/latest/breaking-changes](https://www.electronjs.org/docs/latest/breaking-changes)) and grep for the APIs they name.
3. **Transitive advisories:** `npm audit fix` (never `--force`: it downgrades). When a fix needs a newer major than a parent allows, add an `overrides` entry in `package.json` and prove the parent still works (lint, tests). `minimatch` is overridden to 11 for ESLint's chain.
4. **Majors of direct dependencies:** take them when the peers allow (`npm view <pkg>@latest peerDependencies`). Record any you skip and why. Current holds:
   - `typescript` stays on 6.x until `typescript-eslint` supports 7.
   - `@agentclientprotocol/sdk` stays on 1.x: 2.0 removed `ClientSideConnection` / `AgentSideConnection`, which `electron/backend/acpAgent.mjs` and `electron/acp-3d-agent.mjs` use. The agents' own 2.x copies are separate processes.
   - `@rolldown/plugin-babel` stays on 0.2 until `@vitejs/plugin-react` accepts 0.3.
   - `@babel/core` 8: test with the React Compiler before taking it.
5. **MuJoCo:** only `node tools/sim/update-mujoco.mjs [version]` (it keeps npm and Python in lockstep and runs the smoke test).
6. **Python:** `uv lock --upgrade` in `electron/trainer` and `electron/simready`. Raise a floor in `pyproject.toml` when an advisory needs it.
7. **Install scripts:** npm only runs dependency install scripts listed in `allowScripts` (`npm install-scripts ls`). Approve a new one only when the package can't work without it; deny native builds the app doesn't use (`node-pty`, `@github/keytar` come with Gemini CLI and aren't needed).
8. **CI:** `.github/workflows/check.yml` pins every action to a full commit SHA with the tag in a trailing note, uses `permissions: contents: read`, and runs `npm audit --audit-level=high`. To bump an action: `gh api repos/<owner>/<repo>/releases/latest --jq .tag_name`, then `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`.

Done when `npm audit` reports no high or critical, Electron is supported and current, and `npm run check` passes.

## 3. Review the attack surface

Dependency scans don't find bugs in our own code. Review each surface below, ideally with two parallel read-only reviewers (one for the main process and network, one for the renderer and sandboxes), giving each this list and the findings already known. Verify every claim they return before fixing it.

**Who attacks this app:**
- a website open in the user's browser while the app runs (`npm start` and dev serve on `localhost:5173`);
- a page, photo or file the agent reads (prompt injection steers the agent's tool calls);
- a downloaded asset (robot description, SimReady package, BVH, scene shared by someone);
- another process on the machine or the LAN.

**Surfaces and the rule each must follow:**

| Surface | Files | Rule |
|---|---|---|
| Vite HTTP bridge | `electron/vite-bridge-middleware.mjs`, `electron/bridgeGuard.mjs` | Every `/api/*` handler is wrapped in `guardBridge`: loopback `Host`, same-origin `Origin`, `Sec-Fetch-Site` same-origin or none. Plugin middlewares run **before** Vite's own host check and CORS, so Vite doesn't protect them |
| Electron window | `electron/main.mjs`, `electron/appOrigin.mjs` | `contextIsolation`, `sandbox`, no `nodeIntegration` or `webviewTag`. Navigation and redirects compare origins with `isAppUrl`, never `startsWith`. `openExternal` only for `isExternalWebUrl`. Permissions are denied except `clipboard-sanitized-write` and `fullscreen` |
| IPC | `electron/main.mjs` (`trustedIpc`), `electron/preload.cjs` | Handlers register through `trustedIpc`, which refuses frames from another origin or a subframe. Every handler treats its payload as untrusted |
| File ids from IPC or HTTP | `electron/backend/constants.mjs` (`checkedFileId`, `isSafeFileId`, `safeFileId`), `models.mjs`, `library/sceneLibrary.mjs`, `conversations.mjs`, `guidePdf.mjs` | Any id that becomes a path is checked first. `library/agent.json` holds the command the app spawns, so a write outside its folder is code execution |
| Agent bridge | `electron/backend/agentBridge.mjs` | 127.0.0.1, random token in the path, every route behind it |
| Agent web tools (SSRF) | `electron/publicFetch.mjs`, `electron/cad-mcp/shared.mjs`, `webTools.mjs`, `references.mjs`, `electron/robot-skeleton.mjs` | Outbound fetches driven by the agent go through `publicFetch` (DNS resolved and every redirect re-checked against private, loopback, link-local, CGNAT and mapped ranges) and bodies through `readCapped` |
| CAD kernel sandbox | `electron/cad-kernel/client.mjs`, `kernel.mjs` | Forked with `--permission`, read-only `node_modules` / `vendor` / kernel folder, `env: {}`, and only on Node ≥ 25 (older Node's permission model allows network). replicad code runs with `new Function` inside it, so the sandbox is the boundary |
| ACP client capabilities | `electron/backend/acpAgent.mjs`, `acpClientHandler.mjs` | `readTextFile` is off; `writeTextFile` only to `library/models/<id>.json` (the offline tracer) |
| Renderer HTML | `src/guide/viewer/guidePages.ts`, `src/guide/doc/*`, Markdown | No `dangerouslySetInnerHTML`. Guide HTML escapes every interpolated value (numbers coerced) and the viewer strips scripts, handlers, links, forms and non-`data:image/` URLs. `react-markdown` keeps its default `urlTransform` and no `rehype-raw` |
| Renderer fetches of agent URLs | `src/utils/robotImport/sources.ts`, `src/agent/agentRetarget.ts` | https only |
| Python sidecars | `electron/simready/*.py`, `electron/trainer/*.py` | No `pickle`, `torch.load` without `weights_only=True`, `yaml.load`. SimReady textures load only from inside the package's `files/` folder |
| Secrets | `electron/backend/agentKeys.mjs`, `electron/print/printers.mjs` | Encrypted with `safeStorage`, file mode 0600, never sent to the renderer. A printer's secret is cleared when its kind, host or serial changes |
| Child processes | `electron/**` | `spawn` / `execFile` with argv arrays, never `shell: true` or string `exec` with interpolated input |

**Accepted risks** (re-check each audit; fix when the reason no longer holds):
- Bambu LAN (`electron/print/connectors/ftps.mjs`, `mqtt.mjs`) skips TLS verification: printers use Bambu's private CA. Pinning that CA and checking the CN against the serial would close it.
- `npm start` and dev load `http://localhost:5173`, so a process that takes the port first gets the preload API. `--strictPort` on both scripts limits it; serving `dist/` through a custom protocol in production would close it.
- `publicFetch` resolves DNS, then `fetch` resolves again (a rebinding window). Pinning the checked IP with an undici dispatcher would close it.
- No Content-Security-Policy yet. A build-only meta CSP (`script-src 'self' 'wasm-unsafe-eval'` plus the inline boot script's hash, `object-src 'none'`, `base-uri 'none'`, `frame-src 'none'`) needs a production-build check for violations first.

Done when every surface is reviewed and each finding is fixed or listed as accepted with a reason.

## 4. Fix

- Fix critical and high findings first, at the root, with the helpers above instead of new one-off checks. Extend a helper when it's missing a case.
- Add a regression test next to the code for every fix that a test can hold (`electron/security.test.mjs`, `electron/vite-bridge-middleware.test.mjs`, `electron/backend/backendStores.test.mjs` are the patterns): the exploit input must be refused.
- Keep the user-visible behaviour the same; errors follow AGENTS.md §3 (say what to do).
- When a new surface or helper appears, add its row to the table in §3 here and to AGENTS.md §0h.

## 5. Verify

```bash
npm run check
npm run test:e2e
npm run security
```

- All three must pass. `npm run security` exits 0 only with no critical or high finding.
- Changed agent tools, captures or the viewport: also `npm run perf:agent`.
- A test that fails sometimes is a bug, not noise. Run `npx vitest run <dir>` in a loop (10+ times) after touching anything with workers, WASM or processes, and fix the cause. Example: OpenSCAD in several `worker_threads` crashed V8 with SIGILL about one run in five; it now runs in child processes (`electron/cad-mcp/recipes/scadPorts.mjs`).
- Electron upgrades: start the app (`npm start`) and check the agent connects, a scene opens, parts add and the guide opens.

## 6. Report

Tell the user, in this order:
1. What was exploitable and how (attacker, entry point, impact), now fixed.
2. Toolchain and dependency changes (from → to).
3. What's left: accepted risks and skipped upgrades, each with its reason.
4. What wasn't verified (for example: not tested in the running app).

Nothing is committed unless the user asks.
