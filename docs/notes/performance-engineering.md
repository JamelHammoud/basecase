# Engineering calculations performance

Implementation: [Engineering calculations](../guide/build.md#performance-engineering-calculations). Shared requirements: [Performance](../guide/performance.md).

## Payload maps prepare gravity loads once

`payloadRotation.test.ts` compares complete maps through mixed joints, zero and nonfinite loads, source edits and floor changes. Its six-link, 300-sample fixture reduces mass reads from 6,300 to six and limit reads from 1,800 to six. Its twelve-link, 600-sample fixture reduces mass reads from 46,800 to twelve and limit reads from 7,200 to twelve. Rejected and zero-sample maps read neither value. These are operation counts, without timing assertions or a claim about complete Checks time.

## Subset searches retain indices instead of recursive copies

`combinations.test.ts` checks every subset through ten items against an independent bitmask oracle, plus lazy reads, retained results, interleaved traversals and edited inputs. A scratch comparison matched all three previous enumerators across 231 size and count cases. On complete 300- and 600-item selections, each previous enumerator starts 300 and 600 array iterators for recursive copies. The shared traversal starts none. These are operation counts, without timing assertions or a claim about complete fitting or planning time.

## Torque-speed diagnostics retain only emitted samples

`torqueSamples.test.ts` compares complete outputs across 120 generated channel pairs and 13 settling offsets, plus nonfinite inputs, source edits and independent results. Its 300- and 600-window fixtures reduce source-value reads from 600 and 1,200 to 300 and 600. These are operation counts without timing assertions or a claim about complete simulation time.

## Holding loads project without temporary vectors

`holdingTorque.test.ts` checks physical load directions, 1,200 generated loads and subsequent edits, source preservation, signed zeros and nonfinite coordinates. Its 300- and 600-load fixtures reduce temporary lever and moment vectors from 600 and 1,200 to zero. These are operation counts, without timing assertions or a claim about complete check time.

## Power-source searches share actuator and regulator preparation

`servoPowerSelection.test.ts` compares complete source, rail and voltage results across 300 catalog mixtures, reversed inputs, later edits and voltage boundaries. Its 300- and 600-source fixtures with 20 servos reduce actuator-model lookups from 6,000 and 12,000 to 20, and regulator scene scans from 300 and 600 to one. Directly compatible sources prepare no regulator list. These are operation counts without timing assertions or a claim about complete check time.

## Arm sizing retains shoulder distance bounds

`armSearch.test.ts` checks candidate order after rejected confirmations, translated and turned bases, edited inputs, empty targets and unreachable-target blame. Its three-target fixture reduces distance calculations from 32,448 to 2,355, and its 600 mm target fixture from 86,672 to 2,946. A scratch comparison matched 52 complete results and candidate sequences against the previous calculation. These are operation counts and result comparisons, without timing assertions or a claim about complete sizing time.

## Payload poses share each hinge rotation

`payloadRotation.test.ts` compares complete poses and payload maps against the previous calculation across mixed joints, zero axes, changed inputs and floor rejection. Its six-link, 300-sample fixture reduces sine and cosine calls from 17,100 each to 1,800 each. The twelve-link, 600-sample fixture reduces each from 133,200 to 7,200. Prismatic chains call neither function. These are operation counts, without timing assertions or a claim about complete check time.

## Analytic arm reach shares elbow-branch calculations

`armReach.test.ts` checks branch order, generated tool targets, joint margins, full extension, refusals, source preservation and calculation counts. A seeded scratch comparison matched 12,169 planar results and 300 target-pose results exactly against the previous solver. On its 300- and 600-query fixtures, inverse-cosine calls fell from 13,420 and 22,610 to 6,720 and 11,326. Two-argument arctangent calls fell from 27,140 and 45,820 to 3,088 and 4,938. These are operation counts, without timing assertions or a claim about complete arm-sizing time.

## Planar hulls share one traversal

`convexHull.test.ts` checks outline order, enclosure, source preservation and degenerate inputs. `supportMargin.test.ts` checks signed distances and the single-contact refusal.
