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
