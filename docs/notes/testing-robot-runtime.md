# Robot runtime test evidence

Current coverage: [owning guide](../guide/robot-runtime.md#testing-coverage). Shared policy and harness contracts: [Running and testing](../guide/running-and-testing.md#0e-tests).

## Servo calibration

`e2e/operateCalibration.e2e.test.ts` leaves fitting and replay accuracy to the pipeline tests in the guide, avoiding the 86 s live calibration story from run 43642970706 (#855).

## Mixed-servo calibration

The mixed-arm browser test was replaced after taking 49 s in run 43642970706 (#856).

## Operate tries

The duplicate two-session walkthrough in `e2e/operateTries.e2e.test.ts` was removed under [#1146](https://github.com/JamelHammoud/basecase/issues/1146) after taking 30 s in run 43739315274. It included eight seconds of fixed driving waits and repeated the stall replay.

## Servo zero and direction

The zero-and-direction browser test was narrowed after taking 41 s in run 43642970706 (#857).

## Windows network pairing

This walkthrough is quarantined only on Windows through 28 November 2026 after run 43698588307. Its cause is not established. It remains active on Linux, where it passed at the same commit. Network pairing and client loss ([#1024](https://github.com/JamelHammoud/basecase/issues/1024)) measured 187235 µs against the unchanged 150000 µs stop limit, then failed to reach Look on retry. Run 43696182210 repeated both failures with a 244140 µs interval. Its `beforeAll` fixture shares the daemon, credentials and fleet across retries. Restoring it requires Windows traces and at least ten runs before and after at the same load before removing the entry.

## Windows body fitting

This walkthrough is quarantined only on Windows through 28 November 2026 after run 43698588307. Its cause is not established. It remains active on Linux, where it passed at the same commit. Fit Body ([#1025](https://github.com/JamelHammoud/basecase/issues/1025)) first failed to activate a fit, then read an unchanged Checks fingerprint on retry. The preceding Windows run passed. Restoring it requires Windows traces and at least ten runs before and after at the same load before removing the entry.

## Passive robot joints

The ten-mechanism test compares servoLayout and jointMap lengths against the exact powered count. Passive joints receive no servo ID, preserving consecutive IDs and source order among powered declarations. The live Pose setup omits passive IDs. No daemon command or deployment format changes, and no physical robot is used.

## Fleet publisher

`tools/fleet/adapter.test.mjs` pairs an authenticated TCP loopback peer through the real `RobotFleet` and network worker, publishes identity-addressed observations and verifies that disconnect leaves an offline inventory record. It uses the protocol peer, not a native daemon or physical robot. Disconnect completion comes from the link's closed event, followed by the publisher's active requests. Awaiting only requests already active before the asynchronous link close initially read the preceding online observation.

The studio connection limit remains 32. The separate [10,000-identity registry measurements](fleet.md) establish no increase in concurrent control capacity. Browser entry and restart assertions are committed in `e2e/fleet.e2e.test.ts` for CI.

## Retained fleet incidents

The fast collector matrix covers arm stalls, quadruped disconnects, independent units, duplicate faults, older status timestamps, healthy recovery, recurrence, acknowledgment with an active latch, missing recordings and 128-record eviction. A 10,000-event alternating-unit fixture retains two incidents. This is an operation-count observation, not a throughput timing.

`fleetIncidentStore.test.ts` collects an unselected arm while another is selected, acknowledges it without changing its latch, then reloads the modules against the saved storage and compares retained records. The native integration uses RobotFleet, fake daemon pipes and a real TryStore. It checks the incident's session id against the saved manifest, the other arm's accepted command, a quadruped disconnect, and acknowledgment producing no daemon write.

The focused browser walkthrough restores a retained incident, acknowledges it while it remains active, and opens its exact kept try. A two-frame recording is seeded through the real temporary TryStore. The existing fleet walkthrough retains stall isolation and rollout coverage. Lifecycle and predicate matrices stay in fast tests. Local validation uses only `check:changed`. CI owns the browser walkthrough and platform observations. Help captures use the same emulated recorder through `recordedLink` without judging their appearance.

History is collected while the studio is running. The local storage test simulates a renderer restart, not a physical host failure. Missing or malformed storage restores an empty history, and a storage write failure leaves the in-memory incidents available. Real motors and external sensor drivers are outside these tests. There is no new quarantine or retry.

### Pull request #1354 browser failure

The changed fleet story failed in CI after 63,768 ms across two attempts. Open Try reached the timeline, then the test waited 30 seconds for a Close button. Playback with a headed console hides that button and uses Escape to leave. The retry reused the faulted fleet from `beforeAll` and failed its live-motion recording prerequisite. The aggregate Check failed only because this browser job failed.

The added recording and inspection detour is removed from the fleet story. `fleetIncidents.e2e.test.ts` owns a fresh app, restores an incident from storage and seeds a two-frame recording, then inspects, acknowledges and opens that exact id. It exits through Escape. Recorder retention and session binding remain covered by `electron/robot/fleetIncidents.test.mjs`, and independent operation remains covered by the original fleet walkthrough. No timeout, retry or quarantine was added. Browser execution remains in CI.

The next changed-browser run failed at the timeline assertion after 47,254 ms across two attempts. The seeded recording declared three positions, velocities and actuators, while `ARM` loads two revolute joints. `fitsRecording` rejects that mismatch, so timeline opening returns false. The fixture now derives those dimensions, sample lengths and joint addresses from `ARM.project.joints`, and checks that the recording save succeeds. The same browser assertion still requires the timeline to open and the exact try id to be fetched. No assertion, timeout or retry changed. Local validation remains `check:changed`, with browser execution in CI.


### Review regression coverage

The new first-status assertion failed with a null session before recorder event ordering changed. The restored-date assertion accepted `1e100`, which throws when the incident dialog formats it. The native integration now checks the first status, a status that drops a rung, disconnect immediately after that status, and a closed session after the scene and policy change. Restored-history tests reject out-of-range dates in every lifecycle field and discard a recording reference for a different session.

The browser walkthrough opens Operate in two scene tabs before inspecting. It requires exactly one incident dialog, acknowledges the active incident, closes the dialog with Escape from the action button, reopens it and fetches the exact kept recording. The dialog mounts through the active workspace's sheet host with its own error boundary. Browser execution stays in CI.

The review validation passed `check:changed` for the code and test changes, including 47 related test files and 222 tests, types, lint, docs and site copy.

The native fleet integration asserts that the arm fault precedes its recorded event, preserving the existing renderer replay binding while checking the incident against that same saved session. The disconnected incident browser fixture also asserts that its retained row has no Look rung. These assertions add no recording wait or retry.

## Emulated G1

Issue [#1440](https://github.com/JamelHammoud/basecase/issues/1440) reports that `connects the G1, climbs to Test and follows a posed right shoulder without writing the legs` took 40 seconds in [Check run 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744). The browser story loaded a 29-joint humanoid, connected the JavaScript stand-in, climbed two rungs, started the full simulation and waited for its shoulder to follow. It did not exercise the native daemon or motor transport. The report provides the total duration, not a phase trace, so simulation startup is not established as the sole cause.

The browser check retains the G1 connection button, the G1 connection request, the climb to Test, 17 writable joint rows, right-shoulder address and initial telemetry, hidden policy and calibration controls, disconnect and renderer-error assertions. It does not start the humanoid simulation. Existing fast tests cover G1 recognition, writable ordering, right-shoulder addressing, leg exclusion and ladder availability. `unitreeG1.test.ts` also passes shuffled full-body simulation targets through `sceneRobot` and `intentFromSim`, requiring exactly the 17 writable targets with the posed right shoulder at daemon id 23. Native `g1.rs` tests `the_emulated_g1_follows_an_arm_intent_round_trip`, `leg_joints_are_never_written` and `policy_rungs_stay_out_for_the_g1` retain the control behavior against the native emulator with a virtual clock. The G1 fixture is shared with the micro-evaluation scenes.

There is no longer a browser assertion combining G1 connection controls, hidden calibration controls, live simulation and fake telemetry. The shared Operate and ROS 2 browser walkthroughs remain, but do not establish that G1-specific combination. The browser no longer performs simulation startup or waits for shoulder motion. The focused browser check has a 15-second test budget, but its execution time and total shard speed have not been measured locally. No timeout is increased, and no retry or quarantine is added. Browser and native execution stay in CI.
