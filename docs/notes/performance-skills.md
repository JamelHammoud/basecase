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
