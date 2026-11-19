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

History is collected while the studio is running. The local storage test simulates a renderer restart, not a physical host failure. Missing or malformed storage restores an empty history, and a storage write failure leaves the in-memory incidents available. Real motors and external sensor drivers are outside these tests. The initial implementation added no quarantine or retry. The later Windows containment is recorded below.

### Pull request #1354 browser failure

The changed fleet story failed in CI after 63,768 ms across two attempts. Open Try reached the timeline, then the test waited 30 seconds for a Close button. Playback with a headed console hides that button and uses Escape to leave. The retry reused the faulted fleet from `beforeAll` and failed its live-motion recording prerequisite. The aggregate Check failed only because this browser job failed.

The added recording and inspection detour is removed from the fleet story. `fleetIncidents.e2e.test.ts` owns a fresh app, restores an incident from storage and seeds a two-frame recording, then inspects, acknowledges and opens that exact id. It exits through Escape. Recorder retention and session binding remain covered by `electron/robot/fleetIncidents.test.mjs`, and independent operation remains covered by the original fleet walkthrough. No timeout, retry or quarantine was added. Browser execution remains in CI.

The next changed-browser run failed at the timeline assertion after 47,254 ms across two attempts. The seeded recording declared three positions, velocities and actuators, while `ARM` loads two revolute joints. `fitsRecording` rejects that mismatch, so timeline opening returns false. The fixture now derives those dimensions, sample lengths and joint addresses from `ARM.project.joints`, and checks that the recording save succeeds. The same browser assertion still requires the timeline to open and the exact try id to be fetched. No assertion, timeout or retry changed. Local validation remains `check:changed`, with browser execution in CI.


### Review regression coverage

The new first-status assertion failed with a null session before recorder event ordering changed. The restored-date assertion accepted `1e100`, which throws when the incident dialog formats it. The native integration now checks the first status, a status that drops a rung, disconnect immediately after that status, and a closed session after the scene and policy change. Restored-history tests reject out-of-range dates in every lifecycle field and discard a recording reference for a different session.

The browser walkthrough opens Operate in two scene tabs before inspecting. It requires exactly one incident dialog, acknowledges the active incident, closes the dialog with Escape from the action button, reopens it and fetches the exact kept recording. The dialog mounts through the active workspace's sheet host with its own error boundary. Browser execution stays in CI.

The review validation passed `check:changed` for the code and test changes, including 47 related test files and 222 tests, types, lint, docs and site copy.

The native fleet integration asserts that the arm fault precedes its recorded event, preserving the existing renderer replay binding while checking the incident against that same saved session. The disconnected incident browser fixture also asserts that its retained row has no Look rung. These assertions add no recording wait or retry.


### Windows retained-incident playback on 18 November

[Check 44206588211](https://github.com/JamelHammoud/basecase/actions/runs/44206588211) at `eb8bc0b3f508ebb67ed07f9ec4b09f2ad23a640b` failed the retained-incident walkthrough on both Windows attempts, taking 78,922 ms together. The first attempt restored storage, loaded both arm scenes, acknowledged the active incident, closed and reopened its dialog and clicked Open Try. The timeline remained absent at line 102. The retry failed earlier at line 79, where the part-count polling callback did not resolve after loading the arm into the second tab. Neither failure identifies its responsible asynchronous stage. No shared cause between those paths is established.

The preceding [Check 44200197616](https://github.com/JamelHammoud/basecase/actions/runs/44200197616) passed Windows in 16,742 ms and Linux in 9,999 ms. The test, arm fixture, harness, active studio hook, incident component and store, replay opener, timeline source, opening and playback code, test configuration and Check workflow are unchanged between those revisions. Vite, Vitest, Playwright, Rolldown, Three and React versions are unchanged. Last full green [43948835889](https://github.com/JamelHammoud/basecase/actions/runs/43948835889) passed Windows in 15,986 ms. No causative merge or environment change is established.

Classification: intermittent Windows scene-loading and retained-try playback with unresolved stages. Same-revision [Windows diagnostic 44208960108](https://github.com/JamelHammoud/basecase/actions/runs/44208960108), durable ticket `44668e9f-6205-4046-86e9-8e0393e029fb`, passed the complete exact test with one worker, zero retries and quarantine off. The process took 38,591 ms and the assertion 26,493.3504 ms on image `20261103.298.1`, Node 26.13.0 and four CPUs. Its manifest and report are retained in `scratch/diagnostics/44668e9f-6205-4046-86e9-8e0393e029fb/`. This establishes intermittency, not a flake rate or candidate fix.

Only the exact Windows declaration is quarantined through 28 November 2026 under [#1749](https://github.com/JamelHammoud/basecase/issues/1749), labelled `loop:fix`, `loop:next` and `loop:priority`. Linux and macOS retain it. Windows keeps fast collector, storage and native recorder integration tests, but temporarily lacks the combined ordinary dialog-to-timeline observation across two scene tabs. The existing fleet walkthrough still covers independent operation and rollout.

The owner traces page boot and reload, active workspace changes, load dispatch and committed part state, TryStore save and reads, manifest and recording retrieval, simulation startup, scrub compatibility, timeline ownership, app errors and cleanup. Restoration requires a demonstrated cause and at least ten baseline and ten candidate observations at equal Windows load with retries disabled for each affected path. Preserve exact recording identity, the active latch after acknowledgment, no daemon commands, one dialog across two tabs, Escape from the action button, timeline opening and closing and empty renderer errors. Keep the real temporary TryStore, arm-derived recording dimensions, current deadlines and assertions. A faster replacement must preserve the same contract.

## Emulated G1

Issue [#1440](https://github.com/JamelHammoud/basecase/issues/1440) reports that `connects the G1, climbs to Test and follows a posed right shoulder without writing the legs` took 40 seconds in [Check run 43864963744](https://github.com/JamelHammoud/basecase/actions/runs/43864963744). The browser story loaded a 29-joint humanoid, connected the JavaScript stand-in, climbed two rungs, started the full simulation and waited for its shoulder to follow. It did not exercise the native daemon or motor transport. The report provides the total duration, not a phase trace, so simulation startup is not established as the sole cause.

The browser check retains the G1 connection button, the G1 connection request, the climb to Test, 17 writable joint rows, right-shoulder address and initial telemetry, hidden policy and calibration controls, disconnect and renderer-error assertions. It does not start the humanoid simulation. Existing fast tests cover G1 recognition, writable ordering, right-shoulder addressing, leg exclusion and ladder availability. `unitreeG1.test.ts` also passes shuffled full-body simulation targets through `sceneRobot` and `intentFromSim`, requiring exactly the 17 writable targets with the posed right shoulder at daemon id 23. Native `g1.rs` tests `the_emulated_g1_follows_an_arm_intent_round_trip`, `leg_joints_are_never_written` and `policy_rungs_stay_out_for_the_g1` retain the control behavior against the native emulator with a virtual clock. The G1 fixture is shared with the micro-evaluation scenes.

There is no longer a browser assertion combining G1 connection controls, hidden calibration controls, live simulation and fake telemetry. The shared Operate and ROS 2 browser walkthroughs remain, but do not establish that G1-specific combination. The browser no longer performs simulation startup or waits for shoulder motion. The focused browser check has a 15-second test budget, but its execution time and total shard speed have not been measured locally. No timeout is increased, and no retry or quarantine is added. Browser and native execution stay in CI.

## Windows ROS 2 Operate

[Check 44214681066](https://github.com/JamelHammoud/basecase/actions/runs/44214681066) at `505f2d5b599f005dfaf201ce6dbe863f762916d4` failed the ROS 2 Operate walkthrough on Windows. The first attempt completed connection, ladder, simulation startup and posed-shoulder motion and agreement assertions, then exhausted the unchanged 30000 ms Playwright click deadline returning to Operate at line 103. The tab resolved visible, enabled, stable and selected, and scrolling completed. The log stops before click delivery completes. It does not identify whether input delivery, renderer responsiveness, simulation work or another stage stalled.

The retry failed at line 62 waiting for the Feetech family picker. The app and fake daemon are attached once in `beforeAll`, and the first attempt never reached Disconnect. `OperatePanel` renders the connection controls only while disconnected, so this second failure follows reused connection state. It does not establish the cause of the original click stall. Both attempts together took 103888 ms, with 108331 ms for the file. Cleanup reported that two Vite servers prevented exit after 10000 ms. No shared cause between click delivery and cleanup is established.

Previous Windows [Check 44210703841](https://github.com/JamelHammoud/basecase/actions/runs/44210703841) at `db9b3a73ae0063a70884d53bc7f570dec7794d4d` passed the assertion in 9750 ms and the file in 12906 ms. The test, harness, arm fixture, fake daemon, robot and simulation sources, Operate connection controls, dependency lock and browser configuration are unchanged between these revisions. Both jobs used runner 2.338.2, Windows image `20261103.298.1` and Node 26.13.0. Linux passed at the failing revision in 5540 ms for the assertion and 9519 ms for the file. No causative merge or environment change is established.

Classification: intermittent Windows tab-action completion with an unresolved primary cause. Same-revision [Windows diagnostic 44217093535](https://github.com/JamelHammoud/basecase/actions/runs/44217093535), durable ticket `9205ea9c-fd08-4018-a7e6-579292e41183`, passed the complete exact test with one worker, zero retries and quarantine off. The assertion took 8132.8451 ms and its process took 27589 ms on Windows image `20261103.298.1`, Node 26.13.0 and four CPUs. The report has no cleanup messages. Its manifest, numbered report and logs are retained in `scratch/diagnostics/9205ea9c-fd08-4018-a7e6-579292e41183/`. This establishes intermittency, not a flake rate or a candidate fix.

Only this exact Windows declaration is quarantined through 28 November 2026 under [#1757](https://github.com/JamelHammoud/basecase/issues/1757), opened with `loop:fix`, `loop:next` and `loop:priority`. Linux and macOS retain the complete walkthrough. Windows retains fast ROS 2 family choices, topic and joint names, connection and intent ordering, ladder and row mapping, plus native arm-controller intent following. It temporarily lacks the combined browser observation of ROS 2 simulation following and return to Operate for disconnect. No test assertion, timeout or retry changed.

The owner traces boot and fixture load, family choice, connection events, ladder transitions, simulation readiness, intent and telemetry flow, rail selection, tab click delivery, selected view and panel mount, renderer errors, disconnect and process cleanup. Coordinate shared harness changes with retained fleet incident owner #1749 and Fleet Operate owner #1386. Restoration requires a demonstrated cause and at least ten baseline and ten candidate observations at equal Windows load with retries disabled. Preserve the exact ROS 2 specification and ordered joint names, Test-only ladder, hidden calibration controls, row mapping, shoulder movement and measured/sim agreement, disconnect, family-picker return, empty renderer errors and existing deadlines. A faster replacement must retain that contract with broad pipeline coverage and a focused browser check.

## Windows calibration command deadline

[Check 44474977845](https://github.com/JamelHammoud/basecase/actions/runs/44474977845) at `1e4b6bf9963a72b2c2f1625465453f1c4659cac9` completed Windows browser shard 2 after the repair brief. `Operate zero and direction > starts camera calibration from the command palette` in `e2e/operate.e2e.test.ts` exhausted its unchanged 15,000 ms callback deadline on both existing attempts, totaling 30,681 ms. The error names callback line 221 without a failing operation. Scene loading, emulated connection, ladder climb, palette delivery, capture-state observation, disconnect and cleanup are not distinguished. Callback entry and deadline expiry are established. No capture, camera or solver failure is established.

Linux passed the same declaration at the failed revision in 1,382 ms. Last full green [Check 44391437908](https://github.com/JamelHammoud/basecase/actions/runs/44391437908) passed it on Windows in 7,173 ms and Linux in 1,807 ms. The test, Operate commands and calibration sources are unchanged since that green run. Failed Windows used image `20261116.315.1`, while the previous green used `20261103.298.1`. This difference alone identifies no environment component to pin. The two existing attempts share an app and robot state, so they are not independent observations and establish no rate.

Exact-revision [Windows diagnostic 44477091304](https://github.com/JamelHammoud/basecase/actions/runs/44477091304) passed the complete command walkthrough in 7,006.3338 ms with one worker, zero retries and quarantine off on the same failed image `20261116.315.1`. Ticket `01d99846-a421-41e8-86df-e23bf1d5e775` retains its verified manifest, test output and cleanup evidence. The process took 33,946 ms including setup and teardown. Its passing log retained the existing 10-second warning that two Vite servers prevented clean shutdown after tests closed. The successful assertion therefore does not establish clean server teardown. Classification is intermittent Windows command execution with an unresolved stage. The same-image pass does not establish an environment regression, a responsible internal stage or a flake rate.

Only this exact Windows declaration joins existing open priority calibration owner [#987](https://github.com/JamelHammoud/basecase/issues/987) through 28 November 2026. It is a separate path from that owner's measured-joint replay, rollback and Checks Fix story. Linux and macOS retain the command walkthrough. Windows retains fast calibration sessions, mount capture, fitting, history and originating-unit actions. These checks do not replace ordinary palette-to-capture browser coverage.

Restoration requires stage and cleanup tracing, fixing the established cause and at least ten baseline and ten candidate observations at equal Windows load with retries disabled. Preserve ordinary scene loading and emulated connection, Test gating, palette dispatch, capturing state, disconnect readiness and empty renderer errors. This repair changes no command, camera logic, test assertion, timeout or retry. Full job and previous-green logs are retained in `scratch/failed-windows-e2e-2.log`, `scratch/passed-linux-e2e-2.log` and `scratch/green-run.log` for the task handoff.
