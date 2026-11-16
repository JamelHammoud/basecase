# Joints and kinematics performance

Implementation: [Joints and kinematics](../guide/joints-and-motion.md#performance-joints-and-kinematics). Shared requirements: [Performance](../guide/performance.md).

## Import path sorting prepares depth once per candidate

The whole-app search found depth-and-lexical path sorts in robot entry selection, XML peeks, xacro peeks and LeRobot root discovery. All four share `utils/pathsByDepth.ts`. Each sort splits each candidate once before comparing numeric depths. The rosbag2 first-shallowest reduction and GitHub search scoring do not sort paths and remain unchanged.

On November 15, 2026, a scratch comparison on Node 26.13.0 counted slash-delimited `String.split` calls during complete robot entry selection and LeRobot root discovery. Repository fixtures reverse 300 or 600 paths, distribute them across eleven depths and permute their numeric names. Complete before and after results matched for XML, xacro, URDF and dataset fixtures.

| Candidates | Discovery | Before splits | After splits |
| --- | --- | --- | --- |
| 300 | XML | 4,255 | 324 |
| 300 | xacro | 4,471 | 492 |
| 300 | URDF | 4,485 | 300 |
| 300 | LeRobot | 4,184 | 300 |
| 600 | XML | 9,623 | 624 |
| 600 | xacro | 9,839 | 792 |
| 600 | URDF | 10,153 | 600 |
| 600 | LeRobot | 9,552 | 600 |

These are operation counts without timing assertions or a claim about complete import latency. Each split still allocates its segments. Ranking adds one depth record per candidate, and sorting, lexical comparisons, retained-path arrays and file decoding remain. XML and xacro counts include subsequent candidate selection and filename parsing.

`robotImport/entry.test.ts` checks the 24-file XML and 48-file xacro read limits, ordered shallowest choices and unchanged input, alongside existing description priority, include and scope cases. `datasets/import/sourceKind.test.ts` checks LeRobot root precedence across mixed formats, rotated inputs, added and removed roots and unrelated filenames. Existing reader tests cover complete dataset import. No UI state, workflow or quarantine changes.

## Xacro tokenization prepares its end once

`xacroExpr.test.ts` covers arithmetic, short-circuiting, allowed functions and rejected syntax, plus leading, internal, trailing and Unicode whitespace, quoted spaces, whitespace-only input, invalid tokens after whitespace, recovery after failures and the original 4,000-character limit. Existing `xacro.test.ts` and `xacroImport.test.ts` cover expansion and imported robot equivalence.

On macOS arm64 with Node 26.13.0, a scratch comparison evaluated sums of 100 and 500 ones, with either no padding or 2,000 trailing spaces. Each implementation had two warmup batches and eleven alternating measured batches of 100 evaluations. Results matched the term count in every evaluation. Median milliseconds per complete evaluation were:

| Terms | Trailing spaces | Before | After |
| --- | --- | --- | --- |
| 100 | 0 | 0.0311 | 0.0268 |
| 100 | 2,000 | 0.3183 | 0.0311 |
| 500 | 0 | 0.1301 | 0.1260 |
| 500 | 2,000 | 1.5485 | 0.1304 |

The previous tokenizer trimmed the remaining suffix before every token, repeatedly scanning the same trailing whitespace. The new tokenizer trims the end once and retains the original text for token reads and errors. These local shared-host measurements include parsing and evaluation, with no CI timing threshold or claim about complete robot import time. The padded expressions expose repeated work rather than representing a measured distribution of imported files.

## Planar diameter measures each unordered pair once

[`planarDiameter.test.ts`](../../src/utils/planarDiameter.test.ts) compares ordered-pair results across generated clouds, edits, repeated points, extreme values and nonfinite coordinates. Four-bar fitting and resting foot-contact classification share the scan. At 12, 300 and 600 points, distance calls fall from 144, 90,000 and 360,000 to 78, 45,150 and 180,300. These are deterministic operation counts, independent of hardware, without timing assertions or a claim about complete fitting or classification time.

## Joint-axis clustering indexes shafts once per query

`axisClusters.test.ts` compares the previous scan across 160 generated fixtures in both source orders and checks geometric thresholds, nonfinite inputs, edits, source preservation and independent output arrays. Its two-pass fixtures over 300 and 600 shafts reduce shaft-id reads from 180,000 and 720,000 to 600 and 1,200. These are operation counts without timing assertions or a claim about complete axis-discovery time.

## Joint declarations index batch ids once

`merge.test.ts` checks ordered replacement against 120 mixed batches, source preservation and first-range history. Its 300- and 600-joint scene fixtures reduce id reads from 112,650 and 450,300 to at most 600 and 1,200. Full replacement reads no ids in the merge. `skeletonMerge.test.ts` checks changed offsets and axes, duplicate ids, replacement and later edits, bounding previous-id reads to at most twelve per source joint. These are operation counts and bounds, without timing assertions or a claim about complete declaration time. Other skeleton validation is unchanged.

## Axis discovery indexes candidate connections once

`jointGraph.test.ts` checks those contracts, metadata, unchanged inputs and edits, plus 80 comparisons against full-edge scans. Its 300- and 600-connection chain and star fixtures bound endpoint reads to 1,200 and 2,400. The full-scan reference exceeds 90,000 and 360,000 respectively. These are operation counts for graph orientation, without timing assertions or a claim about complete axis-discovery time. Pairwise cylinder matching remains quadratic in part count.

## Robot components receive ordered joints in one pass

`kinematicsRobotGroups.test.ts` checks interleaved robots, shared bases, duplicate names, empty input, edits, undo and source preservation. Its 300- and 600-robot fixtures previously required 95,098 and 370,198 joint-id reads. The tests bound those reads below 6,000 and 12,000. These are operation counts, without timing assertions or a claim that the whole rig builder is linear.

## Nearest joint-face picks reuse a query workspace

`meshIndex.test.ts` covers all seven closest-point regions, ties, degenerate and incomplete faces, welded coordinates, repeated queries and workspace reuse across 300 and 600 faces. A seeded scratch comparison matched 1,000 picks on a 5,000-triangle mesh. On macOS with Node 26.13.0, 20 picks took a median of 11.45 ms before and 5.24 ms after, over nine alternating measurements after three warmups. The former scan allocated 15,000 vertex tuples per pick, plus intermediate arrays. This measures nearest-face selection alone, without a CI timing assertion.

## Deleting parts prunes empty joint chains in linear work

`kinematicsRemoval.test.ts` checks the resulting joints and bounds array-length reads on a 600-joint chain, without a wall-clock limit. The previous repeated scans took 180,302 reads on that fixture.

## Joint renaming indexes each batch once

`kinematicsIds.test.ts` bounds id reads for two 600-joint copies and checks suffix collisions, parent links, linkage drivers and unchanged-list identity. The previous batch scans took 726,603 id reads on that fixture. Suffix availability checks still search for one suffix free across the whole batch.

## IK iterations reuse their Jacobian columns

`kinematicsJacobian.test.ts` checks finite-difference derivatives, exact columns, branched and mixed joints, root transforms, changing points, topology edits, nonfinite inputs and independent workspaces. Across three targets, six joints and 300 updates, ancestry reads fall from 5,400 to three and column or offset clones from 9,000 to zero, using 18 persistent column vectors. Twelve joints and 600 updates reduce those reads from 21,600 to three and clones from 36,000 to zero, using 36 column vectors. Axis construction remains unchanged. A scratch comparison matched 361 complete solver results exactly across weighted targets, pose preferences, joint restrictions, unreachable targets, root transforms, geometry edits and iteration limits. These are operation counts and numerical comparisons, without timing assertions or a claim about complete solve time.

## IK trials copy their matrix once

`kinematics.test.ts` checks mixed joints, root transforms, weighted targets, pose preference, excluded joints and unchanged inputs. Its locked-joint fixtures force six rejected steps: copied matrix values fall from 768 to 384 for eight joints and from 3,072 to 1,536 for sixteen joints. These are operation counts, without timing assertions.

## Joint frame resolution shares mount transforms

`kinematicsFrames.test.ts` checks rotated pivots and axes, moved mounts and undo, missing frames and unchanged-list identity. Its 600 joints on three interleaved mounts read three transforms, down from 600, without a timing assertion.

## Rig group adoption indexes groups once per pass

`kinematicsGroups.test.ts` checks assignments and bounds group-property reads below 12,000 for 600 parts in one or 200 groups, with moving links and base-only mounts. The moving-link fixtures previously took 719,999 and 481,000 reads.

## Four-bar derivative probes share residual storage

`linkageClosure.test.ts` compares all path errors and nine penalties against the previous calculation across 200 generated trials and their edits. It also checks changed bounds and workspace lengths, independent result ownership, failed closures, tangencies and nonfinite inputs. Existing linkage pipeline tests cover complete synthesis and ranking.

For five- and twelve-point paths, the Jacobian probes 14 and 21 parameters. The previous residual assembly constructed six arrays per probe: path errors, three other links, four links, mapped link penalties, bound penalties and the concatenated result. The new assembly constructs one residual workspace per Jacobian, replacing 84 and 126 arrays respectively. Decoded geometry, closure results and derivative columns still allocate. These are source-derived allocation counts, without timing assertions or a claim about complete synthesis time.

## IK reporting reuses accepted residuals

`kinematics.test.ts` compares returned residual lengths with independently transformed targets after zero, one and forty iterations. The fixture mixes weighted targets on two links with an unowned target under a rotated and translated root. Existing locked-joint cases exercise six rejected trials, while reachable, unreachable, restricted-joint and pose-preference cases cover accepted updates. Empty targets retain zero maximum error, and infinite and NaN target coordinates retain their corresponding error summaries.

A scratch comparison matched complete before and after results across 200 combinations of target positions, weights, iteration limits, joint restrictions, starting values and pose preferences.

The 300- and 600-target stationary fixtures count `Vector3.applyMatrix4` calls. Removing final residual reconstruction reduces transforms from 600 and 1,200 to 300 and 600. Source-derived allocation savings are two vectors and one residual record per target, plus one residual array per solve. Each convergence check also removes one temporary error array. Returned errors remain a fresh array, and solver trials and forward kinematics still allocate. These are operation and allocation counts without timing assertions or a claim about complete solve time.

Validation of this change passed formatting, lint, documentation, site copy and types. The related selection ran 532 test files: 528 passed, one was skipped and three failed at the existing 5,000 ms timeout. The timed-out cases were Hand Off in `cases/slots.test.ts:107`, the walker fall check in `sim/driveClasses.test.ts:122`, and exhaustive arm-grid search in `utils/armSizing.test.ts:77`. All 3,648 other tests passed, including the IK tests. The shared host was running another worktree's related-test selection concurrently. Host contention is a possible cause, not an established diagnosis. No timeout, retry or quarantine was changed, and this run does not establish a passing related selection.

## Four-bar path summaries accumulate during sampling

`utils/linkage.ts` no longer stores target errors before calculating maximum and RMS error. Across the fixed 72 candidates, that removes 72 error arrays containing 360 to 864 numbers for five- to twelve-point paths. Ranking also removes one sampled-point array and one distance array per candidate whose tie-breaking score is needed. A fully closed ranking sweep has 91 points. Point coordinates and closure geometry still allocate.

A scratch comparison matched complete synthesis results exactly against the previous implementation for four paths: a five-point line, a twelve-point transformed coupler curve, a wavy path and an out-of-range path. This includes returned geometry, crank ranges, maximum and RMS errors, transmission angles and candidate order. Existing `linkage.test.ts` covers recovered curves, error bounds, deterministic ordering, unreachable targets and point-count limits. `linkageDistance.test.ts` covers complete synthesis against independent segment-distance calculations.

These are source-derived allocation counts and result comparisons, without a timing assertion or a claim about complete synthesis speed. The sampled curves used for nearest-segment scoring remain necessary and are retained.

## Four-bar damping trials reuse their elimination buffer

`dampedSteps.test.ts` compares six damping trials with independent square-system solves and retains every output through subsequent trials. A dependent two-column system checks recovery after elimination fails at the second pivot, repeated zero damping and interleaving with another prepared system. Existing linkage tests cover complete synthesis, ordering and path scores.

For five- and twelve-point paths, the normal system has 14 and 21 parameters. Its augmented Float64 matrix holds 210 and 462 values, or 1,680 and 3,696 bytes. Six trials previously allocated six elimination buffers. They now allocate one per prepared system, removing 8,400 and 18,480 bytes of matrix allocation in those six-trial cases. The equations still copy once per trial, and each successful solve still allocates its independent step. These are source-derived allocation counts, without timing assertions or a claim about complete synthesis speed.

## Joint-axis pairs traverse source arrays directly

The whole-app search found two suffix-copy pair enumerators in joint-axis discovery, both in `joints/jointCandidates.ts`: body matching in `linksOf` and shared-pin bore expansion in `joinsOf`. Both now use indexed traversal. Pair matching remains quadratic, and face fitting, clustering, candidate sorting and graph orientation are unchanged. No UI state or workflow changes.

For 300 and 600 bodies, the previous traversal allocated 300 and 600 suffix arrays containing 44,850 and 179,700 copied body references. The new traversal allocates none. A shared-pin cluster of those sizes removes the same suffix copies plus 300 and 600 per-member mapped arrays, appending joins directly to its result. The required pair results still allocate. These are source-derived operation counts, without timing assertions or a claim about complete discovery speed.

A scratch comparison matched complete previous and current discovery results in 70 cases. Fixtures include zero through six bores, absent pins, different pin positions in the input, reversed bore order, a two-link arm with a bolted bracket and subsequent replacement of a body by a box. `jointCandidates.test.ts` adds a four-bore shared-pin regression in both source orders, checking ordered candidates, unused faces, fixed pairs, source preservation and repeat calls. Existing tests cover single-bore joints, bolted connections and lone round faces. No quarantine applies.

## Gaits prepare foot targets once

`utils/gait.ts` previously called `goalTargets` for every foot at every sample in both solving passes. Gait preparation now retains each foot's carrier, rest point and orientation probes, plus one flat target list. Updating destinations does no ownership lookup, constructs no target records and leaves source points unchanged. The synchronous IK solver reads those targets without retaining or mutating them. Preparation stays local to one gait.

For the default 24 samples and two feet with orientation held, target records and destination tuples each fall from 384 to eight. Orientation rest-point tuples fall from 288 to six. The flat target list falls from 48 arrays to one. At the 60-sample limit those counts are 960 to eight, 720 to six and 120 arrays to one. These are source-derived allocation counts, not timings or claims about complete gait latency. Per-foot desired destinations, solver workspaces, forward kinematics and returned keyframes still allocate.

A scratch comparison on November 15, 2026 matched complete before and after gait results exactly in 13 cases. The two-leg fixture covered both orientation modes, 8, 24 and 60 samples, headings of zero and 37 degrees, distinct foot directions, bob, sway, nonzero starting joint values, a translated root, part and joint foot identifiers and a later foot-position edit. No UI, workflow or screenshot changes apply.

`gaitTargets.test.ts` compares every ordered target with freshly constructed goals over 120 updates per foot in both orientation modes, checks signed zero, source preservation and target and destination identity. Another 600 updates perform zero ownership checks, and a subsequent ownership edit selects the new carrier without changing the earlier preparation. Existing `animation.test.ts` covers complete stance and swing geometry and rejected gait requests. No timing assertion or quarantine is added.

Validation passed types, documentation and site copy for 279 pages. The related selection passed 224 files and 1,617 tests, with one existing skipped file and test. An initial lint finding required one blank line before the target update, which was corrected. Preflight flagged the unchanged `joints-and-kinematics` help article because it covers the contributor guide. Its joint fields, ownership, poses, IK and selected-robot descriptions remain true, so the article is unchanged.
