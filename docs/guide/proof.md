# Proof

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0k. Proof

How the robotics build is judged while no human tests it. Forge, Cases, Skills, Routines and the robot runtime are built by agents, and only `verify/` decides what is done.

- **Gatekeeper is the only source of completion claims.** `npm run verify <gate>` runs gates from `verify/` and writes `verify/status.json`. Agent prose is never evidence.
- **`verify/` and the safety caps are read-only to builder agents.** Thresholds change only with a maintainer's OK.
- **Gates are `required` or `parked`.** A stuck item parks in the report and other streams continue.
- **Seeded canaries must fire or the gate voids.** Test counts ratchet. A vitest canary (`vitestCanary`, `verify/lib/canary.mjs`) fires only when its own test fails on an assertion; a crash, a skip or a file that doesn't load counts as not fired, so a missing module can't fake a caught fault. A canary that needs setup throws a plain `Error` when the setup didn't happen.
- **No human testing until Stage 8.** Exit criteria are automated. Stage 8 is one session on real hardware, and the first real evidence of transfer.
