# Calibration and body properties performance

Implementation: [Calibration and body properties](../guide/robot-runtime.md#performance-calibration-and-body-properties). Shared requirements: [Performance](../guide/performance.md).

## Body layouts index membership once

`rigBodies.test.ts` compares complete layouts across fixture robots and 120 generated forests, plus topology edits and repeated visits. Its 300- and 600-joint fixtures reduce parent lookups from 90,300 and 360,600 to 300 and 600. Ownership-entry visits fall from 90,000 and 360,000 to 300 and 600. `mjcfMembers.test.ts` compares complete models with scan-based membership across fixture robots, visibility, role, fixed-joint, order and embedded-placement edits. These are operation counts and output comparisons without timing assertions or a claim about complete Checks or simulation startup time.

## Body mass calculations resolve each robot's fit once

`bodyMasses.test.ts` compares complete properties with per-body resolution across 30 mixed-robot fixtures, invalid fits, renamed links, edits and rollback, and checks payload centroid merging. Its 300- and 600-body fixtures across two measured robots bound body membership reads to 1,800 and 3,600, down from 180,600 and 721,200. These are operation budgets without timing assertions or a claim about complete Checks or export time. Payload geometry still scans scene parts.

## Unweighted normal equations calculate one matrix half

The calibration test checks complete bounded steps, unchanged inputs and repeat calls for 7 parameters with 300 residuals and 14 parameters with 600 residuals. Matrix dot products fall from 49 to 28 and 196 to 105 respectively. Homography, scan and circle accumulation use 36, 21 and 6 products per equation row instead of 64, 36 and 9. Scan tests check symmetry at every solve across flat and 3D iterations. Homography tests cover perspective, inverse projections, noise, edits and singular inputs. These are operation counts, without timing assertions or a claim about complete fitting time.

## Body fitting prepares residual windows once

`bodyResiduals.test.ts` checks elapsed-time boundaries, joint order, independent results, changed recordings and 180 replay comparisons. Its 300- and 600-frame fixtures require 301 and 601 timestamp reads, plus two measured-position reads per frame after the initial frame. Twenty later probes of each half read neither timestamps nor recorded positions. Existing body identification tests check payload, mass and floor-friction recovery through the real MuJoCo pipeline. These are operation counts, without timing assertions or a claim about total fit time.

## Dense solvers scan matrix tails directly

`leastSquares.test.ts` and `denseSolves.test.ts` check pivoting, source preservation, singular refusal, arm targets and force balance with no tail copies. A scratch comparison matched the former results exactly on 300 systems per solver, including empty, singular and row-swapped systems. At 16 variables, calibration and IK each remove 32 temporary arrays containing 256 entries per solve. The three-variable stance solve removes three arrays containing six entries. These are allocation counts, without timing assertions.

## Live angle history reuses circular storage

`robot/robotGap.test.ts` compares 24 generated streams with copied histories and checks inclusive time boundaries, duplicate timestamps, returned angle identities, changing frame rates, long gaps, wrapped growth and resets. Over 3,000 frames at 20 ms intervals and 6,000 at 10 ms, retained-array slice calls fall from 5,498 and 10,998 to zero. Those slices previously copied 1,379,998 and 5,509,998 entries. Every measured-robot gap comparison shares `AngleTrace`. Capacity growth still copies retained entries and keeps its peak capacity until reset. Expiry releases angle references immediately. These are operation counts without timing assertions or a claim about complete simulation time.

## Population distances accumulate during the solve

An app-wide search found one Mahalanobis implementation, in `utils/gaussian.ts`, consumed by `reality/population.ts` through `bandDistance` and `inBand`. Forward substitution now accumulates squared components in row order. The solved vector remains necessary for later rows. The separate reduction and its callback are removed. For the seven servo parameters, this removes seven solved-vector reads per query. These are source-derived operation counts, not latency measurements.

`utils/mahalanobis.test.ts` compares exact results with the previous two-pass equations for 160 generated matrices of zero through fifteen dimensions, then repeats after offset and diagonal edits. Frozen inputs check source preservation. A further 56 cases cover singular diagonals, signed zero, overflow, infinities and NaN. Existing population tests retain held-out membership coverage. No timeout, retry or quarantine changes apply.

The app still supplies no real measured servo populations. This refinement changes no action, label or visible state, so help articles and screenshots remain accurate without edits.

Validation passed implementation formatting and lint, docs, site copy for 314 pages and types. The related run selected 367 files: 364 passed, two failed and one was skipped, with 2,329 passing tests and five failures. Three classroom cup-grading seed batches exceeded 5,000 ms, followed by an incomplete count of 15 rather than 20 runs. The rover-obstacle rendered visibility test exceeded 15,000 ms. Their cause was not established. No deadlines or quarantine entries changed, and the broad selection was not repeated. The log is `scratch/check-distance.log`.

The initial run also found a formatting warning in the new parity test. After formatting it, the focused check on that test and the documentation passed all checks and both tests in 112 ms of Vitest time. That log is `scratch/check-distance-final.log`. Copy accounting is net zero, and preflight has no findings.

## Recorded body parameter analysis

The numerical implementation bounds an analysis to 24 parameters, 256 selected status samples and 16 joints. It performs one nominal replay and two probes per parameter, at most 49 replays. The generated two-link arm has three parameters and uses seven replays. A shared counter stops after 1,000,000 aggregate physics steps, independently of the preflight estimate. Each replay disposes its engine in the existing `finally` path, including cancellation. Jacobi decomposition retains bounded column copies and at most 24 parameter-direction vectors. Input validation accepts at most 4,096 status samples, 2,048 intents, 20 analyzed seconds and 1 MiB of XML.

Evidence uses the existing worker JSON codec and content-addressed snapshot store. A snapshot is limited to 8 MiB, and the scene index retains at most 32 tries. A result replaces its input reference without evicting another try. Repeating identical analyses deduplicates. The underlying content store remains shared with existing snapshot consumers. Optional recording-evidence preparation does not reset the recorder's preparation key on failure. Closing the analysis sheet cancels its worker, and closed sheets do no source-fingerprint work.

Production capture of the final source on Mac17,8, Apple M5 Pro with 18 logical CPUs and Node 26.13.0 measured seven replays in 300.885 ms of worker work, including that worker's MuJoCo initialization. The WASM high-water allocation was 17,629,184 bytes. The renderer's endpoint JavaScript heap observation was 36,596,325 bytes. A one-byte MuJoCo buffer exposes the backing WASM heap size after replay, and is immediately freed. The WASM heap grows monotonically, so this is its high-water allocation, not renderer peak heap or process RSS.

Synchronous renderer submission took 0.140 ms. The entry-to-result automation window was 5,913.515 ms, excluding screenshots. Its PerformanceObserver recorded no long tasks, whose browser threshold is 50 ms. The CPU profile spans 6,166.785 ms including instrumentation, with 898 samples. Of those, 816 were idle and 23 were unattributed program samples. Named JavaScript, DOM and garbage-collection leaves account for about 54.7 ms of sampled intervals. This statistical profile does not establish precise CPU accounting or attribute every renderer interval to the feature. Physics and raw-session parsing remain in the worker. Raw observations are `scratch/body-browser-final-metrics.json` and `scratch/body-main-thread.cpuprofile`.

The earlier capture measured 577.245 ms of worker work with the same seven replays and WASM allocation. Its interaction window included screenshots and long tasks of 118, 336 and 173 ms. The final observation separates screenshots and uses the final bundle. These single observations do not establish a performance improvement. The first cancellation probe completed analysis before the delayed automation click and retained a result. It is not an active cancellation observation. A second probe cancelled before submission and is not a worker-termination measurement. The final probe waits for actual worker submission before clicking the same Cancel control, without adding a workflow delay or changing a deadline.

The final cancellation observation uses a generated 19.8-second arm run, rather than relying on automation to beat a 3.6-second run's completion. It waits for nonzero submission metrics, then clicks the actual Cancel button. UI acknowledgment took 11.925 ms, and the worker termination call returned in 0.005 ms. Submission took 0.305 ms. No analysis completed and the retained reference remained unanalyzed. This measures acknowledgment and termination-call return, not operating-system worker teardown or a confirmed physics instruction boundary. Per-step cancellation is independently exercised in the production replay tests. The final evidence is `scratch/body-long-cancellation-metrics.json` and `scratch/body-long-cancellation.log`.

The ten-scenario Node production-pipeline measurement used 100 replays in total. Its WASM high-water allocation remained 17,629,184 bytes across all ten scenarios. This loads MuJoCo once before the scenario timings and does not measure browser worker startup. Raw observations are `scratch/body-matrix-measurements.json`.

| Generated recording | Replays | Analysis time in Node, ms |
| --- | ---: | ---: |
| single-link arm | 5 | 134.208 |
| two-link masses | 7 | 152.196 |
| terminal payload | 7 | 121.050 |
| coupled wrist | 7 | 142.289 |
| horizontal arm | 5 | 101.899 |
| informative rover | 17 | 689.335 |
| stationary rover | 17 | 715.092 |
| asymmetric quadruped | 21 | 1236.762 |
| unexcited pan-tilt | 7 | 89.205 |
| unchanged control | 7 | 157.782 |

No additional workflow wait, retry, gate or deadline increase is introduced. Local measurements are not Linux or Windows CI observations and establish no physical diagnostic accuracy.

## Bounded motion selection

The search has at most 6 two-second plans, 65 status frames per plan and one shared 1,000,000-step budget. Probes include every active body parameter, including nuisance parameters. The selected nominal pose replay shares that same counter. Candidate declarations, poses and geometry stay within the existing 8 MiB snapshot limit and 32-reference index. Geometry has an additional 32,768-vertex limit. One selection worker is admitted per renderer. Each open preview has one isolated graphics worker, one frame in flight and one latest requested frame index.

Replay groups plans by physical fit and resets one engine between plans. It retains no engine pool. The initial candidate-by-candidate implementation compiled 42 models for a 6-plan, 3-parameter arm library. Grouped probe replay compiles 6 probe models and one selected nominal model. Removing unused candidate nominal replays lowers that arm's physics work from 43,000 to 37,000 steps at the retained 0.002-second timestep. These are operation counts. They do not establish a wall-time speedup.

### Worker and interaction measurements

The native pipeline test records selection time, actual steps, WASM capacity, sampled worker heap plus external bytes, synchronous submission and cancellation acknowledgement in `scratch/body-motion-worker-measurements.json`. Memory is sampled after completed operations. It is neither process RSS nor a continuous peak-allocation measurement. Cancellation acknowledgement includes the native thread's termination response after a warmed request was submitted, without locating the exact stopped physics step. The numerical cancellation test separately checks interruption during replay.

On macOS arm64 with Node 26.13.0, the native worker observation measured 344.206 ms for selection and 37,000 steps. WASM capacity was 17,629,184 bytes. Sampled worker heap plus external bytes reached 28,776,453 bytes with one active worker. Synchronous submission took 0.101 ms. The termination call returned in 0.127 ms and native termination acknowledgement arrived in 4.377 ms. The retained preview encoded to 52,815 bytes. These single observations do not establish latency distributions.

The article capture records browser worker and interaction observations in `scratch/body-motion-browser-measurements.json`. On macOS arm64 with Node 26.13.0 and the local Vite dev server, one offscreen capture measured 364.025 ms for selection and 37,000 physics steps. WASM capacity was 17,629,184 bytes. Physics submission took 0.140 ms, graphics submission 0.305 ms and the maximum observed bitmap-paint callback 0.145 ms across 2 frames. The observed workflow had no long tasks and sent zero robot commands. This is one development-server observation, not a production latency distribution or a Linux or Windows CI result.

An earlier main-canvas preview capture observed long tasks of 1,036 ms and 742 ms across the same entry workflow. The current UI paints transferred bitmaps. Geometry preparation, WebGL setup and drawing happen in the existing offscreen camera stage. No main-thread rendering fallback, continuous rendering loop, wait, retry or deadline increase was added. The observations differ in implementation and host load, so they are not a controlled rate comparison. Two later setup attempts hit the existing navigation deadline before feature entry. Their evidence belongs to [testing notes](testing-robot-runtime.md#bounded-motion-selection).

### Independent prediction comparison

The generated witness compares two explicit explanations, including the planted one. It selects a different explanation only when its residual advantage exceeds the declared 0.0015 rad noise. It then evaluates on a separate 3.6-second command trajectory. This is a software discrimination test, not a fitted physical twin. Source, fixed and selected experiment durations are each 2 seconds. Fixed and selected motions obey the same range, speed, effort and work limits.

The selected motion ties the compatible fixed shoulder hold in all three planted cases. For the 1.1 mass-scale case, both distinguish the alternatives where the stationary source does not. The original recording already distinguishes the larger combined mass and payload changes. The minimum profiled original-weak-direction response rises from approximately 2.65e-11 to 226.18 assumed-noise units for both motions. That local information response alone does not establish identification accuracy. The independent held-out replays supply the separate prediction-error check. Complete residuals, selected alternatives, bounds and scores are in `scratch/body-motion-validation-*.json`.

| Planted forearm mass scale | Terminal payload, kg | Original held-out RMS error, rad | Fixed held-out RMS error, rad | Selected held-out RMS error, rad |
| --- | ---: | ---: | ---: | ---: |
| 1.1 | 0 | 0.02579144 | 0 | 0 |
| 1.25 | 0.05 | 0 | 0 | 0 |
| 1.4 | 0.1 | 0 | 0 | 0 |

Zero means the planted explanation was chosen from the two declared alternatives and replayed exactly. It does not establish zero error for an estimated model or noisy physical measurements. The selector improves this witness only in the first case. The other two cases are unchanged.

The selector spends simulation work to evaluate the library. It has not demonstrated less physical motion or better accuracy than this fixed baseline. The 18-second servo bench targets servo calibration and is incompatible with this two-second body-information comparison, so no bench speedup is claimed. No real robot, sensor noise distribution or physical transfer result is measured here.


## Selected motion execution

The trajectory path retains at most 65 declared target rows for at most 16 joints and at most two seconds. At most one command is in flight per renderer executor. Received rows stop execution at the 4,096-row bound. The existing 25 ms intent interval, unit subscription and command subscription are released at termination. Controlled-clock cancellation at 0, 25, 100 and 175 ms leaves zero timers and sends no later renderer command. These assertions measure deterministic cancellation behavior, without claiming a process-memory peak or native wall-clock rate.

Backend ownership retains one connection UUID, scalar revision, held/paused flags, deadline and timer per session, with no owner history or retired-token set. Expiry is the declared duration and telemetry freshness is 300 ms. The existing pacer records delivered intent rows with their write timestamps and connection/revision tags only for selected runs. Ordinary sessions incur no extra paced-write messages. Ordered idle acknowledgement drains those messages before completion. Session buffering retains the existing 250 ms or 200-line flush bound. These simulation and resource declarations are not hardware safety claims.

`bodyExperimentCost.test.ts` compares a selected motion with an equal two-second prefix of the existing fixed bench offsets on the same generated two-link body workload. It plants a 1.25 mass scale and declares a separate 3.6-second validation trajectory before selection or fitting. Numerical evidence comes from WASM body dynamics. Recording overhead uses a separate controlled zero-observation recorder sink. It does not represent daemon delivery, disk latency or physical parameter recovery. Raw output is `scratch/body-experiment-cost-shipping.json`.

A macOS arm64 Node 26.13.0 changed-file observation recorded the following values. These are single observations under concurrent host load, not latency distributions.

| Measure | Fixed bench prefix | Selected motion |
| --- | ---: | ---: |
| Declared executed duration | 2 s | 2 s |
| Information gain per executed second | 0.810494 | 113.090086 |
| Independent validation RMS | 0 rad | 0 rad |
| Independent validation gain | 1 | 1 |
| Observation analysis and fit wall time | 659.639 ms | 972.905 ms |
| Motion selection wall time | 0 ms | 772.251 ms |
| Controlled recording wall time | 1.313 ms | 0.402 ms |
| Recorded bytes | 6,592 | 5,234 |
| Controlled observation rows | 65 | 65 |

Both fits exactly replay this noiseless generated validation case, so accuracy is unchanged. Zero does not establish zero physical error. The selected motion has a larger information score but costs more computation. Its measured preparation, selection and recording sum is about 1,745.6 ms versus 661.0 ms for the fixed prefix, in addition to the same declared motion and validation durations. The shorter recorder timing is not a disk or throughput speedup claim. Recording byte differences include repeated-command suppression.

WASM capacity was 17,629,184 bytes. JavaScript heap was sampled at 67,677,528 bytes before the two comparisons and 66,455,784 bytes afterward. Those endpoints include allocation and garbage collection. They are not peak memory or a per-motion allocation measurement. Resource bounds come from retained-row, scalar ownership and timer assertions separately.

The native CI fixture compares selected and fixed bench-prefix delivery over equal two-second declarations. It checks exact distinct paced-write/recording equality and unit isolation with real daemon processes. It observes completion and Stop through production event boundaries, with no retry, longer deadline or added merge gate. The fixture writes platform-specific delivery counts, recording bytes, stop-boundary latency and post-Stop write counts to `scratch/body-motion-native-<platform>.json` in CI. Native command-delivery rate, disk overhead, wall-clock cancellation and cross-platform runtime cost remain unmeasured locally. They must not be inferred from WASM information or the controlled recorder sink. Ordinary servo recordings explicitly refuse a body-identification claim, so observed body-information gain and independent body-validation error are unavailable for that backend.
