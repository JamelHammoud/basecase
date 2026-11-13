# Windows

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0j. Windows (mandatory)

Basecase ships for macOS and Windows 11 (x64). Plan, status and the QA list: [docs/Windows plan.md](../../docs/Windows%20plan.md). Every change must keep both working:

- **Spawning:** never spawn `.cmd` / `.bat` (Node refuses them without a shell, and §0h bans shells); spawn `node <script>` or an `.exe`. Find tools with `findOnPath` / `exeName` (`electron/executables.mjs`), never `/bin/sh -lc command -v`. Agent commands are parsed with `splitCommand`, so quoted paths with spaces work (`C:\Program Files\…`).
- **Stopping:** Windows has no signals; `kill()` is TerminateProcess and runs no handler. A child that must save before stopping watches a stop file too (the trainer writes `<job>/stop`, `train.py` checks it each batch).
- **Paths:** build them with `path.join`, never `'/'` (including Node's `--allow-fs-read`), and keep them short under `%APPDATA%`. File ids refuse device names (`con`, `nul`, `com1`…, `isSafeFileId`).
- **Symlinks** need Developer Mode on Windows: fall back to a copy (Codex's `auth.json` is kept in sync by newest mtime).
- **Opening files:** `openFile` (print) or Electron's `shell`; never `open`.
- **The robot daemon on the network:** the emulated Unitree G1 talks to the daemon over UDP on 127.0.0.1, which Windows supports the same way, so it needs no PTY, and nothing on the network can reach it. A socket read with a zero timeout is non-blocking rather than `set_read_timeout(0)`, which Windows and Rust refuse (`LoopbackLink::wait_for`). Timer resolution there can stretch short waits, so the emulator's thread only sleeps 0.5 ms between turns and catches up on whatever time passed.
- **Line endings:** `.gitattributes` keeps every text file LF, so Prettier passes on Windows checkouts.
- **The CAD kernel** runs in the same Chromium sandbox on Windows and macOS (§0h); nothing depends on the Node version. So does the CAD file converter. The packaged Windows app runs its kernel self-test in CI (`BASECASE_KERNEL_SELFTEST`, §0e), since Playwright can't drive it there, and the converter's sandbox test (`cadImportSandbox.app.test.ts`), which starts the app itself without Playwright.
- `npm run check` and `npm run test:e2e` run on `windows-latest` for every push, and the app is packaged for Windows (not driven, §0e). A change that only works on one OS fails CI.
