# Skill feasibility and moves performance

Implementation: [Skill feasibility and moves](../guide/skills.md#performance-skill-feasibility-and-moves). Shared requirements: [Performance](../guide/performance.md).

## Local source preparation

`localKitSource.ts` scans scene metadata and ranks compatible references by current robot key, creation time and hash. It reads only the selected artifact. Missing, malformed, hash-mismatched or incompatible selected artifacts return to the cold path without loading another candidate. Source and target schemas admit at most 256 action joints. Mapping uses the shared Install Skill converter, then validates the resulting policy again. No candidate is evaluated in physics during selection.

Production source preparation uses the existing ranking worker for hashing, proof validation, native actor shape validation and policy mapping. Browser worker failure refuses reuse rather than doing this work on the renderer. Only small bounded schema metadata is scanned before loading the selected artifact. The store refuses files over its existing 32 MB save limit.

The one-minute native Metal comparison in [Skills test evidence](testing-skills.md#edited-robot-local-sources) includes production file reads and preparation inside every retention clock. Median warm preparation was 26.0337 ms for six quadruped edits and 45.1311 ms for four hexapod edits. These Node-side measurements include read, parse, validation, hashing and mapping. They exclude renderer-to-worker transport and worker startup, so they are not UI latency measurements. A final-code replay through the ranking handler matched all ten measured mapped policy hashes. Its real-file preparation medians were 46.0721 ms for quad and 49.3636 ms for hex, with a 39.5875 to 59.3557 ms combined range. This includes Node handler loading, but not browser transport. The single preliminary cached-string measurement was 58.2169 ms and excluded file IO. Its 15-second warm schedule took longer, and is retained as failed experiment evidence.

The four-pair macOS native CPU cohort measured median warm preparation of 30.0845 ms with real source reads. The additional six-to-six CPU pair took 40.7473 ms to prepare its warm input.

Native learning results, total training steps, all verification work, source preparation runs, shared host load and unsupported mappings are reported in that same testing note. The limited observed retention improvement does not establish a universal speedup.

## Move summaries accumulate extrema directly

`moveExtrema.test.ts` compares the previous reductions across three robot models and 30 motions, edits, empty inputs, signed zero and nonfinite values. It also checks action scaling and height at the 30,000-frame limit. Thresholds and arithmetic remain unchanged. These are allocation changes and numerical comparisons, without timing assertions or a claim about complete training time.

## Reach feasibility retains only refinement candidates

`feasibilityReachSamples.test.ts` compares complete candidates and final model poses with full sorting on three- and six-joint MuJoCo arms, including changed ranges, ties, empty chains and repeated calls. Pose storage falls from 2,048 joint arrays to six Float64 buffers per call. These are allocation counts, without timing assertions or a claim about complete feasibility time.

## Feasibility shares body topology per model

`feasibilityBodies.test.ts` compares membership with parent walks across branches, multiple roots and 40 seeded trees, checks fresh preparation after edits, and checks mass, chains and feet on three MuJoCo robots across pose and mass edits. Its 300- and 600-body chain and star fixtures read 300 and 600 parents during preparation, with no parent reads in later membership queries. One full membership scan by parent walks takes 44,850 and 179,700 reads on those chains. These are operation counts, without timing assertions or a claim about complete feasibility time.

## Rover routes prepare compiled geometry radii once

`wheelBodyRadii.test.ts` compares the body radii with per-body geometry scans and complete setups with real MuJoCo models for differential and four-wheel rovers and an arm. It checks reordered and passive joints, multiple geometries per body, bodies without geometry, the 1 mm minimum, NaN and infinite sizes, and fresh results after edits. Each call owns its radius buffer.

For 12 queried bodies and 300 or 600 geometries, instrumented geometry-owner reads fall from 3,600 or 7,200 to 300 or 600. Preparation takes one geometry pass plus initialization of one Float64 radius per compiled body. The previous path scanned every geometry for each wheel and allocated geometry-index lists, filtered lists, radius lists and copied size triples. The new path reads size triples directly. These are operation counts, without timing assertions or a claim about total training speed. Manual drive uses scene dimensions and does not traverse compiled geometries.

## Limb matching retains the winning distance

Each target limb previously allocated a filtered source-limb list. With C compatible source limbs, selection measured 2 × (C − 1) distances when C was positive. It now allocates no candidate list and measures C distances, retaining the current winner's distance. A sole compatible candidate gains one distance calculation, while two candidates require the same number. Source scanning and matching policy remain unchanged.

The instrumented fixture in `robotSchema.test.ts` has four source limbs of lengths 2, 1, 2 and 3, and three target limbs of length 2. It records six `Math.hypot` calls, equal to the old six calls, while removing three candidate arrays. For twelve compatible source limbs and six targets, the formulas give 132 previous calls and 72 current calls, with six candidate arrays removed. These are operation counts, not timings or a claim about complete installation speed.

Tests check complete joint maps, source-order ties, reusable source limbs, incompatible lengths, edited inputs, target joint order and nonfinite distances. No workflow, UI or artifact format changes, so help steps and screenshots remain current.

## Support margins scan hull edges directly

A whole-app search found one skill support-margin implementation in `skills/feasibilityStance.ts`, called by `feasibilityChecks.ts`. Ordinary feasibility and relaxation attempts share it. Build uses a separate margin calculation with different boundary and degenerate-polygon rules, so it retains that policy.

For H hull vertices, the previous skill calculation allocated H edge tuples, one edge list and one distance list. Direct traversal removes all H+2 arrays and the separate containment traversal. A four-vertex hull avoids six arrays, and a twelve-vertex hull avoids fourteen. The existing projected sole list, hull, center tuple and segment-distance arithmetic remain unchanged. Containment still stops evaluating sides after its first rejection. These are code-derived allocation counts, not timings or a claim about complete training latency.

`supportMargin.test.ts` compares exact results with the preceding calculation for contact counts zero through 64, five center queries and both source orders. Queries include signed zero, NaN and infinity. Existing cases cover strict boundary negative zero, repeated contacts, collinear contacts and source preservation. No action, label or screen state changes, so help steps and screenshots remain accurate. No quarantine, timeout or retry changes apply.

## Topology attribute patterns

A whole-app search found one topology attribute reader in `skills/artifacts.ts`. All model-hash consumers share it through `modelHashes`, including skill freshness, Arena, training, recovery, Case checks and Routine stamps. Other XML readers use different attribute boundaries or dynamic names and do not participate in topology hashing.

For B body opening tags, F freejoint tags and J joint tags, the previous reader constructed B + F + 3J regular expressions per hash. It now constructs none during hashing and retains three module-level patterns. For 300 body tags, one freejoint and 300 joints, this removes 1,201 constructor calls per hash. These are code-derived operation counts, not timings or a claim about complete training speed. Tag-match arrays and hash serialization remain unchanged.

The patterns have no global or sticky flag, so repeated reads hold no cursor state. `artifacts.test.ts` checks the expected topology digest for nested bodies, a self-closing body, reordered attributes, prefixed attribute names, missing attributes and edited names between repeated reads. Existing cases cover physics, actuator and topology changes and their skill freshness decisions. No workflow, artifact schema, hash input or screen state changes, so help steps and screenshots remain current.

## Obstacle-aware arm planning

Implementation and bounds: [Skills](../guide/skills.md#obstacle-aware-arm-candidates). Measurements below use an Apple M5 Pro with Node 26.13.0 on 18 November 2026. Linux and Windows run the same production-pipeline coverage in existing CI. No hosted timing or physical accuracy result is claimed here.

### Current direct-path comparison

The baseline uses the direct planner and engine from main at `bc4baf626`. Relevant baseline source is unchanged by the update to `23297fb72`. Each mode runs in a fresh process with the same generated three-joint divider fixture, initial shoulder −60 degrees, target +60 degrees, ten-second contract and fixed comparison salt. The clear control removes only the divider. Each process takes three clear samples, then three divider samples. The first sample includes cold setup. Values are medians, not a statistical speed claim.

| Geometry and planner | Planning | Development validation | Arena | Arena result |
| --- | --- | --- | --- | --- |
| Clear direct baseline | 8.86 ms | none | 1,495.10 ms | passed |
| Clear candidate | 9.68 ms | 128.91 ms | 1,335.67 ms | passed |
| Divider direct baseline | 60.47 ms | none | 2,462.53 ms | failed |
| Divider candidate | 23.02 ms | 138.65 ms | 1,432.24 ms | passed |

Clear candidates make 52 configuration checks and create zero search nodes. Divider candidates make 2,747 checks and retain 92 nodes in every sample. The direct baseline performs no path search and has no development-validation stage. The obstructed baseline fails the task, so it is not an equivalent successful workload. Variation in host contention and controller dynamics prevents attributing the elapsed differences to one optimization.

The current planner skips allocating an empty WASM contact list when MuJoCo reports zero contacts. Configuration queries and IK updates read one writable coordinate view per query. Command tables reuse exact physics-clock targets across trials, while geometric queries retain moving-geometry membership and nearest-node scans avoid temporary difference vectors. [Simulation evidence](performance-simulation.md#exact-physics-clock-command-tables) records the command-table bounds and parity checks.

### Memory and cancellation

Median process RSS after clear samples is 246.66 MiB for the baseline and 231.64 MiB for the candidate. After divider samples it is 248.77 and 251.73 MiB. Process high-water readings reach 249.19 and 251.89 MiB. These aggregate readings include MuJoCo, a live observer engine, test hosting, garbage collection and OS memory management. They are not per-plan allocation peaks or evidence of a memory saving.

The observer reads WASM backing capacity in both modes. It stays at 48.875 MiB for the baseline and grows to 70.4375 MiB for the candidate. The candidate's additional collision and development engines increase reserved physics memory. Each prepared command table separately holds at most 2.25 MiB of numeric storage, with at most two timestep entries for a live model and animation identity.

An active divider search schedules cancellation after 100 stop observations. The timer fires before a later collision batch and returns Stopped in 0.06 ms, after 258 total stop observations and 256 configuration checks. The synchronous baseline has no stop callback. This measures in-process cancellation, not browser worker termination.

The probe and raw results are `scratch/arm-comparison.test.ts`, `scratch/arm-comparison-baseline.json` and `scratch/arm-comparison-candidate.json`. Logs are `scratch/arm-comparison-final-baseline.log` and `scratch/arm-comparison-final-candidate.log`. Original baseline sources are retained under `scratch/original*.ts`. These ignored files are session evidence rather than committed fixtures.

### Generated request timing

The ten generated matrix requests now last seven seconds. Their geometry, actual starting and target configurations, authored limits, 5 mm tolerance, 0.5-second dwell, one-second endpoint hold, eight development draws and all 96 Arena tries are unchanged. Physics remains at 2 ms and 1 ms in the half-step trials. The five-second test deadline is unchanged. The requests require reaching the same target three seconds earlier than the initial ten-second fixtures.

The first six-second probe was refused by the existing speed bound for shelf, cabinet, long tool and asymmetric chains. Bounded corner relaxation reduced their measured movement and corner-hold costs to 5.76, 5.73, 5.19 and 5.05 seconds. A one-second endpoint hold remains additional. Seven seconds accommodates these bounded candidates. This observation does not establish a globally shortest path. The probe is `scratch/arm-motion-costs.test.ts`, with results in `scratch/arm-motion-costs.json`.

The generated workload therefore simulates less time while requiring faster tracking. It is not a same-workload speedup measurement. Ten-second prompt, rotated-fixture, browser and native replay requests retain longer-horizon coverage. The first complete normal-concurrency selection passed 2,045 tests with one existing skip in 43.90 seconds. The log is `scratch/check-empty-contacts-full.log`. The final source check passed the same selection at normal concurrency in 44.04 seconds, with the same existing skip, recorded in `scratch/check-final-acceptance.log`.

### Earlier deadline and geometry observations

Closed attempt #1837 passed a serial local selection but failed shelf and cabinet under normal concurrency. Later retained ten-second checks also failed shelf, cabinet and bins. On main at `23297fb72`, those cases took 5,253, 7,062 and 5,889 ms against the unchanged five-second deadline. The log is `scratch/check-current-main.log`. The host observation in `scratch/current-host-observation.json` does not establish a cause or a missing capability.

A four-sample cabinet probe alternated the default island setting with island detection disabled. All samples passed Arena, but the small timing difference did not establish a stable gain. No solver-setting change is retained. Native box emission caused existing rover regressions and did not resolve arm deadlines, so all experimental collider changes were removed. [Testing evidence](testing-skills.md#obstacle-aware-arm-planning) records those limits. Model XML, contact masks, exclusions and validation draws retain their existing definitions.
