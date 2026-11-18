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

Measured on 18 November 2026 on an Apple M5 Pro with Node 26.13.0. The baseline is `raceIk.ts` from main at `194746904`, before this change. The candidate uses the same generated three-joint divider fixture, initial shoulder -60 degrees and target +60 degrees. The clear control removes only the fixed divider. Both use a ten-second task and the same Arena contract and fixed comparison salt. Each mode runs in a fresh process with the same module imports and three samples per geometry. The first sample includes cold setup. Values below are medians, not a statistical speed claim.

| Geometry and planner | Planning | Development validation | Arena | Arena result |
| --- | --- | --- | --- | --- |
| Clear baseline | 9.25 ms | none | 1,481.62 ms | passed |
| Clear candidate | 10.90 ms | 191.77 ms | 1,517.78 ms | passed |
| Divider baseline | 63.22 ms | none | 2,482.50 ms | failed |
| Divider candidate | 28.54 ms | 204.34 ms | 1,565.05 ms | passed |

The clear candidate performs 52 configuration checks and creates zero search nodes. The divider performs 2,747 checks and retains 92 tree nodes in every sample. The baseline performs no path collision search. The blocked baseline and candidate do not provide equivalent behavior, so their timings do not establish an efficiency gain. Clear requests retain the direct geometry path but pay for collision validation, timed tracking and the eight development trials. Median complete clear validation costs about 230 ms more than the baseline. No deadline or retry was added.

Memory readings cover the complete planning and validation process, including MuJoCo, the test host and unreclaimed JavaScript allocations. The baseline's median resident size after the clear case is 217.20 MiB, versus 248.84 MiB for the candidate. For the later divider samples it is 253.31 MiB versus 252.22 MiB. These process readings are not per-plan allocation peaks or evidence of a memory saving. Baseline WASM capacity stays at 34,537,472 bytes. The candidate grows to 51,249,152 bytes during the clear samples and stays there through all divider samples. The additional simultaneously live collision and trial engines increase the reserved working set by about 16 MiB in this observation. The test records before and after RSS and process high-water readings as well as WASM backing-buffer capacity.

Cancellation was requested after 100 stop observations during an active divider search. The candidate returned Stopped in 1.29 ms, with 258 observations total. The baseline has no in-process stop callback. Browser cancellation terminates the existing worker for both paths, so this number does not compare browser termination latency.

The motion budget remains 65,536 configuration checks. Each segment makes at most 4,096 sampling attempts and each tree pair stores at most 4,096 nodes, with at most 12 coordinates per node. Search samples require 4 mm clearance. Proximity contacts out to 25 mm permit larger free-space steps while retaining a 2 mm transition reserve. The search yields every 128 checks using a message channel in browsers and the immediate queue in Node. A pending timer is included in the measured cancellation latency. Linear control endpoints are prepared once for physics playback. Draft-to-race reuse avoids a second identical search when the bounded candidate matches model inputs and seed, while every physical and Arena trial still runs. Physical trials retain the original timestep and inspect clearance after every integration step. Corner holds and deterministic shortcuts fit inside the original requested horizon.

Raw local evidence is retained in `scratch/arm-benchmark-baseline.json` and `scratch/arm-benchmark-candidate.json`, produced by `scratch/arm-benchmark.test.ts`. These ignored files are session evidence rather than repository fixtures. Committed `armPlanningMatrix.test.ts` and `armMotionReplay.test.ts` retain the production and native replay workloads. Linux and Windows execute through existing CI. No Linux or Windows timing observation is claimed here.

An early full changed-file run took 62.63 seconds across 310 files, with 2,025 passing tests, one existing skip and four generated positive cases timing out. Isolated matrix and lifecycle checks passed their assertions. This established contention sensitivity, without isolating its cause or establishing CI throughput. Later local observations retain every original assertion and deadline.

The local 18-worker check encountered memory pressure and unrelated Motor Kit deadlines as well as matrix deadlines. A diagnostic comparison with earlier requested completion times did not resolve this. All ten-second requests and physical bars are preserved. A four-worker local invocation did not resolve the matrix deadlines. The single-worker local check passed all 2,029 tests in 249.44 seconds of Vitest time, with one existing skip. This is a slower local check than the failed parallel invocations, chosen after observed failures. It adds no repository wait, retry or deadline. It completed the checks without another implementation recovery. It does not establish a production speedup or CI throughput. [Current acceptance evidence](testing-skills.md#obstacle-aware-arm-planning) records host observations and the final related-check result.
