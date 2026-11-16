# Simulate test evidence

Current coverage: [owning guide](../guide/simulate.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Simulation palette commands

The separate browser test was removed under [#1144](https://github.com/JamelHammoud/basecase/issues/1144) after taking 41.374 s on Windows and 4.452 s on Linux in run 43739315274. That log does not establish which browser or startup stage caused the delay.

## Passive world joints

The existing C/WASM contact harness accepts `--passive` and captures Case-generated MJCF through `captureContactReplay`. Both a revolute lid and a prismatic drawer run nominal, limp, locked, weak, short, resisted, reversed and rotated variants. C starts from the captured integration state and actuator force ranges, then replays every control. It does not replay recorded fixture poses as commands.

`compareReplay` requires absolute drift below 1e-6 across qpos, qvel and body poses. Contact pairs name active bodies and must match exactly at each sampled step. `scoreNativeCases` rebuilds the ordinary Recording arrays and requires the native verdict to equal WASM, with margin drift below 1e-6. Fixtures retain no actuator addresses. Case-level travel comes from relative body poses in degrees or millimeters. These are declared numerical tolerances, not sensor or hardware accuracy claims.

The sixteen-case matrix passed locally after adding fixture frames and reducing reference waits to a seven-second Case. `fixturePersistence.test.ts` covers storage, replay, scaling and boundary checks. The initial related run selected 409 files and reported unrelated physics and geometry timeouts under shared-host contention. It also found two goal-list expectations that needed the new goals, plus the new fixture failures. Those fixture failures were addressed without changing the travel contract: the lid reference now continues its hand path to the stop, and recorded travel comparisons account for Float32 body poses. No deadlines, retries or skips were added.

The accelerated Forge subset already refuses moving-body contacts. This step does not claim SIMD, Metal or WGSL parity for articulated fixtures and does not change fallback selection. Unsupported backends retain their existing refusal or native fallback.

The first native test wrapped all replays in one subprocess setup and hit its existing 10 s hook deadline during the 412-file related run. It was replaced with one native replay per test, importing the WASM fixture pipeline directly. This removes the nested Vite loader from the unit checks and bounds each Python request to one scene. The command-line matrix remains available through `contactParity.mjs --passive`. No timeout was raised and no retry or skip was added. The fixture matrix also bounds compliant stop overshoot to 2 degrees or millimeters, separately from C/WASM numerical drift.

Review found that the reversed-axis variant replaced the combined travel-and-contact condition with travel alone. It now reverses only the travel atom, retaining the contact requirement and the 0.2 s hold. Each native recording is also rescored with empty contact arrays and must fail, including reversed configurations. The changed-file run passed 4 related test files and 22 tests in 4.13 s, including all 16 native fixture cases. This local timing is not a CI budget. Browser checks remain for CI.
