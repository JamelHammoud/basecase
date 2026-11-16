# Joints and kinematics performance

Implementation: [Joints and kinematics](../guide/joints-and-motion.md#performance-joints-and-kinematics). Shared requirements: [Performance](../guide/performance.md).

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
