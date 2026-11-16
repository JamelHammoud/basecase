# Simulate test evidence

Current coverage: [owning guide](../guide/simulate.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Simulation palette commands

The separate browser test was removed under [#1144](https://github.com/JamelHammoud/basecase/issues/1144) after taking 41.374 s on Windows and 4.452 s on Linux in run 43739315274. That log does not establish which browser or startup stage caused the delay.

## Passive robot joints

The ten generated fixtures cover a short hinged finger, vertical slider, continuous caster swivel, free axle, long pendulum, three-link tail, a pad falling onto a separate rigid stop, a rocker on a diagonal axis, a serial powered shoulder with passive wrist, and independent passive fingers beside a powered joint. Each checks exact physical DOFs and actuator count. Continuous joints receive initial angular velocity. The contact pad must make contact above its declared joint stop.

Analytical checks compare vertical acceleration against 9.81 m/s², displacement against half g t² and specific mechanical energy drift below 0.003 m²/s² over 20 ms. A 500 ms rollout checks a slider's 100 mm lower stop. A separate mixed model checks that a powered joint remains within 0.04 rad while its neighbor moves over 0.2 rad in 200 ms. Physical damping and friction are read back from compiled arrays, and passive motor armature is zero. These tolerances describe numerical simulation only.

The existing native replay checker captures the same ten models for 250 steps each at 2 ms, alongside its existing contact cases. It compares state and contact graphs against pinned C MuJoCo with its existing 1e-6 drift threshold. Run `node tools/sim/contactParity.mjs --out scratch/passive-native.json` to collect native evidence. Native execution is not claimed from the local WASM tests.

The first broad related run exercised 3,196 tests and found an existing Hand Off slots test at the default 5 second timeout plus two joint identity-read assertions. Policy filtering initially added extra indexed identity reads. Building a passive-ID set from the existing index removes those reads and preserves the identity-count contract. The slots test and its timeout were not changed. Session logs remain under scratch and are not committed.

The native comparison runs inside the existing Check unit job, using its existing uv setup. Pull requests select it only for joint declarations, MJCF, actuator-channel or passive-fixture sources and the native checker itself. Nightly Linux and Windows runs include it. The ten passive replays add 2,500 physics steps per backend to the existing contact comparison, without another required job or browser session. Native timings and hosted results must come from that job, not from the local WASM run.

Local validation passed the changed-file run with 3,489 tests passing and one existing skipped test across 510 related files in 109.52 seconds. The final gait-output and browser-helper changes passed 1,507 related tests with the same existing skip across 205 files in 66.24 seconds. The four passive integration files contain 31 checks in the final tree. The documentation capture selected Passive through Pose and recorded falling motion, producing the menu and simulation screenshots. CI runs the revised Pose, history and falling-motion browser path and the native C comparison. Scene persistence is covered by the fast history integration test, with no browser export and reopen phase.
