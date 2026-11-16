# Motion fitting and retargeting performance

Implementation: [Motion fitting and retargeting](../guide/joints-and-motion.md#performance-motion-fitting-and-retargeting). Shared requirements: [Performance](../guide/performance.md).

## Robot landmarks select joint extrema without sorting

`robotLandmarkSelection.test.ts` checks mapping, branching chains, edits, source preservation and complete landmark carriers. Its 300- and 600-joint fixtures require one depth read per joint for automatic mapping, one per eligible descendant for limb-end selection and one per named candidate for each head or torso selection. These are operation counts, without timing assertions or a claim about complete retargeting time.

## Skeleton sizing measures link geometry once

`skeletonLinkMeasure.test.ts` compares 600 seeded measurements with the previous calculation, plus empty, coincident and nonfinite inputs, source preservation and edited inputs. Its 300- and 600-link sizing fixtures reduce endpoint-list construction from 1,200 and 2,400 calls to 300 and 600. These are operation counts without timing assertions or a claim about complete sizing time.

## Retargeting prepares landmark carriers once

`retargetCarriers.test.ts` checks those rules, missing parts, independent preparation and unchanged carriers through moving frames. A scratch comparison matched 120 complete frame results across full-body, upper-body, in-place and inferred-wrist streams. On the 29-joint fixture, 30 full-body frames reduce ownership-map traversals from 390 to zero, and upper-body frames from 210 to zero. These are traversal counts, without a timing assertion or a claim about total retargeting speed.

## Motion fitting prepares shared channels once

`motionSkeletonSource.test.ts` checks branching chains, seam crossings, static rotations, limb selection, source preservation and changed samples across calls. The 12- and 24-endpoint fixtures each require nine shared-root rotation lookups. A scratch comparison matched the previous complete chain output exactly in 63 cases across eight BVH fixtures, three scales and endpoint selections. On the nine-frame shared-torso fixture, torso rotation lookups fell from 20 to 10. These are operation counts, without timing assertions.

## Motion fitting indexes bone positions once

The branching fixture in `motionSkeletonSource.test.ts` has one shared root, one moving root channel, one static root channel and one moving channel per endpoint. Each clip has four frames. A proxy counts numeric reads from the source bone list, including endpoint selection and index preparation. At 100 and 200 endpoints, the previous implementation read 15,651 and 61,301 entries. The indexed implementation reads 202 and 402. The committed test allows fewer than four reads per source bone and checks every generated axis identity.

The same test covers duplicate names, missing ancestors and changed source ordering between calls. Existing cases cover static-channel orientation, seam crossings, selected limbs, shared channels and source preservation. A scratch comparison matched complete chain outputs against the previous implementation for all seven BVH generators in `motionSkeleton.fixtures.ts`, at scales 0.1, 1 and 100 with four limb selections, totaling 84 comparisons. Both branching fixture outputs also matched exactly. These are operation counts and result comparisons, without timing assertions or a claim about total fitting speed. The index retains one entry per distinct bone name for one call.

## Ordered motion samples use binary lookup

The lookup test bounds a 65,536-key search to 17 timestamp reads, and motion sampling tests bound the full animation and route calls without wall-clock assertions.

## Skeleton operations index the hierarchy once

`skeletonHierarchy.scale.test.ts` bounds full-list reads on 100- and 200-joint chains, including a leg chain, and on wide drags. Before indexing, the 200-joint chain took 10,787,999 list reads for sizing, 40,400 for dragging and 80,200 for text. The tests now require fewer than 3,000, 1,600 and 1,000 respectively, including their source-preservation assertions. These are operation counts, without timing assertions.

## Motion fitting summarizes channels without temporary arrays

`motionSkeletonStats.test.ts` checks exact agreement with the previous calculation across 80 seeded multi-joint trajectories, short and missing samples, signed zero, nonfinite values, changed inputs and four complete BVH fits. A 160,000-frame fixture checks summaries beyond ordinary argument-spread limits. These checks cover summary storage and results, without timing assertions or a claim about complete fitting time.


## Ancestor chains append before reversing

The whole-app `unshift` search found four ancestry constructors: motion source axes, skeleton leg sizing, Payload links and Case arm facts. Each now appends while walking toward the root and reverses its owned ancestor array once. Queue priority, trace display and byte encoders are separate uses and retain their front insertion. No persistent cache or shared array is introduced.

For n retained ancestors, front insertion moves n(n−1)/2 existing elements. Appending followed by reversal takes linear array work. This changes chain construction only. Hierarchy traversal, descendant collection and the complete sizing or fitting calculation can still do more work.

A local Node v26.13.0 microbenchmark on Apple M5 Pro compared numeric chain construction with the old front insertion and the new append-and-reverse pattern. It checked equal ordered results for every length from 0 through 2,048. Each timing is the median of five batches after warming both implementations.

| Chain length | Chains per batch | Front insertion ms | Append and reverse ms |
| --- | --- | --- | --- |
| 32 | 62,500 | 25.012 | 3.072 |
| 256 | 7,812 | 41.405 | 4.163 |
| 2,048 | 976 | 163.217 | 4.338 |

These isolated construction timings exclude map lookups, joint filtering, transforms and downstream calculations. They are local measurements, not complete interaction timings or CI budgets. The throwaway benchmark and raw output stay in `scratch/ancestor-chains.mjs` and `scratch/ancestor-chains-results.jsonl`.

`motionSkeletonSource.test.ts` checks root-first axis identities through 1, 16 and 64 ancestor links, unchanged parent maps and repeated results. Existing motion channel tests cover shared static orientations and branching endpoints. `skeletonHierarchy.scale.test.ts` and `skeletonSizing.test.ts` cover hierarchy sizing and load calculations. `payload.test.ts` checks complete Payload reporting. `robotFit.test.ts` checks branch priority, ordered movable chains, fixed terminal hands and edited ancestry. No browser flow or visible control changes.


### Help coverage verification

The three help articles flagged by preflight were reread against the final ancestry changes. None needs a text or screenshot update:

- [Cases](../../site/content/help/cases.md): `chainOf` still excludes fixed and passive joints and returns the same root-first chain. Arm selection, shoulder anchor and reach calculations are unchanged, preserving the slot and world-scaling descriptions.
- [Get a robot ready to build](../../site/content/help/get-a-robot-ready-to-build.md): `chainTo` returns the same ordered movable links. Powered-chain eligibility, Payload values, shading and controls are unchanged, preserving step 9 and the Payload screenshot.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md): `ancestors` returns the same root-first bone names and stops at the same repeated name. Motion axes and their accumulated orientations are unchanged. The guide addition describes implementation work only, preserving the article's hierarchy and Design From Motion descriptions.

Preflight reports unchanged covered articles without comparing their claims. These three reminders remain in its output after verification. No article was edited solely to suppress a reminder.
