# Windows plan

Basecase on Windows 11 x64: what's done, what isn't verified yet, and how a release gets tested before anyone downloads it. Code rules live in docs/guide/windows.md §0j.

## Status

| Area | Status | Where |
|---|---|---|
| CI runs `check` and `test:e2e` on `windows-latest` | Done, first run pending | `.github/workflows/check.yml` |
| LF line endings on every checkout | Done | `.gitattributes` |
| `electron:dev` without POSIX env syntax | Done | `tools/electron-hmr.mjs` |
| Agent commands with spaces in paths | Done | `splitCommand` in `electron/executables.mjs` |
| `node` / `uv` found on Windows, Electron's Node when there's no `node` | Done | `shellPath.mjs`, `uv.mjs` |
| CAD kernel in a Chromium sandbox | Done; CI runs the packaged self-test | `cad-kernel/sandbox/` |
| Training stops and saves without signals | Done | `trainer.mjs`, `trainer/train.py` |
| Codex sign-in without symlinks | Done | `codexProfile.mjs` |
| Slicers in Program Files, Bambu Studio's config in `%APPDATA%` | Done, untested on Windows | `print/slicers.mjs`, `printers.mjs` |
| Open in slicer, reveal folders | Done | `openFile` in `print/jobs.mjs` |
| Find on Network (mDNS) | Done, untested on a real network | `print/connectors/mdns.mjs` |
| Device names refused as file ids | Done | `backend/constants.mjs` |
| Native caption buttons, solid chrome, Menu button | Done, needs a look on Windows | `main.mjs`, `TitleBarTabs.tsx`, `useCaptionInset.ts` |
| Shortcut labels (`Ctrl` `Shift` `Z`), Alt / Shift in hints, Explorer | Done | `platformKeys.ts`, `os.ts` |
| Ctrl-click adds to the selection, Ctrl+Y redoes | Done | `pointerInput.ts`, `useCanvasMenu.ts`, `useWorkspaceKeys.ts` |
| Scroll to zoom for mice (default on Windows), middle-drag pans | Done | `wheel.ts`, `stage.ts` |
| AirDrop becomes USDZ Model | Done | `ExportMenu.tsx`, `os.ts` |
| Vision photo masks | Flood-fill fallback (no Windows addon) | `cad-mcp/photoMask.mjs` |
| NSIS installer, `Basecase-Setup.exe` link, updates | Done, first build pending | `package.json` `build.win` / `build.nsis`, `updates.mjs` |
| Azure Artifact Signing | Wired, needs the account set up | `release.yml` |
| Beta channel | Done | `channelOptions`, Help → Get Beta Updates |
| Packaged-app smoke test | Passes on macOS; Windows pending CI | `e2e/app/` |
| Agent CLI downloads on first connect (`win32-x64`) | Wired, untested on Windows | `backend/agentRuntimes.mjs` |

Not done yet:

- **Windows Share** in place of AirDrop (a Node-API addon like `native/sharing`).
- **arm64** (Snapdragon). There are no native addons on Windows, so it's mostly an extra build target and a runner.
- **A Windows icon** drawn for Windows. The macOS rendering (`build/icon/basecase-1024.png`) stands in.
- **The CAD file converter** (`cadImport/`) still relies on Node's permission model, which Electron's Node 24 doesn't apply (§0h).
- **Slicer versions** on Windows: they show no version (macOS reads `Info.plist`).

## Testing before a release

1. **Every push:** `check.yml` runs `npm run check`, `vite build` and `test:e2e` on Ubuntu and Windows, then packages the app unsigned on macOS and Windows and runs `npm run test:app` on the Mac build. Driving the Windows build hung in `electron.launch` on the runner too often to gate on. Path, line-ending and script bugs fail here; a Windows main-process bug that doesn't break packaging shows up only on real machines (step 3).
2. **Every release:** `release.yml` signs both builds and runs `test:app` on the signed mac app; the Windows job builds, checks and uploads the installer, like Crew's. `publish` runs once the mac job passes, with the Windows files when that job passed too.
3. **Real machines, for each beta:**
   - Daily: Parallels with Windows 11 ARM on a Mac (it runs the x64 build through emulation).
   - Before stable: one x64 PC with a real GPU (Intel, AMD or NVIDIA). WebGL there runs on Direct3D 11 through ANGLE, which is where rendering bugs hide, and it has a real touchpad.
4. **Beta first:** release `0.x.0-beta.N`; testers turn on Help → Get Beta Updates. Once the QA list passes, release the same commit as `0.x.0`.

Runners have no GPU, so CI proves the app works, not that it's fast or that it renders right. Steps 3 and 4 cover that.

## QA list (Windows, each beta)

- [ ] Download `Basecase-Setup.exe` from the release; SmartScreen shows the publisher (signed builds) and installs without admin.
- [ ] First launch: the boot ring, then the app; the caption buttons sit in the title bar with nothing under them; the window drags by the title bar and snaps (Win+arrows, snap layouts on hover over maximize).
- [ ] Menu button: every menu opens; Help → Check for Updates answers; About shows the version.
- [ ] Tooltips and Settings → Shortcuts show `Ctrl`, `Shift`, `Alt`, never ⌘.
- [ ] Mouse: drag orbits, wheel zooms, right-drag and middle-drag pan, right-click opens the menu without panning. Touchpad: pinch zooms; two-finger scroll follows Settings → Navigation.
- [ ] Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, Ctrl+D, Ctrl+click in Layers and on the canvas, Ctrl+T / Ctrl+W / Ctrl+Tab.
- [ ] Sign in to Claude in the Agent tab (the CLI downloads first); a short build runs, with parts compiling.
- [ ] Codex signs in from an existing `~/.codex` login.
- [ ] Training: with uv installed, Stand trains, and Stop saves the policy.
- [ ] Printing with Bambu Studio installed: Settings → Printers lists it; Slice works; Open in Bambu Studio opens it; Find on Network finds a printer (accept the firewall prompt once).
- [ ] Export: STL, 3MF and USDZ Model save and show in Explorer.
- [ ] Build guide: generate, open, Show in Explorer.
- [ ] Update: install the previous beta, publish the next, and the update button appears and installs.
- [ ] Uninstall from Settings → Apps; scenes in `%APPDATA%\Basecase` stay.
