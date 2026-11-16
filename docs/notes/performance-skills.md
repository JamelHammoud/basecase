# Skill feasibility and moves performance

Implementation: [Skill feasibility and moves](../guide/skills.md#performance-skill-feasibility-and-moves). Shared requirements: [Performance](../guide/performance.md).

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
