# Motion fitting and retargeting performance

Implementation: [Motion fitting and retargeting](../guide/joints-and-motion.md#performance-motion-fitting-and-retargeting). Shared requirements: [Performance](../guide/performance.md).

## Frame ankle minima use direct landmark reads

A whole-app search for `lowestAnkle` and ankle-height lists found one per-frame human ankle minimum in `utils/retargeter.ts`. Live mocap and BVH import share `createRetargeter`. Imported-clip grounding consumes these heights later and already accumulates its cross-frame minimum directly.

The previous calculation allocated a two-key array, a two-entry mapped-height array and a filtered array for every emitted frame. Direct left and right map reads now remove all three arrays, retaining the same two map lookups. At 30 frames per second this removes 90 temporary arrays per second per stream. These are code-derived allocation counts, without a timing assertion or a claim about complete retargeting speed.

`retargeter.test.ts` exercises all 64 ordered pairs from eight heights through one initialized stream: missing, negative, positive, positive zero, negative zero, positive infinity, negative infinity and NaN. It compares the reported height with the previous equations using `Object.is`, checks source preservation and retains upper-body root behavior. Existing tests compare complete stepped BVH output with batch retargeting, and `mocapRetarget.test.ts` retains complete full-body and trimmed in-place snapshots. No quarantine applies.

The covered [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) and [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) articles retain accurate import, matching and playback instructions. This changes no label, action or screen state, so their prose and screenshots remain unchanged.

## Motion scaling scans rest bounds directly

The whole-app search for `motionScale` and rest-pose extent calculations found one motion-to-skeleton scale function. Both file import and the agent reach it through `motionSkeleton.ts`, which calls it during validation and chain preparation. Other height calculations measure different inputs.

Each call previously copied n rest-point references, allocated three n-coordinate arrays and a three-span array, and scanned each coordinate array for both extrema. It now visits the map once and expands one local three.js box. Temporary storage is constant instead of proportional to n. The existing three.js primitive supplies the min and max operations, and direct subtraction avoids its empty-box size special case. There is no retained cache.

`motionScale.test.ts` compares exact results with the previous calculation for 69 rest poses and six requested heights. Cases include empty, coincident, horizontal and nonfinite poses, signed zero, both sides of the vertical threshold, source preservation and later edits. A separate 160,000-point case checks the known scale without argument spreading. Existing motion fitting tests retain full BVH-to-skeleton coverage. These are code-derived storage counts and correctness checks, without timing assertions or a claim about complete fitting speed. No quarantine applies.

This changes no user action, label or screen state. The motion import and fitting descriptions in [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) remain accurate, so that article and its screenshots remain unchanged.

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

## Motion channels unwrap directly from sampled frames

The whole-app search found one angle-unwrapping routine, in `utils/motionSkeletonSource.ts`. File imports and the agent both reach it through `motionChains`. This changes source-channel preparation, while fitted trajectory summaries and live retargeting keep their existing calculations.

The sampler reads each channel directly from the sampled frames, appending its continuous angle and accumulating minimum and maximum in the same pass. Shared endpoint chains still reuse one channel array per bone. For C channels and F frames, this removes C temporary raw-angle arrays containing C × F entries and two later extrema scans containing 2 × C × F visits. The retained channel values and sampled frame maps remain necessary. These are code-derived storage and traversal counts, without a timing assertion or a claim about complete fitting time.

`motionChannelSamples.test.ts` compares exact unwrapped values and static-channel exclusion with the previous arithmetic across 100 seeded clips and ten boundary fixtures. It covers seam crossings, positive and negative half turns, multiple revolutions, signed zero, missing and nonfinite samples, unchanged source data, changed clips and independent results. Its 160,000-frame fixture checks the shared chain output beyond the old argument-spread limit. On local macOS arm64 with Node 26.13.0, the previous `Math.max(...values)` range calculation throws `RangeError: Maximum call stack size exceeded` at that size. Existing `motionSkeletonSource.test.ts` covers shared endpoint channels, orientation and current bone identities. No quarantine applies.


## Motion clip grounding prepares soles once

The whole-app search for `groundFeet`, `lowestAnkle` and `soleRefs` found one clip-grounding pass in `mocapRetarget.ts`. It now delegates to `mocapGround.ts`. Live retargeting reports ankle height but does not run this imported-clip correction. No second grounding implementation needs this preparation.

For F frames and S soles, the previous pass allocated F × S transform vectors, one F-entry ankle-height array and F S-entry sole-height arrays. It also read sole ownership F × S times. The new pass allocates one transform vector and S carrier records, reads ownership S times and scans the same minima directly. Forward kinematics still builds each frame's posed rig. These are code-derived allocation and lookup counts, without timing assertions or a claim about complete import speed.

`mocapGround.test.ts` compares complete corrected frames against the previous equations for 80 deterministic four-frame clips. It varies sole carriers, root translations and rotations, joint poses, contact thresholds and fallback to the root for an unowned sole. It checks source sole preservation and independent clip results. Additional fixtures cover empty clips, signed zero and nonfinite ankle heights. A spy checks one ownership lookup for one sole across four frames, down from four lookups in the reference calculation. Existing `mocapRetarget.test.ts` snapshots retain full animation, error and mapping coverage for full and trimmed in-place BVH imports. No quarantine applies.

The covered help articles, [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), were checked against this change. Import steps, labels, matching behavior and screenshot states remain accurate. The animation article now lists the extracted `mocapGround.ts` module in `covers`, so later grounding changes trigger its coverage check. This preparation changes no user action or screen state, so article prose and screenshots remain unchanged.

## Retargeting prepares the rest-body inverse once

The whole-app search for `bodyBasis`, `RestBody` and rest-basis inversion found one tracked-body rotation consumer in `utils/retargeter.ts`. BVH streams with supplied root quaternions bypass it. Live streams without supplied rotations use it after either explicit rest-pose initialization or steady-frame calibration. Other rest inversions belong to simulation world movers and camera variation, with different input lifetimes.

Previously, every tracked frame cloned and inverted its calibrated basis. Now calibration owns one inverse quaternion and each frame multiplies its fresh current basis by it. Multiplication order and quaternion arithmetic stay identical. Missing basis keys still return no rotation, and tracking loss still holds the preceding root. Each retargeter establishes its own inverse, without a persistent shared cache.

A local Node comparison exercised 100 normalized rest quaternions and 300 normalized current quaternions per rest pose. All 30,000 quaternion products matched exactly. The previous calculation performed 30,000 rest-quaternion clones and inversions. Preparation performed 100 inversions and no rest-quaternion clones during frames. These are isolated operation counts, without timing assertions or a claim about complete retargeting speed. The probe stays in `scratch/rest-basis-probe.mjs`.

`retargeter.test.ts` checks relative root headings from rest headings of 0, 20 and −60 degrees. It covers repeated turns, tracking loss, recovery and unchanged inverse coordinates. Existing cases retain BVH batch parity, live steady-frame calibration, upper-body isolation and missing-limb holds. No quarantine applies. This changes no user action, label or screenshot state, so no help or screenshot update is needed.

The preflight coverage reminder for [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) was checked against the final diff. The article covers the owning guide. Its joint fields, import paths, hierarchy, modeled-pose behavior, IK targets and selected-robot BVH behavior are unaffected by preparing a tracked rest-body inverse. It has no live-calibration instructions or screenshots to revise. The article remains unchanged because every described behavior and label still holds.

## Mass centroids accumulate in one pass

A whole-app search for weighted centroid reductions found repeated scans in skeleton distal-mass sizing and URDF link inertials. Both now accumulate total mass and three coordinate sums together. Engineering `massOf` already uses this approach. Link geometry measurement has its own length-weighted endpoint accumulator and needs no change.

For N point masses with K eligible distal masses, each sized joint previously filtered N records and traversed K records four times. It now visits N records once, without the K-entry filtered list. For M link masses, URDF centroid preparation now visits M records once instead of four times. The inertia pass still runs separately because it needs the final centroid. These are code-derived traversal counts, not measured application timings. Overall sizing still computes descendant radii and visits point masses per joint.

The local `scratch/mass-centroids.test.ts` probe compares complete sizing outputs and complete link inertials against copies of the previous modules. It passed 200 deterministic branching and linear skeleton fixtures with varied geometry, zero link masses and payloads, plus 200 link collections with optional payloads. Empty links and negative, zero, NaN and infinite masses also matched. Skeleton inputs stayed unchanged. Each coordinate retains source-order summation and multiplication order. Existing sizing, motion design, package and body-calibration tests provide retained integration coverage. No quarantine or timing assertion was added.

No label, user action or screen state changes. The help articles for skeleton sizing and Robot Package export retain their existing steps and screenshots.

The final focused check passed formatting, ESLint, docs, site copy, types and all 215 tests across 28 related files. Copy diff reported zero added, changed or removed strings. Preflight raised three coverage reminders. All three articles were reread against the final code and remain unchanged intentionally:

- [Import a robot](../../site/content/help/import-a-robot.md) describes import sources, robot selection, insertion, retained link data and archive limits. The changed `linkInertial` routine prepares exported inertials, without changing import parsing, controls or the four illustrated import states.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) describes joint fields, import paths, skeleton torque margins, hierarchy, posing and IK. Centroid preparation preserves the sizing outputs behind those margins. Joint declarations, simulation eligibility and posing are untouched. This article has no screenshots.
- [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md) describes link validation, missing descriptions and meshes, archive limits and passive-joint behavior. Neither centroid change affects those errors or their recovery steps. This article has no screenshots.


## Live calibration retains a circular pose window

A whole-app search for `calibrator` and `steadyMean` found one live rest-pose window, shared by all `createRetargeter` streams without an explicit rest pose. Other rolling histories retain different signals and have separate expiry rules.

After a window fills, each incoming pose now replaces one reference and advances the oldest-frame index. Previously it appended a reference and shifted the full window. At the default ten frames, this removes nine retained-reference moves per incoming frame. Storage remains ten frame references. Means still accumulate in chronological order through two contiguous ranges, without per-landmark modulo operations. Key order still comes from the oldest frame, and side-pair validation still uses the newest frame.

These are code-derived operation counts, without timing assertions or a claim about complete retargeting speed. Mean construction and stability checks still visit the entire window. `retargetBody.test.ts` compares 400 rolling results with fresh chronological windows of one, two, three and ten frames. The 100-frame source includes moving outliers, changing keys and reversed map insertion order, and checks unchanged source vectors. Existing tests cover expiry, shoulder-only frames, nonfinite positions, threshold boundaries and owned result vectors. No quarantine applies.

This changes no user action, label or screen state. Motion capture help steps and screenshots remain accurate.

Preflight flagged [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), which covers the edited guide. Its joint fields, import paths, hierarchy, posing and IK descriptions were checked against this diff and remain accurate. It describes no live-calibration steps or screenshots, so it remains unchanged intentionally.

## Motion limb requests normalize once per selection

A whole-app search for `motionLeaves`, `includeLimb` and the compact-name expression found one endpoint-selection implementation. Both validation and chain generation in `motionSkeleton.ts` call it, covering file import and agent fitting. Bone landmark matching uses different naming rules and remains separate.

Requested limb names now normalize once before endpoint filtering, rather than up to three times per request for every eligible endpoint. The prepared list belongs to one call. Endpoint names still normalize only when filtering is active, and endpoint-owner resolution, limb classification, matching and output order retain their preceding rules.

The 100- and 200-endpoint fixtures in `motionSkeletonSource.test.ts` use requests `missing` and `ARM`. Source request reads fall from 200 and 400 to two in each case. Code-derived request normalization counts fall from 500 and 1,000 to two. Endpoint-name normalization remains one per eligible endpoint. These are operation counts, without timing assertions or a claim about total fitting speed.

Complete-chain comparisons cover omitted and empty selections, exact names with case and punctuation, sided and unsided arm aliases, unmatched and punctuation-only requests, endpoint owners and edited selections between calls. Existing cases retain shared channel, source preservation and ordered axis coverage. No quarantine applies.

No user action, label or screen state changes. [Design a robot from a motion clip](../../site/content/help/design-a-robot-from-motion.md) retains accurate instructions and screenshots.


## BVH playback groups rotation channels once

A whole-app search for `bvhRotations`, `MOTION` and `Frame Time:` found one raw BVH rotation reader, in `utils/mocapChannels.ts`. `parseBvh` prepares it for every imported clip, and motion fitting consumes its sampled rotations. Imported motion retargeting samples positions and root quaternions through three.js instead, so it does not benefit from the rotation sampling change.

Import now groups axis and source-column records by bone name once. Sampling builds each bone's fresh rotation list directly. For B bones with three rotation channels each, one frame previously made 3B result-map reads and 3B writes. It now makes no result-map reads and B writes. The prepared groups live with their parsed clip. Result maps, lists and rotation records remain independent across samples. Source-column offsets, bone insertion order and duplicate-name channel order stay unchanged.

A local macOS arm64 run on Apple M5 Pro with Node v26.13.0 compared the previous and current samplers on generated 100-frame clips with three rotation channels per bone. Each implementation had two warmup batches, then 11 alternating measured batches of 10,000 samples. Median times were 14.862 ms before and 7.539 ms after for 30 bones, and 59.769 ms before and 28.890 ms after for 120 bones. Complete outputs matched at seven times covering ordinary frames, rounding, clamping and NaN. These isolated sampling measurements exclude file parsing, position sampling and fitting, and establish no complete import timing or CI budget. The probe and raw results stay in `scratch/bvh-channel-groups.mjs` and `scratch/bvh-channel-groups-results.json`.

`mocapChannels.test.ts` checks mixed translation and rotation channels, nonstandard axis order, repeated bone names, translation-only bones, signed zero, nonfinite and missing values, frame rounding and clamping, changed imports and independent sampled outputs. Existing motion fitting tests exercise the sampler through complete BVH pipelines. Retargeting tests cover imported clip preparation and position-based animation output. No quarantine applies.

No label, action or screen state changes. The covered [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) article retains its joint fields, hierarchy, posing and motion-fitting instructions. Motion import and animation help steps and screenshots remain accurate.
