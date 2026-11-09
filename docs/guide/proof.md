# Proof

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 0k. Proof

How the robotics build is judged while no human tests it. Forge, Cases, Skills, Routines and the robot runtime are built by agents, and only `verify/` decides what is done.

- **Gatekeeper is the only source of completion claims.** `npm run verify <gate>` runs gates from `verify/` and writes `verify/status.json`. Agent prose is never evidence.
- **`verify/` and the safety caps are read-only to builder agents.** Thresholds change only with a maintainer's OK.
- **Gates are `required` or `parked`.** A stuck item parks in the report and other streams continue.
- **Seeded canaries must fire or the gate voids.** Test counts ratchet. A vitest canary (`vitestCanary`, `verify/lib/canary.mjs`) fires only when its own test fails on an assertion; a crash, a skip or a file that doesn't load counts as not fired, so a missing module can't fake a caught fault. A canary that needs setup throws a plain `Error` when the setup didn't happen.
- **One run at a time, and timed checks wait for quiet.** Gatekeeper takes a machine-wide lease (`verify/lib/lease.mjs`, in the system temp folder) so gate runs never overlap. A check marked `timed: true` waits up to 15 min for the 1-minute load average to drop below a third of the cores, records `loadBefore` and `loadAfter`, and if the machine never quiets the gate is void (`machine busy`), never passed.
- **Committed baselines stay put.** `verify/baselines/` holds the numbers a gate compares against; a gate writes a baseline only when none exists, and later measurements go to `verify/out/`. `time-to-skill.json` is the Python trainer's median seconds to the walk skill per robot (5 seeds each, measured once on a quiet machine); Forge's speedup checks read it and are `timed`.
- **No human testing until Stage 8.** Exit criteria are automated. Stage 8 is one session on real hardware, and the first real evidence of transfer.
- **A parked gate says why** in its `parked` field; Gatekeeper prints it, and the Stage 7 rehearsal fails on a parked gate with no reason.
- **Where the plan is vague, gates take the stricter reading,** and the reading is written below with the gate.

### Stage 1: `s1-f7-gradients` and `s1-f7-shac-speedup`

- **`s1-f7-gradients` (required)** holds the four cargo checks: gradients against finite differences, forward physics unchanged, batched sysid and design sweeps, with the planted wrong-gradient canary.
- **`s1-f7-shac-speedup` (parked)** holds the 15× time-to-skill check for the first-order (SHAC) learner, at the same bar. It was split out instead of lowered: SHAC finds no gait through stiff contact, and its ceiling at the gate's cadence is about 1× ([Forge](forge.md)). PPO stays the default. Only a maintainer can change the 15× bar.

### Stage 2: `s2-cases-play`

Finishes Stage 2 on top of `s2-m1-first-case` (`verify/cases/`).

- **One Case, different arms:** a Case is written once (Touch the Dots on `arm-6dof`, and a Touch Case on a Shelf on a gate-only five-joint arm the builder never tuned for), round-tripped through JSON, and run unchanged on `arm-3dof`, `arm-6dof` and the gate arm. The Case object must not change.
- **Limp margin negative, reference positive** for every Case the app offers, not just one: every fitting example, every New Case goal and world, on the arms, both rovers, the hexapod and the stable quads, plus every gallery Case on its bundled robot. The reference run must repeat to the bit. Bipeds stay in `s3a-motor-kit`.
- **Drive e2e** (Playwright on the dev app): an arm's hand moves 20 mm or more on W and back against it on S, drifts under 3 mm idle and under 5 mm after release (the arm drive must report `simState().effector`, mm in world frame); a rover goes 0.1 m forward on W, 0.05 m back on S, drifts under 0.02 m idle and 0.03 m after release, and stops when the window loses focus; a hexapod walks 0.1 m on W without a fall.
- **Gallery at 1.0x:** the production web bundle (`vite build --mode web`) is served with `vite preview`; every gallery link loads in headless Chrome and, while driving, runs at 0.95x to 1.05x real time over 10 s, with no 1 s window under 0.9x, measured from the page's own clock against the sim clock.
- **Canaries:** a limp run that is really the reference, an arm that never moves, a rover that runs on after release, a gallery at 0.5x and at 2x.

### Stage 3: `s3-anythingzoo` and `s3-anythingzoo-full`

The AnythingZoo (`verify/zoo/`). The builder implements `src/skills/anything.ts` exporting `trainAnything` (its input and outcome types are in `verify/zoo/anything.ts`): a prompt in, a skill, an honest not-found, a refusal or "unverifiable" out.

- **The generator is the separate agent.** 30 tasks (10 move, 7 posture, 10 arm, 3 deformable) on 6 bodies (`arm-3dof`, `arm-6dof`, `rover-diff`, `quad-servo`, `hexapod`, `biped-servo`): 180 pairs, 81 feasible, 81 infeasible (an arm asked to walk), 18 deformable. Each run draws a fresh seed; prompts, hidden judge contracts and labelled rollouts are drawn from it and written only to `verify/out/zoo/`. A hidden judge is refused unless its intended motion passes, standing still fails, a limp robot fails, and its labelled rollouts include at least two passes and two fails.
- **The stand-in approver:** the builder proposes a contract with its signals; the stand-in replays its labelled rollouts (kinematic qpos sequences) through the builder's signals and approves only when every label agrees, at most 3 rounds, pointing at one disagreeing rollout when it says no. A skill counts as claimed only when its binding names the approved contract, its own Arena evidence passed, and it is bound to the body's physics.
- **Judging:** the gate reruns Arena with the hidden contract (`verify/zoo/judge.ts`). A claim the hidden judge fails, any claim on an infeasible pair, or any claim on a deformable task is a false claim.
- **Bars:** zero false claims; every deformable pair labelled unverifiable; at least 70% of feasible pairs pass hidden Arena within budget (rounded up); on at least 80% of passed pairs no other method (`ik-or-motion-plan`, `tracking`, `routine`, `lqr-or-mpc`, `tracking-rl-with-reset-curriculum`, `reward-search`) also passes in under half the router's wall time.
- **Budget per pair** (the plan gives only the round total): one reward-search round, 180M environment steps counted from Forge's own records, and 75 minutes of wall clock, which is 225 machine-hours over 180 pairs.
- **Sample mode** is the default gate: 20 stratified pairs on the Mac (14 feasible across all six bodies, 4 infeasible and 2 deformable as controls). `node verify/zoo/cli.mjs --sample`, `--full --shard i/n --seed <hex>` and `--verdict` run it outside Gatekeeper; the full gate stays parked for rented machines.
- **Nothing hidden is printed:** the run's output is scanned for the seed and every hidden contract; a leak fails the check and withholds the log.
- **No contact signals in hidden judges, for now:** they were left out because Arena's contact reader (`src/skills/arenaSignals.ts`, frozen by `s3a-motor-kit`) leaked the contact list and exhausted the 2 GB WASM heap in about 20,000 reads. The reader now frees it (`arenaSignals.test.ts`); letting the generator use contact signals is the next change to this gate.
- **Canaries:** a do-nothing skill claimed as passing, a skill claimed for folding a towel, a rubber-stamp contract, giving up everywhere, a slow router, a log that prints a hidden contract, and a hidden judge that standing still meets.

### Stage 6: `s6-hidden-twin` and `s6-hidden-twin-nad`

The HiddenTwin (`verify/twin/`) is gate-side TypeScript, so builders never see its parameters. The builder implements `src/reality/calibrate.ts` exporting `calibrateServo` (logs in, a calibration with a verdict `measured`, `consistent` or `cant-tell` out) and `calibratedInput` (applies calibrations to an `MjcfInput`, so MuJoCo predicts and the gate measures).

- **The twin:** a single servo on a pendulum, at 0.2 ms with firmware at 1 kHz, with per-unit BAM M6 spreads (kt, resistance, armature, friction, gain, delay) and effects outside the training model: backlash, series compliance, stick-slip, supply sag, thermal drift of resistance and encoder bias. Units are drawn fresh from a seed each run and written only to `verify/out/twin/`.
- **Logs:** six calibration logs per unit (chirp, steps and multisine at two payloads, 100 Hz), then two held-out logs: a new trajectory at a training payload (held-out replay) and one at a third payload (different load).
- **Bar, per family** (STS3215 and XL330, 24 units each, at least 20): median per-unit reduction of held-out RMS tracking error at least 25%, the median error after at most 75% of before, and the 2.5th percentile of 10,000 bootstrap medians above zero.
- **Controls:** the gate checks itself first: each unit's true in-model parameters must reach the bar without the alarm, so the bar is reachable and the twin is outside the model class. Logs shuffled across units and in 1 s blocks must fail the bar and never read `measured`; logs from the catalog preset must read `consistent`. A median gain above 90%, or a median error under one encoder count, raises the alarm that the twin shares the model class, and fails the gate.
- **NAD is parked:** leave-one-payload-out on the public SO-101 logs (calibrated sim within half the teleport error and under a fitted FOPD per joint, the same bar as `s3-servo-models`) and the twin's anchor (its gap to the sim within 0.5x to 2x of the real gap per joint and payload) are written, but no public NAD download was found. A maintainer pins its URL, sha256 and a reader in `verify/twin/nad.json`.
- **Canaries:** a no-op calibrator, an in-class twin fitted exactly (must raise the alarm), gains straddling zero, and 12 units.

### Stage 7: `s7-rehearsal` and `s7-72h-run`

`verify/rehearsal/`.

- **Mechanised UI rules** on the start view, every rail view and the command palette: inputs, selects, menu items and text buttons at least 32 px, icon-only buttons 28 px (§4); no text under 12 px outside key caps; no tinted grey (a colour with 0 < max − min ≤ 24); the §3c copy lint; and axe with no serious or critical WCAG 2 A/AA violation (`axe-core` must be installed). Anything inside `[data-user-content]` (chat text, part colours) is exempt. The plan's §15 grid and pixel diff aren't in this gate.
- **PersonaLab** (`tools/persona/personaLab.mjs` exporting `runPersona`) gets only a screenshot, the accessibility tree and mouse and keyboard on the unsigned packaged app. Ten sessions each plant three faults from ten kinds (label removed, tiny, dead click, misleading label, low contrast, slow response, jargon error, silently disabled, jumpy, flicker) on named controls drawn at run time. A finding matches a fault when it names the control or points inside it. The plan only asks to report recall; the gate requires recall of at least 80% and at least half the findings on a planted fault.
- **Clean-checkout rerun:** clones this commit into a temp folder, `npm ci`, and reruns every required gate except Stage 7's own, inside the held lease; a void counts as a failure, the manifest must be approved, every parked gate must give a reason. The report is `verify/out/rehearsal/report.md`.
- **72-hour run (parked):** the unsigned packaged app, PersonaLab driving the emulated robot through the relay, a fault from the matrix injected every 10-minute cycle and shown on screen within 3 s, no page errors; the Windows x64 half adds up checkpointed segments in `verify/out/rehearsal/soak-windows/` from the new Windows driver.
- **Canaries:** a 20 px input, 10 px text, a slate grey, “No parts yet”, a silent persona, a persona that flags everything, a voided gate counted green, and a parked gate with no reason.
