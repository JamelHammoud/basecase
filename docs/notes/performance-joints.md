# Joints and kinematics performance

Implementation: [Joints and kinematics](../guide/joints-and-motion.md#performance-joints-and-kinematics). Shared requirements: [Performance](../guide/performance.md).

## Robot imports collect unique mesh filenames directly

The app-wide search found one mesh-request collector in `utils/robotImport/importRobot.ts`. URDF, MJCF, expanded xacro and converted model imports all reach it through `readModel`. Onshape exports and SimReady visual loading have separate request contracts and do not collect filenames from this model structure.

Previously the collector copied the link list, mapped every link's visuals to geometry arrays, flattened them, filtered mesh geometry, mapped filenames and deduplicated them. It now inserts mesh filenames into a set directly, then builds the existing bounded-concurrency queue. First-occurrence order, exact filename identity, six-task concurrency, parsing, progress messages and failure notes stay unchanged. The set belongs to one import.

For 300 links with five visuals each, four of them meshes sharing two filenames, source-derived array constructions fall from 305 to one. The removed arrays retain 5,700 intermediate references in total: 300 links, 1,500 mapped geometries, 1,500 flattened geometries, 1,200 filtered meshes and 1,200 filenames. Both versions retain the set and two-entry queue. These are allocation counts from the code, not heap measurements or timings. Parsing and geometry preparation costs remain outside this comparison.

`importMeshes.test.ts` runs real URDF folder imports with one and eight links. Each link has two references to one readable STL with different transforms, one box and two references to one missing STL. It checks one STL read, all 36 triangles per link, all imported parts, no movable joints, two progress updates and one missing-file note. Existing archive, GitHub, Hugging Face, xacro and spring round-trip tests cover downstream imports. No user action or visible state changes, so the existing import and troubleshooting help articles remain accurate without replacement screenshots.

The three covered articles were checked against the final collector diff. [Import a robot](../../site/content/help/import-a-robot.md) retains its source-selection steps, menu labels, shelf actions and four screenshots because no entry point or import result changes. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) retains its joint fields, import guarantees, hierarchy and posing explanations because mesh request collection changes no joint or part ownership. [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md) retains its refusal messages, missing-file explanation and recovery steps because deduplication, failure notes and partial import behavior are preserved. The latter two articles contain no screenshots. Preflight mechanically flags these unchanged articles, but its instruction expressly allows retaining accurate content. None needs a prose or image edit for this change.

## MJCF frame traversal appends directly to its output

The whole-app search found one MJCF frame-child traversal in `utils/robotImport/mjcfFrames.ts`. All three importer call sites share it: geometry inside bodies, child bodies and world-root bodies. `skeletonTree.ts` has an unrelated hierarchy method with the same name. No other MJCF frame-child collector needs this change.

Previously every visited container copied its children and used `flatMap` to collect results. Each matching child created a singleton list, and every unrelated child created an empty list. Nested results were copied into each ancestor's result array. The traversal now iterates children directly and appends records into one output. It retains frame matrices, matching records and recursive visits. A query-local visitor closure replaces the per-container callback closures. Transform multiplication order and shared matrix references within a frame stay unchanged.

For a chain of 32 frames ending in 300 matching children with no unrelated children, source-derived array constructions fall from 366 to one. That includes 33 child snapshots, 33 result arrays and 300 singleton arrays before the change. Appended result references fall from 9,900 to 300. Frame placement and the 300 result records still allocate. These are allocation and traversal counts, without timing measurements or a claim about complete import latency. Traversal remains recursive.

`mjcfFrames.test.ts` compares the preceding traversal at depths zero, one, eight and 32 for geometry, body, frame and absent tags. It checks exact matrices, element identity, source transform preservation, independent result arrays and fresh placement after attribute and angle edits. Its parser integration checks nested world and body frames, visual-local placements, joint-world placements, sibling order and excluded containers. Existing robot import and actuator tests cover downstream conversion. No timeout, retry or quarantine changes apply.

The three covered help articles were reread against the final traversal diff and its importer call sites:

- [Import a robot](../../site/content/help/import-a-robot.md): source selection, Import Robot, Choose Folder, canvas drops and shelf controls are untouched. Matching children keep their order and transforms, so imported parts and joint placement retain the documented behavior. Its four screenshots show unchanged controls and states.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md): joint fields, passive springs, ownership, hierarchy, posing, IK and selected-robot behavior remain unchanged. The guide addition describes collection storage only. The article has no screenshots.
- [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md): link validation, description selection, mesh errors and passive actuation handling remain untouched. The traversal preserves the same matching and excluded elements, so it introduces no new failure or recovery action. The article has no screenshots.

No step, label or screenshot becomes inaccurate in this refinement. All three articles remain unchanged under preflight's explicit allowance for accurate covered articles. Its reminders remain mechanically present because coverage detection does not inspect whether prose became untrue.

Changed-file validation passed formatting, ESLint, documentation links, site copy for 323 pages, types and all 332 tests across 46 related files. The related-test run took 2.39 seconds. The log is `scratch/check-mjcf-frames.log`. Copy accounting reports net zero. Preflight reports the three unchanged covered articles above, whose accurate text is intentionally retained under its stated allowance.

## Pose deltas classify each shared transform once

The app-wide search found one tolerant identity classifier used by `poseDeltas`, in `utils/kinematicsMotion.ts`. Pose editing, agent posing, robot ghosts, silhouette preparation and recorded-scene floor extraction call this shared helper. Each part attached to a joint reads the same joint matrix, and base parts share their robot's root matrix.

Each call now retains moving and stationary verdicts by matrix identity. Only requested transforms enter the map, and no verdict survives the call. A module-local coefficient array replaces the sixteen-entry identity array previously allocated for every classified part. The original element order, strict 1e-9 comparison, early exit, requested-part order and returned matrix references remain intact. Forward kinematics still builds the same matrices. The map adds one entry per distinct requested matrix.

On November 16, 2026, a scratch comparison bundled the previous and current helper with Rolldown on Node 26.13.0, macOS arm64. Fixtures have independent hinges at an offset pivot. Half the requested parts use the robot root and half use joint transforms, distributed across the hinges. Alternating hinges move by 37 degrees or stay at rest. Complete ordered outputs matched before timing. Each implementation had three warmup batches and eleven alternating measured batches of 1,000 complete calls.

| Requested parts | Hinges | Absolute-value calls before | After | Median ms before | After |
| --- | --- | --- | --- | --- | --- |
| 300 | 12 | 3,677 | 120 | 0.205 | 0.079 |
| 600 | 12 | 7,352 | 120 | 0.413 | 0.166 |
| 300 | 300 | 3,677 | 1,293 | 0.315 | 0.282 |

Absolute-value counts include the unchanged rest-pose check. The 300-hinge case requests only 150 joint transforms, and all fixtures retain root sharing. These measurements do not establish a speedup when every requested part has a distinct matrix. Timings cover complete pose-delta calls on a shared host with related tests running, without rendering, a CI timing assertion or a claim about complete interaction latency. Source and output remain in `scratch/pose-deltas-bench.mjs` and `scratch/pose-deltas-bench.json` for this session.

`src/utils/poseDeltas.test.ts` compares complete ordered entry arrays with the previous calculation across two robots, missing and duplicate part requests, rest and moving poses, rotated and translated roots, infinite inputs and later edits. It checks the strict identity threshold on both sides of zero and independently owned results across calls. Its 300- and 600-part fixtures require the same classification work as requesting one part per shared matrix. Existing kinematics, hand-declared joint and robot-twin tests cover consuming paths. No timeout, retry or quarantine changes apply.

The dependency-selected check reached 644 files. Its first run passed 4,453 tests and hit two 5-second classroom grading timeouts plus one 15-second rendered visibility timeout. A second run without the concurrent benchmark passed 4,455 tests, including visibility, but timed out on classroom grading's failing Push a block submission for seeds 11 through 15. The grading failure remains unresolved, and no baseline comparison establishes its cause. The logs remain in `scratch/pose-deltas-check.log` and `scratch/pose-deltas-check-serial.log`. Neither run failed a pose-delta assertion. Formatting, lint, types, documentation and site-copy checks passed.

[Pose a robot](../../site/content/help/pose-a-robot.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) still describe the same actions, labels and results. The concept article's coverage metadata now names `kinematicsMotion.ts` directly. This changes no visible state or workflow, so their prose and screenshots remain accurate without edits.

## Cylinder bounds accumulate with vertex residuals

The whole-app search found one axial projection list reduced separately to minimum and maximum in `joints/cylinderFit.ts`. Both clicked-face fitting and automatic shaft-and-bore discovery call it through `axisFinder.ts`. Other projection calculations serve different geometry and do not build this cylinder summary.

Each successful circle fit now accumulates its axial minimum and maximum while writing vertex residuals directly into the result map. This removes the axial-coordinate array, the residual-entry array and one two-element entry tuple per welded vertex. It also removes both separate extrema scans and the map constructor's traversal of the entry array. Dot products, radial distances, source order, residual insertion order, center arithmetic and length arithmetic stay unchanged. Bounds start at positive and negative infinity and use `Math.min` and `Math.max`, preserving signed-zero and NaN reduction behavior. The retained vertex coordinates, circle projections and residual map still allocate.

For the existing 64- and 128-segment cylinders with four height segments, one fit visits 320 and 640 welded vertices. Source-derived allocation counts remove two vertex-length arrays and 320 or 640 entry tuples per fit. Distorted regions repeat the same saving for the vertices retained by each refit. These are operation and allocation counts, not timings or a claim about complete axis-discovery latency.

On November 16, 2026, `scratch/cylinder-bounds-parity.test.ts` compared complete old and new fit results for 96 generated regions and an empty region. It varied segment counts, rotations, translations, full and partial arcs, winding, distorted patches, minimum spans, reversed triangle order and repeated triangles. Repeated new fits matched and preserved source vertices and regions. Detailed output is in `scratch/cylinder-bounds-parity.log` for this session.

Existing `src/joints/cylinderFit.test.ts` covers complete fits, angular-span refusal, distorted-patch trimming, source preservation, vertex reads and independent calls. Axis-finder and joint-candidate tests cover clicked faces and shaft-and-bore discovery. No timing assertions, timeouts, retries or quarantine changes apply.

[Join two parts with a hinge or slider](../../site/content/help/join-two-parts-with-a-hinge.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) still describe the same actions, labels and results. No visible state or workflow changes, so their prose and screenshots remain accurate without edits.

## Cylinder span projections share one normal

The app-wide search found one angular-span calculation reading the same triangle normal separately for its two planar projections, in `joints/cylinderFit.ts`. Both clicked-face fitting and automatic shaft-and-bore discovery use it. `MeshIndex.normal` returns a new three-number tuple on every read. Retaining the normal within the projection callback removes one read and tuple per triangle per fit, without a retained cache.

The existing 64- and 128-segment open-cylinder fixtures have four height segments and 512 and 1,024 triangles. Total normal reads per complete fit fall from 2,048 to 1,536 and from 4,096 to 3,072. Normal moments and convexity still read their own normals. Both span projections retain their original arithmetic and evaluation order. These are source-derived operation and allocation counts, not timings or a claim about complete discovery speed.

`src/joints/cylinderFit.test.ts` checks the reduced normal-read counts together with radius, length, center, axis, source preservation, repeated independent fits, trimming distorted patches and minimum-span refusal. Existing axis-finder and joint-candidate tests exercise both callers. No action, label or visible state changes, so the joint help articles and screenshots remain accurate without edits. No timeout, retry or quarantine changes apply.

## Circle fitting accumulates fixed equations directly

The whole-app search found one least-squares circle fitter constructing `[x, y, 1]` rows, in `joints/cylinderFit.ts`. Clicked round faces and automatic shaft-and-bore matching both use it. Other numeric solvers retain their own equations.

Each vertex now contributes directly to six upper-triangle coefficients and three right-hand-side entries. Each sum retains vertex order and multiplication order. Multiplication by one becomes the original scalar, including signed zero and nonfinite values. Mean calculation, matrix mirroring, determinant refusal, solving and residual trimming remain unchanged.

For 300 or 600 welded vertices in one fit, source-derived counts remove 300 or 600 three-element row arrays and their coefficient-index loops. The same nine sums still receive one contribution per vertex. Coordinate tuples, projected points, the normal matrix and solution remain allocated. These are allocation and operation counts, not measured timings or a claim about complete axis-discovery latency.

`joints/cylinderCircle.test.ts` checks exact equality with the previous row-based equations on 160 translated, noisy and partial circles with 3 through 321 points. It also checks signed zero, small, infinite and NaN inputs, repeated points, insufficient points and source preservation. Existing cylinder and axis-finder tests cover fitting, distorted-patch trimming, clicked faces and shaft-and-bore discovery. No timing assertion, retry, timeout or quarantine changes apply.

[Joints and kinematics](../../site/content/help/joints-and-kinematics.md) and [Join two parts with a hinge or slider](../../site/content/help/join-two-parts-with-a-hinge.md) were checked against this change. Their actions, labels and results remain accurate. No visible state or workflow changes, so their prose and screenshots remain unchanged.

## IK step limits accumulate during back-substitution

The whole-app search found one mapped absolute-step maximum in `utils/kinematicsIk.ts`. All callers of `solveIK` share its trial construction. The independent solvers in `skills/anythingIk.ts`, `reality/leastSquares.ts` and `utils/linkageFitNormal.ts` do not use this step limiter.

Back-substitution now accumulates the largest absolute component while writing the solved vector. The returned step holds that vector and one scalar. This replaces an n-element magnitude array with a two-field record and removes the subsequent magnitude and maximum traversals. The original delta vector remains independently owned. Elimination, division order, damping, rejection, joint clamping and proportional scaling stay unchanged. The maximum starts at negative infinity and propagates NaN, preserving the previous reduction semantics.

For a successful 16-joint linear solve, source-derived counts remove one 16-entry magnitude array and two 16-component traversals. Six rejected trials remove six such arrays and 192 subsequent component visits. Sixteen absolute values and maximum comparisons still run per trial, now within back-substitution. These are operation and allocation counts, not timings or a claim about complete IK latency. The two-field result record is a new allocation per successful linear solve, including a subsequently rejected trial.

`kinematics.test.ts` checks five two-slider requests with positive, negative and zero components, below, at and above the 15-unit limit. It checks both returned joint values and independently calculated residuals after one iteration. Existing tests cover mixed hinges and sliders, root transforms, joint limits, preferences, weighted targets, excluded joints, empty and nonfinite targets, retained accepted residuals and six rejected damping trials.

A scratch comparison on November 16, 2026 matched 320 complete before and after solver results exactly. It varied starting angles, reachable and unreachable weighted targets, preferences, joint restrictions, root rotations and iteration limits of 0, 1, 4 and 40. The comparison and output are in `scratch/ik-step-parity.test.ts` and `scratch/ik-step-parity.log` for this session. No timing assertion, retry, timeout or quarantine change applies.

[Joints and kinematics](../../site/content/help/joints-and-kinematics.md) still describes the same target reaching, joint ranges, torso stiffness and robot selection. Its coverage metadata now names `src/utils/kinematicsIk.ts` directly, matching its inverse kinematics description. [Pose a robot](../../site/content/help/pose-a-robot.md) keeps the same controls and actions. There is no visible state or workflow change, so their prose and screenshots remain accurate and unchanged.

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


## Xacro XML tags match at the cursor

The whole-app XML parser search found two suffix-based tag matchers, both in `utils/robotImport/xml.ts`. Opening and closing tags now use sticky regular expressions with `lastIndex` set before every match. They cannot skip malformed markup to find a later valid tag. Every xacro document and include uses this reader. The other XML readers use DOM parsing or full-input regular expressions already, so they need no equivalent change. No controls, help steps or screenshots change.

`xml.test.ts` covers ordered attributes and siblings, namespaced tags, both quote styles, entities, text, comments, processing instructions, CDATA, self-closing tags, mismatches, missing roots, malformed tags and successful parsing after each failure. A 2,000-link fixture checks the full parsed tree. Existing xacro tests cover expansion, includes and refused input through the real import resolver.

A scratch comparison matched complete trees or exact error messages for 600 valid and mutated documents. The benchmark compared complete XML parsing on Node v26.13.0, macOS arm64, Apple M5 Pro. Both implementations received five warmup batches, then 15 alternating measured batches of ten parses. Values below are median milliseconds per parse.

| Links | Document characters | Before ms | After ms | Removed suffix slices per parse |
| --- | --- | --- | --- | --- |
| 100 | 8,105 | 0.120 | 0.117 | 702 |
| 1,000 | 81,905 | 1.218 | 1.178 | 7,002 |
| 5,000 | 413,905 | 6.791 | 6.847 | 35,002 |

These local timings show no consistent latency improvement. The refinement removes suffix-string operations at both tag match sites, without claiming that engines copied the suffix characters or that total import time improves. Attribute and output strings still allocate. No timing assertion, retry, timeout or quarantine was added. The throwaway comparison and raw results remain in `scratch/xml-cursor.ts` and `scratch/xml-cursor-results.jsonl`.

The three covered articles were reread against the final parser diff:

- [Import a robot](../../site/content/help/import-a-robot.md): the import entry points, file selection, xacro properties, macros, defaults and package-local includes remain unchanged. `xacro.ts` uses the same parser for its root and included documents, and the parsed trees match. The four screenshots show controls this change does not edit.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md): no joint fields, hierarchy, ownership, poses, limits or simulation behavior change. `readModel.ts` still expands xacro before DOM parsing and joint extraction. The contributor guide addition describes tag matching only.
- [Robot import troubleshooting](../../site/content/help/troubleshoot-app-robot-import-fails.md): link validation, fetches, mesh resolution and messages remain unchanged. The malformed-tag tests verify rejection at the current position, and the scratch comparison checks exact parser error messages. `xacro.ts` still wraps failures with the same file-specific import error.

All steps, labels and screenshots remain accurate, so these articles are unchanged. Preflight reports unchanged covered articles mechanically and retains the three reminders after this verification.

## Root transforms are constructed directly

The whole-app search found one shared robot root-transform constructor, `utils/kinematicsMotion.ts::rootMatrix`. Every forward-kinematics call uses it for each robot. Posing, IK, gait and motion fitting therefore share the change without caller-specific implementations. Other translation compositions found in robot import and mat test fixtures construct different transforms and remain unchanged.

For a root with nonzero rotation and translation, construction previously allocated four matrices and performed three matrix multiplications. It now allocates only the returned matrix and performs no matrix multiplications. Rotation still uses three.js's XYZ Euler construction. The pivot offset is calculated from the rotation columns, followed by world-axis translation. Translation-only roots remove one temporary matrix and one multiplication. Identity roots retain their single returned matrix. These are source-derived operation counts. Euler objects, the degree-conversion array and forward-kinematics results still allocate.

`kinematicsRoot.test.ts` compares all matrix elements against the previous composed reference across 720 finite-input cases. They include missing and partial roots, signed zero, multi-turn angles and offset pivots. A geometric check verifies the pivot moves only by world translation and a point rotates about that pivot. Input values and previously returned matrices remain independent across calls. Existing kinematics and animation tests exercise the callers. No timing assertion, retry, timeout or quarantine is added.

The [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) concept article was reread against the final code and guide diff after the preflight reminder. Its joint-field table and import entry points are untouched. The hierarchy, group and fastener ownership, mount anchoring, four-bar closure and deletion sections describe code outside the root constructor. The pose section still holds because root transforms only affect posed coordinates, without editing modeled parts. IK still uses the same targets, limits and torso stiffness. Robot selection and per-robot root assignment in `forwardKinematics` are unchanged. The article has no screenshots. No label or instruction became inaccurate, so the article remains unchanged as preflight permits.

A local construction benchmark on November 16, 2026 used Node v26.13.0 on macOS arm64 with an Apple M5 Pro. It compared the previous function with the current function read from source and type-stripped through Node. Both received five warmup batches, then 15 alternating measured batches of 100,000 calls over 256 finite roots. Median batch time fell from 20.301 ms to 16.562 ms, about 18%. These isolated construction timings do not establish complete interaction or solver latency. Other work was running on the host. The script and raw results remain in `scratch/root-bench.mjs` and `scratch/root-bench-direct.log`. The initial Vitest benchmark was stopped during filesystem discovery before it ran, then replaced with this direct benchmark.

Local validation passed formatting, lint, types, documentation and site copy for 281 pages. The ordinary `check:changed` run was stopped after more than nine minutes of Vitest filesystem work without a test starting. A scratch configuration using `--configLoader native --no-fsModuleCache` ran both root and joint-motion files successfully: two files and seven tests in 145 ms. The original related-test selection was then run with those two flags, keeping the repository test configuration and every assertion. No tracked harness setting, test timeout, retry or quarantine changed. The initial log and process sample remain in `scratch/check-root.log` and `scratch/related-sample.txt`.

The related run completed in 165.53 seconds: 557 files passed, three failed and one was skipped. It passed 3,786 tests, failed four and skipped one. Each failure reported `Test timed out in 5000ms`, with no assertion mismatch:

- `cases/handoffGoal.test.ts`: replays the recorded object trajectory and scores the same physical evidence.
- `cases/terrain.test.ts`: hexapod walks across default Rough Ground, and misses it limp.
- `skills/kitTransitions.test.ts`: hexapod walk to settle, and hexapod turn-away to walk with a −90 degree turn.

These files are unchanged. No baseline replay was run, so this is evidence of local timeouts rather than proof they also fail before the change. The complete output is in `scratch/root-related-direct.log`. Full local validation is therefore not green despite the focused regression tests passing. There is no new quarantine or proposed timeout increase.


## MJCF actuator attachment indexes names once

The whole-app search found one MJCF actuator-to-joint name matcher, in `utils/robotImport/mjcf.ts::applyActuators`. All MJCF import entry points reach it through `readModel.ts`, after include expansion. URDF transmission handling and runtime actuator addressing use different inputs and are outside this attachment operation. No controls, instructions or screenshots change.

For 300 and 600 uniquely named joints with one actuator each, the previous matcher performed 45,150 and 180,300 joint-name comparisons. It also read each actuator's joint attribute that many times. The new matcher visits 300 and 600 joints to build a first-match index, then performs 300 and 600 attribute reads and map lookups. Index storage is linear in unique joint names and belongs to one parse. Imports without actuators return before building it. These are source-derived operation counts, without timing assertions or a claim about complete import latency. XML parsing, geometry, transforms and the actuator list still allocate.

`mjcfActuators.test.ts` checks joint-level effort precedence, motor control range and gear, default-class force ranges, first nonzero effort across multiple actuator sections, passive resistance, unknown references, missing and empty names, duplicate first matches and generated fixed-joint names. Wide 300- and 600-joint models check ordered attachment with reversed actuator lists. Editing an actuator reference and parsing again checks fresh attachment and independence of earlier outputs. Existing robot import and passive history tests exercise the surrounding pipelines. No retry, timeout or quarantine changes.

Local `check:changed` passed formatting, lint, documentation, site copy for 281 pages, types and all 269 tests in 37 related files. The related-test phase reported 2.08 seconds. Copy accounting reported zero added, changed or removed strings.

The covered help articles were read against the final code and guide diff. [Import a robot](../../site/content/help/import-a-robot.md) still describes the same entry points, file selection, joint limits and passive imports. [Robot import troubleshooting](../../site/content/help/troubleshoot-app-robot-import-fails.md) keeps the same messages, mesh resolution and passive-joint advice. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) keeps the same joint fields, hierarchy, poses and robot selection. No step, label or screenshot became inaccurate, so these articles remain unchanged.

## Cylinder fits collect welded corners directly

The whole-app search for welded corner collection found one `cornersOf` implementation, in `joints/cylinderFit.ts`. Clicked-face fitting and automatic shaft-and-bore discovery both reach it through `axisFinder.ts`. Other set-and-flatten expressions collect robot membership, signals or catalog ids rather than triangle corners and are outside this preparation.

For T triangles, each fitting round previously created T three-entry corner arrays, T three-entry index arrays and one flattened 3T-entry list before constructing the deduplicating set. Collection now inserts each corner directly into that set. The set and returned unique-id array remain necessary. First-occurrence order, circle arithmetic and refit behavior stay unchanged. These are source-derived allocation counts, without a claim about total discovery latency.

A local isolated collection benchmark on November 16, 2026 used Node v26.13.0 on macOS arm64 with an Apple M5 Pro. Synthetic connected triangle indices reused welded vertices and visited triangles in reverse order. Complete ordered outputs matched for empty, 512-, 4,096- and 32,768-triangle inputs. Both implementations received three warmup batches, followed by nine alternating measured batches. The new function was loaded from the working source through Node type stripping.

| Triangles | Collections per batch | Previous median ms | Direct median ms |
| --- | --- | --- | --- |
| 512 | 195 | 8.442 | 2.131 |
| 4,096 | 24 | 7.993 | 2.466 |
| 32,768 | 4 | 11.650 | 4.163 |

These timings exclude mesh indexing, circle fitting and discovery. Other work was running on the host. No CI timing assertion applies. The script and raw output remain in `scratch/cylinder-corners.mjs` and `scratch/cylinder-corners-results.jsonl`.

`joints/cylinderFit.test.ts` checks first-seen welded vertex order through reversed and repeated triangle lists, repeated independent results and unchanged input lists. Existing tests check complete cylinder dimensions, residual reuse after distorted-patch trimming and minimum angular-span rejection. Axis-finder and joint-candidate tests cover both callers. No timeout, retry or quarantine changes.

The covered [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) article was reread against the final code and guide diff. Its joint-field table, import links and joint creation entry points remain accurate. The direct collector preserves first-seen vertex order before circle fitting, so fitted axes and acceptance thresholds remain unchanged. Hierarchy, mount anchoring, deletion, modeled poses, IK and robot selection use unchanged code. The article has no screenshots. No instruction or label became inaccurate, so it remains unchanged as the preflight finding permits.

The [Join two parts with a hinge or slider](../../site/content/help/join-two-parts-with-a-hinge.md) task was also checked. Both clicked-face and automatic shaft-and-bore fitting reach the same collector, with unchanged entry points and acceptance rules. Its steps, labels and screenshot states remain accurate, so no article or screenshot edit is needed.

## Imported joints group link ownership once

The whole-app search found repeated `partOfLink` ownership filtering only in `utils/robotImport/importRobot.ts`. Every source format reaches its shared `sceneJoints` builder. Preparation now retains one group entry per built part, keyed by its nearest movable joint or the null base owner. The existing owner cache still resolves fixed chains. Lookups copy their matching ids so parent and child arrays never alias. Geometry-free parent fallback still walks ancestors and retains its 50-step limit.

On November 16, 2026, a scratch comparison extracted the before and after joint builders and counted entries yielded by the built-link map on macOS arm64 with Node 26.13.0. Synthetic chain and star fixtures use one base part and one part per revolute joint. Complete joint outputs matched with identical supplied rounding and limb classifiers.

| Joints | Shape | Before link entries | After link entries |
| --- | --- | --- | --- |
| 300 | Chain | 180,600 | 301 |
| 300 | Star | 180,600 | 301 |
| 600 | Chain | 721,200 | 601 |
| 600 | Star | 721,200 | 601 |

These are operation counts, without timing assertions or a claim about complete import latency. Mesh loading, geometry conversion, published mass preparation, joint transforms and output-array copies remain. The index adds operation-local storage proportional to the built parts and their owners. It is rebuilt for each import.

`utils/robotImport.test.ts` exercises actual local-file imports through parsing and geometry conversion. It checks ordered base and fixed-link groups, branching joints, fallback across a geometry-free joint, missing base geometry, repeated imports after source changes and independent output arrays. Its MJCF case checks two joints on one body, including the explicit predecessor and empty-owner fallback. Existing xacro import equivalence tests continue to cover the shared import pipeline. No UI, workflow or quarantine changes.

## Joint-axis queries select scene instances once

The whole-app search found repeated scene-instance lookup in both `jointAxisOf` and `jointAxesOf`, in `three/analysis/jointAxis.ts`. Both analysis-worker task handlers share the new query-local selection pass. The single-part Lighten lookup in `analysisOps.ts` has no repeated lookup. Vision acceptance looks up detection instances, which are different records and outside this operation.

For N scene instances and R requested ids, selection now visits at most N instances and prepares at most R distinct selected entries. Previously each requested id restarted a linear search. With 600 unrelated instances followed by three mesh instances, 600 missing requests and two matched requests performed 363,003 instance-id reads. Selection now performs 603. A single-axis query whose two parts come first stops after those two instances. An empty batch reads none. These are source-derived operation counts, without timing assertions or a claim about complete discovery latency. Geometry indexing and candidate pair fitting remain unchanged.

`three/analysis/jointAxis.test.ts` runs real transformed bore-and-pin meshes through both worker entry functions and compares complete results with direct `MeshIndex` inputs. It covers reversed request order, missing ids, repeated requests, duplicate scene ids with first-match precedence, changed transforms, unchanged source inputs and repeat calls. Its broad scene fixture counts unrelated id reads and verifies early termination and empty batches. Existing axis-finder and joint-candidate tests cover fitting tolerances and graph discovery. No timeout, retry or quarantine changes.

The covered [Join two parts with a hinge or slider](../../site/content/help/join-two-parts-with-a-hinge.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) articles retain accurate controls, steps and joint behavior. This refinement changes worker preparation only, so no help steps or screenshots change.

Local `check:changed` passed formatting, lint, documentation, site copy for 281 pages, types and all 285 tests in 47 related files. The related run reported 9.99 seconds. `copy-diff` reported zero added, changed or removed strings. Preflight flagged the unchanged Joints and kinematics article because it covers the edited guide. The full article was checked against the final change. Its fields, joint sources, hierarchy, pose behavior, IK and robot selection remain accurate, so the article stays unchanged under the finding's explicit allowance.

## Coupler-only sampling omits full pose records

The whole-app search for `fourBarPose` found two point-only consumers, `couplerSampler` and `couplerPoint`, both in `utils/linkageKinematics.ts`. The remaining callers in `linkageFrames.ts` and `linkageParts.ts` use the crank and coupler joints as well as the traced point. They still need full poses. Curve generation and both synthesis scoring passes share the prepared point sampler.

Previously each successful point-only sample created a `{ b, c, p }` pose record by spreading the closure result, only to discard that record after placing `p`. Both consumers now share a local point calculation that calls the same closure and offset functions in the same order. Closure records and coordinate arrays remain. No additional cache or retained workspace is introduced.

For a 720-interval fully closing curve, the source-derived count of discarded full-pose records falls from 721 to zero. A single successful `couplerPoint` call removes one record. Failed closures create no full-pose record in either version. These are allocation counts, without a timing assertion or a claim about complete synthesis latency.

`utils/couplerSampling.test.ts` compares both consumers with placed full poses across 40 seeded shapes and 52 angles per shape. It checks exact coordinates, reverse sweeps, failed closure, nonfinite angles, source preservation, geometry edits and independently owned results. Existing linkage sampling tests cover complete curves and preview frames, while synthesis tests cover fitted results and ranking. No timeout, retry or quarantine changes.

The [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) task and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) concept remain accurate. Their controls, limits, coordinates, insertion, posing and simulation behavior do not change. The concept has no screenshots or numbered steps. Its four-bar explanation still matches `kinematicsLoop.ts`, which now uses the role-specific `linkAngle`, while preview bars and insertion still use unchanged `fourBarPose`. Joint fields, sources, hierarchy, deletion, modeled poses, IK and robot selection are outside the point-only sampling change. No help text or screenshot state needs an edit.

Local `check:changed` passed formatting, lint, documentation, site copy for 285 pages, types and 3,852 related tests across 570 passing files. One existing file was skipped. The related run took 81.57 seconds. `copy-diff` reported net zero. Preflight flagged the unchanged Joints and kinematics article because it covers the edited guide. The full article was checked against the final code, including joint fields, sources, hierarchy, mount anchoring, deletion, posing, IK and robot selection. All remain accurate, so the article stays unchanged under the finding’s explicit allowance.

## Pose sections prepare naming rules once

The whole-app search for `jointGroups`, `jointRowLabels`, `groupRank` and `GROUP_ORDER` found one section-ordering and row-labeling implementation in `utils/jointNames.ts`, consumed by `PosePanel.tsx`. Other callers use individual joint names or group labels without section sorting or row shortening. No second naming path needs this preparation.

Section ranks now use a module-local map of the nine canonical labels instead of repeatedly lowercasing and scanning those labels inside the sort comparator. Section labels still come from `jointGroupLabel`, with the same canonical casing. Each row-label call normalizes and splits its group once, creates one common omission set and at most one additional set containing abbreviated side tags. A row uses that additional set only when its own name has a recognized side. Non-sided sections retain side words and abbreviations. Preparation belongs to the call and reads changed section names afresh.

For a 600-row section, group normalization and splitting fall from 600 calls each to one each. Omission sets fall from 600 to two for a sided section and one for an unsided section. These are source-derived operation and allocation counts, without timing assertions or a claim about complete panel rendering time. Per-joint tokenization, side recognition, duplicate detection and result-map construction remain.

`utils/jointNames.test.ts` checks every canonical section rank, source order, explicit limb assignment, movable-joint filtering and independent output arrays. Row-label tests cover duplicate fallback, retained sides under Other, abbreviated side recognition, uppercase group names and unchanged input joints. Three 600-row fixtures count group normalization once per call and verify complete output size and endpoint labels. No timeout, retry or quarantine changes apply.

The abbreviated-side fixture includes non-colliding `LL_ankle` and `wrist_r` names alongside the colliding `L_knee` and `knee_l` pair. The original pair fell back to full names, so it could not detect a missing abbreviated-side omission. The added names assert prefix and suffix omission in a sided section and retention under Other across alternating calls.

The [Pose a robot](../../site/content/help/pose-a-robot.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) articles were checked against the final behavior. Section names, row labels, order, controls and user actions remain unchanged. Their instructions remain accurate, so no help prose or screenshots change. The concept article now lists `src/utils/jointNames.ts` in `covers`, directly tracking the implementation of its limb-grouping description. Its joint fields, import paths, hierarchy, mount anchoring, deletion, pose behavior, inverse kinematics and robot-selection descriptions remain accurate. The article contains no screenshots to update.

## Rig component lookups compress their full paths

The whole-app search found map-based connected-component root walks in rig grouping, Onshape rigid grouping, print merging and print-label faces. The latter two already shared a fully compressing iterative helper. That helper now lives at `electron/componentRoot.mjs`, and both `kinematicsRig.ts` and `electron/onshape/assembly.mjs` share it. Array-based walks in world meshes, rotor splitting and CAD topology already compress paths. Dataset and vision source grouping also compress every traversed link, using maps where roots have no parent entry.

On November 16, 2026, a scratch comparison on Node 26.13.0 counted `Map.get` calls during complete `buildRig` calls. Each fixture has independent root joints whose two parent-part ids overlap with the next joint, forming one connected robot without a deep kinematic hierarchy. At 300 joints, reads fell from 98,099 to 9,000. At 600 joints, reads fell from 376,199 to 18,000. Complete rigs matched the previous implementation. The script is `scratch/rig-components.mjs`. These are deterministic operation counts, without timing assertions or a claim about complete interaction latency. The map retains one entry per member and no extra path array.

`kinematicsRobotGroups.test.ts` bounds lookup work on both sizes and checks the complete robot's ordered joints, part set, averaged pivot, membership and source preservation. Existing cases cover separate robots, shared bases, duplicate names, edits and undo. `print/componentGrouping.test.ts` retains missing-root, empty-string and zero-id checks, descending print chains and label faces. Print union rules and output order are unchanged.

The existing [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) article still describes the same hierarchy, grouped-part ownership and per-robot posing. No label, action or visible state changed, so its text and screenshots remain unchanged.

Preflight also named four print articles. [The path from design to build](../../site/content/help/from-design-to-build.md) and [Printability estimates](../../site/content/help/printability-estimates.md) retain their readiness, support, plate and timing behavior. [Label printed parts with their guide letters](../../site/content/help/label-printed-parts.md) retains its toggles, letter dimensions, candidate faces and two screenshots. [Merge printed parts into one print](../../site/content/help/merge-printed-parts-into-one-print.md) retains its eligibility rules, controls, undo and two screenshots. Their print code changes only its import path, so all four articles remain unchanged after comparison with the final diff.

Onshape had the same partial compression. A direct comparison of its union/find sequence over 300 and 600 chained occurrences preserved every root and reduced map reads from 90,598 to 2,092 and from 361,198 to 4,192. `scratch/onshape-components.mjs` records this operation-count comparison. `electron/onshape/assemblyGroups.test.mjs` bounds complete assembly grouping reads on both sizes, checks occurrence order and source preservation, and regroups the same input after removing mates. The existing import and update tests retain fastened-mate integration coverage. No networking or account behavior changes. The renderer uses the same JavaScript helper through its type declaration.

The [Import an Onshape assembly as a robot](../../site/content/help/import-an-onshape-assembly.md) article still describes identical account setup, mate grouping, link names, motion and updates. Its screenshots show unchanged controls and imported results, so no article edit is needed. A separate scratch replay also compared 120 generated rigs with shared parts and grouped-part adoption against the previous implementation, with exact equality.

Final `check:changed` validation passed formatting, lint, types, documentation, site copy for 285 pages and the selected related tests: 572 files and 3,866 tests passed, with one existing skip. The focused component run passed four files and 22 tests. No timeout, retry, skip or quarantine was added. Logs remain in `scratch/check-grouping-final.log` and `scratch/component-focused-final.log`.

## Rig child indices append into owned lists

The whole-app search for child-joint indices found one copying constructor, `jointTree` in `utils/kinematicsRig.ts`. Skeleton hierarchy and URDF traversal already append into owned child lists. Other map-grouping copies group unrelated data and are outside this refinement. All `buildRig` consumers share the changed constructor, including Pose, IK, simulation preparation and engineering checks.

Each insertion previously copied every joint already associated with that child part. The constructor now appends to a call-local list, retaining insertion order and duplicate occurrences. No list escapes the private tree. Parent selection, depth calculation, ownership and connected-component grouping keep their original algorithms. Those later algorithms can still take quadratic work on some inputs.

A November 16, 2026 scratch comparison on Node 26.13.0 checked complete rigs against the preceding implementation at 1, 30, 300 and 600 joints in both source orders. Each joint lists one common child twice and one of seven other children. Complete outputs matched. For the 300-joint fixture, source-derived copied-entry counts fall from 185,979 to zero. For 600 joints they fall from 744,815 to zero. These count only preceding members copied during child-index construction, without timings or a claim about complete rig latency. The comparison lives in `scratch/rig-child-index.test.ts`, with results in `scratch/rig-child-index.log`.

`kinematicsGroups.test.ts` checks first-source ties for shared-child ownership and inferred parents, repeated child ids, a deeper explicit parent after edits, unchanged inputs and rebuilding the original rig. Existing kinematics tests retain hierarchy, cycles and forward-motion coverage. No timeout, retry or quarantine changes apply.

The [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) article was checked against the final behavior. Joint fields, sources, deepest-child ownership, grouped followers, anchoring, deletion, modeled poses, IK and robot selection remain accurate. Its coverage metadata now names `src/utils/kinematicsRig.ts` directly, matching its hierarchy and ownership descriptions. No action, label or visible state changes, so its prose stays unchanged. The article has no screenshots.

Local validation passed formatting, lint, types, documentation and site copy for 285 pages. The required related-test run passed 564 files and 3,831 tests, with one existing skip, but failed two unchanged tests at their existing 5,000 ms timeout: Bambu Studio archive loading in `electron/print/project.test.mjs:58` and real-time Case handoff in `src/cases/slots.test.ts:113`. The run took 137.67 seconds. The full failure output remains in `scratch/check-child-index.log`. No causal attribution to host load or this refinement was established. These failures are left for their owning areas, without changing their timeouts, retries or quarantine. Copy accounting is net zero. Preflight's unchanged-help finding was resolved by the article inspection described above.

## Linear animations read only endpoint channels

The whole-app search found one shared robot animation sampler in `utils/animation.ts`. Pose playback, simulation controllers, move references and agent pose checks all use it. Linear interpolation previously evaluated all four supporting joint values and root-position coordinates before discarding the outer two. It now chooses the joint sampling function once per sample and reads only span endpoints for linear channels. Smooth interpolation retains its polynomial and four support reads. Root-presence detection still examines all supporting frames, preserving a zero offset when only an outer frame supplies a root.

On November 16, 2026, a scratch comparison on macOS arm64 with Node 26.13.0 sampled four-keyframe looping linear clips with 12, 120 and 600 joints, translated and rotated roots, and 201 positive and negative sample times. Joint and root-position differences were exactly zero, and root rotations matched exactly. An initial implementation measured median batches of 1,000 samples at 0.616, 7.623 and 61.453 ms before, and 0.508, 5.120 and 44.433 ms after, across three warmup and 11 alternating measured batches. After extracting a root-axis reader for lint, a final 100-sample comparison measured 0.188, 1.397 and 73.205 ms before, and 0.215, 1.265 and 104.616 ms after. Other test processes were running during the final comparison. These inconsistent local timings do not establish a final speedup or a regression. The deterministic reduction is in source reads, without a claim about rendering or complete playback latency and without a CI timing threshold. Final scripts and results are `scratch/animation-linear-final.test.ts`, `scratch/animation-linear-final.log` and `scratch/animation-linear-final-results.jsonl`.

A separate final comparison in `scratch/animation-parity.test.ts` checked 1,608 complete sampled poses against the preceding implementation across linear and smooth interpolation, looping and clamping, sparse channels, root translations and rotations, and endpoint edits. Every pose matched exactly. The probe passed in a 320 ms run including startup.

`animationInterpolation.test.ts` checks complete sampled joint values and root positions with 32 and 64 channels. Instrumented source reads fall from four to two per populated joint and root-position axis. It also checks an outer-only root and a changed endpoint. Existing `animation.test.ts` and `timeSampling.test.ts` retain smooth, sparse, clamped, looping and quaternion coverage. No timeout, retry or quarantine changes apply.

An initial cubic-weight factorization showed no reliable complete-sampler gain and was discarded. Its scratch probe initially exceeded the existing five-second test budget. Reducing the measurement batch from 3,000 to 1,000 samples let the probe finish within that budget without changing a timeout. The retained refinement preserves the original arithmetic in both modes.

The [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) article was checked against the final code. Walk creation, BVH import, playback, scrubbing, pausing and looping keep their existing actions, labels and visible states. Its instructions and three screenshots remain accurate, so no article or capture changes are needed. Preflight also named [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), which covers the owning guide. Its joint fields, sources, hierarchy, modeled poses, IK and robot selection remain accurate. That article has no screenshots and also stays unchanged.

Final targeted validation passed formatting, lint, types, documentation and site copy for 285 pages. The required related-test selection passed 223 files and 1,619 tests, with one existing skip, but failed six unchanged tests at their existing 5,000 ms timeout. These were the hexapod reach-the-flag case in `cases/caseBuilder.test.ts:197`, two-arm real-time handoff in `cases/slots.test.ts:113`, hexapod Rough Ground in `cases/terrain.test.ts:165`, and three Motor Kit transitions in `skills/kitTransitions.test.ts:28`. The run took 104.80 seconds. Failure details are in `scratch/check-animation-final.log`. No causal attribution to host load or this refinement was established. The first validation was stopped after its lint finding was corrected, and is retained in `scratch/check-animation.log`. A final timing probe passed after reducing its measurement batches to 100 samples. No timeout, retry, skip or quarantine was added. Copy accounting is net zero. Preflight's two unchanged-help findings were resolved by the article inspections above.

## Animation channel discovery accumulates names directly

`animationJointIds.test.ts` compares the flattened union with direct collection over 600 keyframes containing 120 channels each, rotating through 180 unique identities. The previous path builds 600 key arrays and a flattened list of 72,000 references before constructing a 180-entry set. The shared collector retains only the set and allocates no explicit channel arrays. Both implementations enumerate all 72,000 channel occurrences. These are fixture-derived allocation counts, not timings or engine heap measurements. They do not claim a complete playback or agent-tool speedup.

The same tests cover sparse and empty frames, own enumerable names, inherited and hidden properties, channel getters that must remain unread, source preservation, later edits and independent sets. The `animatedJoints` helper retains its input joint order, while the agent summary retains its unique channel count. Repository searches found two channel-union implementations, but `animatedJoints` has no callers. Only the agent summary is an active production consumer. The tuple-based `skills/moveFixtures.ts` builder prepares test fixtures rather than discovering channels on an existing animation. No UI, workflow, help screenshot or quarantine changes.

The three help coverage notices were checked against this channel-discovery change:

- [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) keeps the same walk creation, BVH import, playback, scrubbing, pause and loop actions. `sampleAnimation`, gait generation and import behavior are unchanged. The menu, retarget sheet and loop-menu screenshots show unchanged controls.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) keeps the same joint fields, sources, hierarchy, modeled poses, IK and robot selection. The guide addition describes internal channel collection only. The article has no screenshots.
- [The design agent](../../site/content/help/the-design-agent.md) keeps the same animation capability, checks, priorities and editing controls. `animateText` uses the shared collector for the same unique joint count, without changing its reply wording. The article has no screenshots.

All three articles remain accurate and are intentionally unchanged. No new capture or help copy is needed for this internal allocation refinement.

## Xacro block binding advances without array front removal

The whole-app search for xacro block consumption found one binding path in `utils/robotImport/xacro.ts`. Block properties and `insert_block` read already bound nodes rather than consuming the argument list. Each macro call now owns a cursor into its element list. Both single-element and named-children parameters advance it once, while scalar parameters leave it alone. No cursor survives the call.

`xacroBlocks.test.ts` expands two calls with 300 and 600 alternating single-element and named-children parameters, scalar defaults between them, text between passed blocks, caller-scoped expressions and reverse insertion order. Complete ordered link names match the generated expectation, and a second expansion matches the full serialized output. A separate case checks missing-block refusal, recovery on a later expansion and repeated insertion of one bound block. Existing `xacro.test.ts` retains includes, real description packages, default values and expansion limits.

For each call consuming all 300 or 600 passed blocks, the former front-removal algorithm logically moved 44,850 or 179,700 remaining references. The cursor performs 300 or 600 indexed reads with zero front removals. The two-call fixtures include one extra unused block in the first call, raising their former logical movement totals to 90,000 and 360,000. These are source-derived operation counts, not measured engine copies or timings. Parsing, expression evaluation and output serialization still do their existing work. No complete-import speedup is claimed.

[Import a robot](../../site/content/help/import-a-robot.md) retains the same file choices, xacro defaults, includes, refusal behavior and four screenshots. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) retains the same imported joint and posing behavior. This change adds no action, label or visible state, so both articles remain unchanged. No browser test, timeout, retry or quarantine changes apply.

Preflight also named [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md). Its link eligibility, repository access, missing descriptions and meshes, passive joints, archive limits and dataset routing are unaffected by block consumption. Its actions and messages remain accurate, and it has no screenshots. The article stays unchanged.

## Three-dimensional solves use direct determinants

The whole-app search found three Cramer solvers constructing replacement-column matrices: cylinder circle fitting, skill feasibility IK and solver-race IK. They now share `utils/solve3.ts`. Each numerator uses the original determinant expression with the substituted scalars, retaining multiplication, subtraction, addition and division order. The helper owns only its three-number result. It never modifies the matrix or right-hand side. The circle fitter still checks the original determinant before solving. Neither skill caller gains a singularity check.

Per solve, the previous code allocated three outer replacement matrices and nine row arrays, plus a three-column index array. All thirteen temporary arrays are removed. The returned solution tuple remains. These are source-derived allocation counts, without timing measurements or a claim about complete fitting or training latency.

`src/utils/solve3.test.ts` compares exact results with the previous copied-column equations on 1,000 seeded dense systems and their 1,000 damped Gram systems. It checks both determinant call paths, unchanged inputs, zero, signed zero, near-singular, infinite and NaN coefficients, and translated-circle fitting with degenerate-point refusal. Existing cylinder, axis discovery, feasibility and solver-race tests retain pipeline coverage. No action, label, state or help workflow changes, so no help screenshot is needed.

Preflight flagged [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) because it covers the changed guide. The article was read against the final code. Its joint fields, sources, part following, anchoring, deletion, modeled poses, target-based IK and robot selection all retain their behavior. It has no screenshots. Its prose remains unchanged because no described step, label or state changes. Its coverage metadata now names `src/joints/axisFinder.ts` and `src/joints/cylinderFit.ts`, the shared axis-discovery implementation behind adding a hinge or slider.

Targeted validation passed formatting, lint, TypeScript, documentation and site copy for 291 pages, plus 551 tests in 94 related files. Copy accounting is net zero. The check log is `scratch/check-direct-solve.log`. No timeout, retry or quarantine changed.

## Xacro attributes collect directly into their result

The whole-app attribute-reader search found one XML reader that first materialized all regular-expression matches before mapping them into attribute tuples, `utils/robotImport/xml.ts`. The skeleton reader already iterates matches directly. The skills artifact reader processes whole structure tags rather than parsing attribute lists. Main xacro documents and included files share the changed reader. Plain URDF and MJCF use the browser DOM parser.

The existing 2,000-sibling round-trip fixture now has six attributes per link, including duplicate names, empty values, namespaced names, Unicode, escaped quotes and unknown entities. It uses single quotes for empty values and double quotes for the other attributes, and checks numeric entities in a separate document between repeated large parses. Complete parsed trees retain source order and values. Existing malformed-document tests retain refusal and recovery coverage, and xacro tests cover includes and macro expansion.

For this fixture's 4,001 elements and 12,000 attributes, the previous source explicitly allocated 4,001 intermediate match lists retaining 12,000 match references before mapping. Direct iteration removes those lists and retains only the output tuples. Regular-expression match objects and result arrays still exist. These are source-derived allocation counts, not heap measurements or timings, and establish no complete-import latency claim. No timeout, retry, browser harness or quarantine changes apply.

The existing help articles were checked against the change. [Import a robot](../../site/content/help/import-a-robot.md) retains its xacro entry points, defaults, include behavior, refusals and four screenshots. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) retains imported joints, hierarchy and posing behavior. [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md) retains its link eligibility, messages, mesh recovery and import limits. No action, label or visible state changed, so the articles and captures stay unchanged.


## Alternating gaits partition foot indices once

The whole-app search found one side-partition implementation, `utils/gait.ts`, shared by generated walk cycles and drive-class checks. Other phase paths use explicit phases or fixed defaults rather than dividing feet by position.

The former partition created two full lists of records containing index, depth and side membership, then filtered each list. The new partition appends indices to two owned side lists in one traversal. Each list still sorts by foot depth. Equal depths retain input order, and feet on the midpoint remain on the right. Two explicit side comparisons preserve the previous exclusion when the midpoint is NaN. No partition survives the call.

For a finite six-foot layout, the previous partition explicitly allocated twelve temporary records, two mapped arrays and two filtered arrays. The new partition allocates no per-foot records and uses two index lists inside one outer array. Phase output and both sorts remain. Midpoint coordinate arrays were subsequently removed by the bounds refinement below. These are source-derived allocation counts, not engine heap measurements or timings. No complete gait-generation speedup is claimed.

`gaitPhases.test.ts` checks a hand-calculated layout with tied depths and centerline feet, then compares the previous equations across 131 layouts and their nonempty edits. Cases include both source orders for sizes two through 64, empty and single-foot inputs, NaN and infinite coordinates. It also checks that inputs remain unchanged. Existing animation tests cover generated gait targets, while drive-class tests retain the six-foot tripod check. No timeout, retry or quarantine changes apply.

[Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) retains the same walk creation, timing, playback and three screenshots. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) retains its target-based motion, joint fields and robot selection. Both articles were read against the change. No action, label or visible state changes, so their prose and screenshots stay unchanged.


## Arm search accumulates distance bounds directly

The whole-app search found one nearest-option distance calculation in `utils/armSearch.ts`. Individual-target reachability and cached shoulder bounds share it. Size Arm to Targets and the agent's `size_arm` use the same search. Both paths now accumulate minima directly, and the multi-target bound accumulates their maximum. Distance arithmetic, option order, NaN propagation and empty-set infinities stay unchanged. No bound survives its search.

For a bound containing three or eight targets, the previous source allocated four or nine mapped arrays. The new calculation allocates no distance arrays. Each individual-target refusal probe also removes its single-target wrapper and two mapped arrays. These are source-derived allocation counts, not heap measurements or timings. Distance evaluations, candidate order, analytic screens, cached bounds and the search budget are unchanged. No complete sizing speedup is claimed.

Existing `src/utils/armSearch.test.ts` checks complete selected geometry and ordered confirmations for three target layouts, translated and turned bases, edited inputs, unreachable-target blame, empty targets and distance-call budgets. `armSizing.test.ts` retains full sizing and forward-kinematics coverage. No timeout, retry or quarantine changes apply.

[Size an arm from the points it must reach](../../site/content/help/size-an-arm-to-its-targets.md) was checked against the implementation. Target selection, sizing, refusals and insertion remain unchanged. No action, label or visible state changes, so its prose and screenshots remain accurate without edits.

Preflight also flagged [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) because it covers the owning guide. Its fields, joint sources, hierarchy, anchoring, deletion, poses, IK and robot selection are unchanged by this calculation. It has no screenshots. Both help articles were read and remain unchanged because all their described behavior still holds. The follow-up verified the sizing article against `useArmSizing.ts`, `ArmSizingSheet.tsx`, `armSizing.ts` and `armBuild.ts`: guide selection, the 200 g default, eight-target limit, origin and yaw, 5 mm link steps, 2 mm reach tolerance, named refusals, Pose activation and desktop-only printed links retain their existing paths. The three existing captures show the same sheet, placed arm and refusal states. The changed guide only documents allocation inside the search, which changes none of the joint concept article’s claims.

Targeted validation passed formatting, lint, documentation, site copy for 291 pages, TypeScript and all 47 tests in eight related files. The log is `scratch/check-arm-bounds.log`. Copy accounting reports zero added, changed or removed strings.

## Four-bar rotation evaluates only the requested link angle

The whole-repository search found one angle-pair producer, `utils/linkageKinematics.ts`, and one consumer, `utils/kinematicsLoop.ts`, plus its re-export from `utils/linkage.ts`. All now use the role-specific `linkAngle`. Analytic forward kinematics and simulation loop setup share `loopValue`. Full-pose and coupler-path sampling do not request link angles and need no change.

Each reachable `loopValue` evaluation previously calculated four output angles across the rest and driven closures, even though only two were read. It now calculates those two angles. Including the two closure direction angles, inverse-tangent calls fall from six to four. Two angle-pair result records are also removed. These are source-derived operation and allocation counts, verified by a spy for both link roles, without timing or complete-playback latency claims. Closure trigonometry and returned rotation arithmetic remain unchanged.

`kinematicsLoop.test.ts` compares exact rotations with the previous pair-based calculation over 200 seeded, edited mechanisms, both roles and nine driver inputs per role. It also covers zero-valued angles, unreachable closures, coincident pivots and nonfinite dimensions. Existing linkage insertion and closed simulation tests cover downstream geometry and physics. No timeout, retry or quarantine changes apply.

The existing [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) articles retain their controls, results and limits. No action, label or screen state changes, so no help prose or screenshot changes are needed.

Focused `check:changed` validation passed formatting, lint, documentation, site copy for 291 pages, TypeScript and 3,978 tests in 586 related files. One existing test file was skipped. The log is `scratch/check-link-angle.log`. Copy accounting is zero added, zero removed and net zero.

The preflight follow-up rechecked both articles against the final diff. In the linkage task, `linkage.ts` changes only its angle-helper re-export. Its 5-to-12-point and 10-to-300-mm limits remain unchanged. `useSketchPath.ts`, `SketchPanel.tsx`, `LinkageChoices.tsx`, `SketchPathLayer.tsx` and `linkageParts.ts` retain the described drawing, history, preview, error labels, highlighting and insertion behavior. The existing points, linkages and inserted captures depict those unchanged states. In the joint concept, `kinematicsMotion.ts` still drives each loop member from the clamped crank value through `loopValue`, and `sim/mjcfLoops.ts` still uses that rotation for physical loop setup. The new scalar helper keeps the selected angle, wrapping and unreachable-closure fallback unchanged. The guide edit documents only discarded calculations. Neither article contains an obsolete step, label or screenshot, so both remain unchanged as the findings permit.

## Robot pivot summaries share one scan

A whole-app search found one robot identity and pivot summary in `utils/kinematicsRig.ts`. Pose, IK, simulation preparation and engineering calculations share it through `buildRig`. Other sorts choose policies, files or display order and have different selection rules.

For P eligible pivots, the previous summary built two P-entry ID arrays, sorted one, then traversed the pivots three times for coordinate sums. The new summary selects the minimum ID and accumulates all three sums in one P-entry traversal. It retains the base-joint filter and the joint and robot display ordering. String comparison uses UTF-16 ordering, matching the previous default sort. Each coordinate keeps its original addition order and division. These are source-derived allocation and traversal counts, without timing assertions or a claim about complete rig construction speed.

`kinematicsRobotGroups.test.ts` compares keys and pivots with the previous equations across 80 generated connected-root fixtures. It includes mixed-case, numeric and Unicode IDs, cancellation-sensitive sums, signed zero, infinite and NaN coordinates, excluded descendants, source preservation and repeated independent builds. Existing cases cover interleaved robots, duplicate names, shared parts, edits, undo and 300- and 600-root components. No timeout, retry or quarantine changes apply.

No user action, label or screen state changes. The existing joints and kinematics help article retains accurate instructions and needs no new screenshot.

Preflight flagged [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), which covers the edited module and guide. The complete article was reread against the final diff and the downstream root-transform consumers. It remains unchanged intentionally:

- “What a joint holds” and “Where joints come from” describe joint fields and import controls. The summary scan changes neither declarations nor entry points.
- “How parts follow their joints” describes parent chains and ownership. `jointTree`, `partOwners`, `jointChains` and `connectedMembers` are unchanged. The same base joints enter the pivot summary.
- “A pose never edits the design” and “Inverse kinematics” retain their behavior. `kinematicsMotion.ts` still constructs each root matrix from the same robot key and pivot. The change preserves coordinate addition order and division, without modifying pose application, measurement or solving.
- “Several robots in one scene” still describes separate robots and selected-robot posing and import. `robotGroups` retains membership, `robotOf` assignment, display sorting and duplicate naming. The selected minimum ID is identical to the former default sort.

The article contains no screenshots. No step, label, link or illustrated state became obsolete, so editing its prose or adding a capture would not correct any claim. The preflight command reports unchanged covered articles mechanically and retains this reminder after verification.

Validation: the initial explicit changed-file run passed docs, site copy and types, but found a test-group length lint error and one timeout in unchanged `src/cases/slots.test.ts:113`. The related run finished with 587 files and 4,086 tests passing, one skipped file and test, and that single failure after 110.93 seconds. The failing MuJoCo handoff test exceeded its existing 5,000 ms budget at 5,070 ms. No cause was established, and no timeout, retry or quarantine was changed. The log is `scratch/check-pivot-summary.log`.

After separating the new test group and formatting it, the final check on the changed test and documentation passed formatting, lint, docs, site copy for 295 pages, types and all eight robot-group tests. That run is `scratch/check-pivot-final.log`. The implementation was unchanged between these runs. Copy accounting reports zero added, changed or removed strings. Preflight retains only the reviewed help-coverage reminder above.


## Cylinder refits stop at the first failing corner

The whole-app residual lookup search found one triangle outlier filter, in `joints/cylinderFit.ts`. Both clicked-face fitting and automatic shaft-and-bore discovery use it. The filter now rejects at the first corner whose residual fails the inclusive limit. It removes two three-entry arrays per tested triangle and reads one to three errors instead of always reading three. Triangle order, inclusive thresholds and NaN rejection remain unchanged. These are source-derived allocation counts, not timing measurements.

A scratch parity probe compared complete results with the previous implementation across 72 fits. Fixtures used 16, 64 and 128 cylinder segments, four dent sizes, three angular spans, two minimum-span thresholds, reversed triangle order and repeated triangles. Results matched exactly. Instrumented residual-map reads fell from 50,550 to 32,876 across those fixtures. The probe ran locally in Node with Vitest, without a browser or physical device. It establishes fewer lookups on these fixtures, not whole-interaction latency. Probe and results remain in `scratch/cylinder-refit.test.ts`, `scratch/cylinder-refit-counts.json` and `scratch/cylinder-refit.log`.

Existing `cylinderFit.test.ts` covers clean cylinders, distorted-patch refits, first-seen vertex order, source preservation and angular-span refusal. Axis-finder and joint-candidate tests retain coverage of both consumers. No timeout, retry or quarantine changes apply.

The help articles [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), [Join two parts with a hinge or slider](../../site/content/help/join-two-parts-with-a-hinge.md) and [Agent tools](../../site/content/help/agent-tools.md) retain accurate instructions. The refinement changes no action, label, result or visible state, so no help prose or screenshot changes are needed.


Preflight follow-up rechecked every section of [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) against the final diff. The joint-fields table still describes the same type, parent, child, pivot, axis, range, limb, servo and actuation fields. The only changed computation is triangle retention inside cylinder refitting. `axisFinder.ts` still calls that fitter through `roundFaceAt` and `roundFaces`, with the same 30-degree clicked-face and 180-degree bore thresholds. `jointCandidates.ts` still uses those round faces for automatic discovery. The guide addition documents that internal filter only.

The article's joint sources and hinge-task link therefore remain accurate. Hierarchy, anchoring, deletion, four-bar behavior, rest pose, inverse kinematics and selected-robot behavior have no changed code in this diff. The article contains no screenshots. No step, label, link or visible state became obsolete, so the help article remains unchanged as the finding permits. The mechanical covered-file reminder remains after this verification.


## Four-bar residuals decode angles as they are consumed

The whole-app search found one residual evaluator in `utils/linkageFit.ts`. Sketch Path and agent synthesis both reach it through `linkageOps.ts` and `synthesizeFourBar`. The public `decode` remains the angle-array producer for completed fit candidates. Residual evaluation shares its shape decoder, then advances one crank angle while scanning targets with an indexed loop. The exponential step, direction, addition order, closure equations and sweep penalty remain unchanged.

For five- and twelve-point paths, each residual evaluation removes one temporary decoded-angle array containing five or twelve values. A Jacobian probes fourteen or twenty-one parameters, removing fourteen or twenty-one arrays and seventy or 252 stored angle entries. Each evaluation also removes its target callback. Decoded shape records, closure geometry, derivative columns and retained candidate angles still allocate. These are source-derived allocation counts, without a claim about complete interaction latency.

`linkageClosure.test.ts` compares complete residual vectors against the array-based equations across 200 generated trials and their edits. Angle increments now vary alongside dimensions. Added cases cover zero, one, two, five and twelve targets in both directions with signed zero, large and nonfinite starting angles. Existing coverage retains bound changes, resized workspaces, source preservation, independent outputs, tangencies and failed closures. No timeout, retry or quarantine changes apply.

A scratch comparison matched complete solver states for five- and twelve-point fixtures, then complete synthesis results for four paths. Those paths were a five-point line, a twelve-point transformed coupler curve, an eight-point wave and a five-point out-of-range path. Geometry, errors, crank ranges and candidate order matched exactly. Source and logs are `scratch/linkage-angle-bench.test.ts`, `scratch/linkage-angle-bench.log` and `scratch/linkage-angle-results.json`.

The existing [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) task retains its drawing steps, preview states, insertion behavior, 5-to-12-point limit and 10-to-300-mm link limits. Its screenshots still depict the same states.

The preflight follow-up checked every section of [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) against the final diff. The joint-fields table and joint sources remain accurate because this change touches only candidate fitting inside `linkageFit.ts`. `linkageParts.ts` still inserts the same servo-driven crank and analytic loop members. `kinematicsLoop.ts` still derives coupler and rocker rotations from that crank, and simulation setup is unchanged. The guide addition describes temporary fitting storage only.

The article's hierarchy, anchoring, deletion, Rest Pose, inverse kinematics and selected-robot descriptions retain their existing code paths and labels. Its links still describe the same tasks. The article contains no screenshots. No step, label, link or visible state became obsolete, so it remains unchanged as the preflight finding permits.

On macOS arm64 with an Apple M5 Pro and Node 26.13.0, the residual microbenchmark used five warmup batches and 21 alternating measured batches of 10,000 evaluations. Five-point median time moved from 0.400 to 0.399 microseconds, and twelve-point time from 0.912 to 0.883 microseconds. These local timings establish no visible interaction improvement and are not CI thresholds. An exploratory scratch run combining this benchmark with repeated complete synthesis exceeded the scratch harness's five-second limit. The final scratch probe excludes repeated synthesis timing and passes without changing any timeout. Complete synthesis parity remains covered.

Targeted validation passes formatting, lint, docs, site copy for 295 pages, TypeScript and all 119 tests across 17 related files. Copy accounting reports zero added, zero changed, zero removed and net zero. The validation log is `scratch/check-linkage-angles.log`. Preflight repeats a covered-file reminder for the kinematics article because its guide changed. The article was checked against the final diff and remains accurate, as the reminder permits.


## Gaits resolve foot chains once

A whole-app search for `swingJoints`, `legJoints` and `buildGait` found one gait joint-selection implementation. Pose walk cycles, agent animation and simulated drive-leg generation all reach it. Other chain queries belong to IK or target construction and retain their distinct inputs.

Selection now resolves each foot's ownership and joint-chain map entry once. It gathers joint ids in their original first-encounter order, then appends movable joints that are absent from at least one foot chain. Previously every membership probe repeated both map lookups. Selection also built two candidate arrays and a shared-joint array before filtering its final output. Those three arrays and shared-joint deletions are gone. One foot-chain reference array replaces them, and the joint-id set and returned list remain.

For six feet with two common body joints and three unique joints per foot, ownership and chain lookups each fall from 39 to six. The common joints require twelve membership probes. The eighteen unique joints require 21 probes because membership checks stop at the first missing foot. These are source-derived counts, without timing assertions or a claim about complete gait latency. IK still dominates generation.

The local `scratch/gait-chains.test.ts` probe compares complete generated animations, notes and IK errors with the previous module in 24 configurations. It varies shared body joints, fixed ankles, foot order, repeated feet and both orientation modes. Every output matched exactly. `animation.test.ts` retains stance and swing geometry and rejected requests, and now checks ordered leg-only keyframe channels with a shared body and fixed ankles. No timeout, retry or quarantine changed.

No user action, label or screen state changes. [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) retains accurate steps and screenshots. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) retains accurate joint, hierarchy and posing descriptions.


The focused check passed formatting, ESLint, types and site copy. Its related-test selection reached 241 files: 231 passed, nine failed and one was skipped. There were 1,758 passing tests, 30 failures and one skipped test. The animation and gait tests passed. Twenty-eight failures hit the existing 5,000 ms deadline in Case simulation, classroom seed batches, league replay, Motor Kit transitions and native passive parity. Two classroom assertions then reported incomplete seed batches. Concurrent checks from other worktrees were active, but this run does not establish contention as the cause. The diagnostics are retained in `scratch/gait-check-failures.log`. No unrelated tests, deadlines or quarantine entries were changed, and the broad selection was not repeated.

Preflight reported the unchanged Joints and kinematics help article because it covers the edited guide. The article was reread against the final code. Joint fields, import sources, hierarchy, posing, IK and selected-robot behavior remain accurate, and it has no screenshots to update. This reminder remains intentionally unresolved by an article edit.


## Gaits measure foot bounds once

The whole-app search found one gait planner and one alternating-phase implementation in `utils/gait.ts`. Pose walk cycles, agent animation and simulated drive-leg generation use this planner. Standalone phase checks use the same exported phase function. Other geometry bounds measure different inputs and remain unchanged.

`gaitBounds` now scans feet once for minimum height and lateral extrema. The planner shares the resulting spread and midpoint across gait shape, root sway and automatic alternating phases. Previously ordinary preparation allocated two n-coordinate arrays and made seven n-entry traversals, including coordinate collection. Automatic alternating phases added two more n-coordinate arrays and four more traversals for the same midpoint. Those bounds calculations now use one traversal and one constant-size record. Phase partitioning and sorting remain separate. These are source-derived storage and traversal counts, without a timing or complete gait-speed claim.

The minimum and maximum operations retain NaN, infinity and signed-zero behavior. Midpoint addition, spread subtraction, leg-height clamping and the first-foot sway sign retain their arithmetic order. There is no cross-call cache.

`gaitBounds.test.ts` compares the previous equations across 136 layouts and their nonempty edits, including empty, coincident, signed-zero, overflowing and nonfinite coordinates. A 160,000-foot fixture checks the known bounds beyond argument-spread limits and counts exactly one source-list read per foot. Existing `gaitPhases.test.ts` checks side assignments and stable depth ties. Existing `animation.test.ts` checks stance, swing, ordered channels and rejected requests.

A local scratch probe compared complete animations, notes and IK errors with the previous module in 24 configurations. It covered two, six and eight foot entries, both orientation modes, explicit and automatic phases, shape overrides and later geometry edits. Every result matched exactly. The fixture repeats the biped's foot carriers to exercise multiphase preparation, rather than representing independent six- or eight-leg mechanisms. Source and output remain in `scratch/gait-bounds-parity.test.ts` and `scratch/gait-bounds-parity.log`. No timeout, retry or quarantine changed.

The help articles [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) were checked against the change. Walk creation, default motion, joint fields, hierarchy, IK and selected-robot behavior remain unchanged. No user action, label or screen state changes, so their existing text and screenshots remain accurate.


Validation passed formatting, lint, documentation links, site copy for 295 pages, types and 1,802 tests across 241 files. One file and test were skipped by the existing configuration. The related selection reached 242 files and finished in 82.76 seconds. The log is `scratch/check-gait-bounds.log`. Copy accounting reports zero additions, changes and removals.

Preflight reports an unchanged covered-file reminder for Joints and kinematics because its guide changed. Every section remains accurate: joint fields and sources, hierarchy and four-bar behavior, design versus pose, IK and selected-robot operations are unchanged. It has no screenshots. The reminder requires checking the article and allows leaving accurate text unchanged, so no article edit is needed.

## Four-bar insertion prepares only the requested bar

The app-wide search found two eager per-bar lookup tables in `src/linkage/linkageParts.ts`, one for shapes and one for ports. Every insertion calls each table four times, discarding three bars each time. Sketch Path and agent synthesis both use `linkageParts`. Static title lookup remains unchanged because it constructs no per-insertion geometry.

Guard returns now select the requested bar before allocating its point list, shape record or ports. Source-derived counts per insertion fall from 16 shape records and point lists to four. Port records fall from 36 to nine with a coupler point, or from 32 to eight without one. This removes 75% of these constructions, not 75% of total insertion work. Pivots, bounding meshes, recipes, servo mating and world transforms still run as before. These are allocation counts, not latency measurements.

On November 16, 2026, `scratch/linkage-parity.test.ts` captured complete builds before the edit and compared serialized results after it. All nine cases matched exactly across three ground angles and absent, axial and offset coupler points. The baseline remains in `scratch/linkage-baseline.json` for this session. Existing `src/linkage/linkageParts.test.ts` checks posed curves, actuator assignment, servo height and recipes on ground and tilted planes. No timeout, retry or quarantine changes apply.

The actions and visible states in the linkage help articles remain unchanged. No help or screenshot update is needed for this internal allocation reduction.

## Smooth animation shares span time powers

A whole-app search for four-point interpolation and cubic time expressions found one Catmull–Rom animation sampler, in `utils/animation.ts`. Pose playback, simulation controllers, motion references and agent pose checks share it. Each smooth sample now calculates squared and cubed normalized span time once. Joint channels and the three root-position axes reuse those two scalars. The linear blend takes an early return without either calculation.

For C interpolated scalar channels, the quadratic and cubic terms previously used 5C multiplications by time. They now use 2C + 2, removing 3C - 2 multiplications. A 64-joint clip with a translated root has 67 scalar channels, reducing these multiplications from 335 to 136 per sample. These are source-level operation counts, not timings or a claim about complete playback latency. Reassociation can change floating-point rounding, while support frames, sparse defaults, clamping, loops and quaternion root rotation remain unchanged.

`animationInterpolation.test.ts` compares 64 nonlinear joint channels and three root axes against the preceding polynomial at seven span times, before and after an endpoint edit, within nine decimal places. It checks source preservation too. Existing animation and time-sampling tests retain sparse-channel, loop-seam, clamping and root-rotation coverage. No browser flow, timeout, retry or quarantine changes apply.

Final changed-file validation passed formatting, lint, documentation, site copy for 314 pages, types and 259 related test files with 1,991 passing tests and one existing skip. The related-test run took 101.49 seconds. `node tools/copy-diff.mjs` reported net zero strings. Preflight flagged the unchanged Animate a robot and Joints and kinematics help articles for inspection. Their steps, labels and screenshots still hold because only scalar interpolation arithmetic changed.

## Xacro entry selection scores each root once

The app-wide search found one xacro entry scorer in `src/utils/robotImport/entry.ts`. `readModel.ts` uses it for local folders, archives and linked repositories. Other description priorities and path-depth sorting remain separate.

The previous selector built a record for each peeked xacro, retained eligible records, scored every eligible root to find the maximum, then scored them all again to retain ties. The selector now visits the peeked files once, excludes included and nonrobot documents, and scores each eligible root once. A better score clears the owned winner list. Ties append paths in the original order before the unchanged depth selector.

Source-derived counts for 24 and 48 eligible roots reduce score evaluations from 48 and 96 to 24 and 48. The per-peek path/text records, retained-record list, score list and filtered winner-record list are removed. The winner-path array remains. File reads, include discovery, document classification and final depth sorting still run. These are operation and allocation counts, without latency measurements or a claim about complete import speed.

`robotImport/entry.test.ts` checks score priority over depth, later higher-scoring roots, lexical and depth ties, included high-scoring files, nonrobot and empty documents, source preservation and edits between calls. Existing cases cover XML and xacro peek limits, description priority, scope and empty results. No timeout, retry or quarantine changes apply.

The three covered help articles were reread against the final selector, its diff and `readModel.ts`:

- [Import a robot](../../site/content/help/import-a-robot.md): `chooseEntry` retains description priority, include exclusions, scoring criteria and final depth ordering. `treeEntry` still opens the same robot choice list for tied entries. Explicit file choices, xacro expansion, import controls and shelf operations are untouched. Its four screenshots show unchanged states.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md): the selector still supplies the same entry to `readModel`, which expands xacro before the unchanged URDF parser. Joint fields, passive springs, hierarchy, posing, IK and per-robot selection are untouched. The article has no screenshots.
- [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md): link validation, missing-description errors, mesh loading, XML errors and passive-joint handling are untouched. Empty candidate sets still return null, and `treeEntry` still maps that to the same local or linked-source error. Recovery steps and quoted messages remain accurate. The article has no screenshots.

No article step, label or screenshot becomes inaccurate in this refinement. The articles remain unchanged under preflight's explicit allowance for accurate covered articles. The three automated reminders remain present because preflight detects file coverage, not whether prose became untrue.

Focused validation passed formatting, ESLint, documentation, site copy for 314 pages, types and all 307 related tests across 41 files. Copy accounting reports zero added, changed and removed strings. The check log is `scratch/check-xacro-final.log`.

## Translation-only animation roots omit rotation work

A whole-app search for `sampleAnimation`, `blendRoot`, `quatOf` and quaternion slerp found one shared root animation interpolator in `utils/animation.ts`. Pose playback, simulation controllers, motion references and agent pose checks all use it. The viewport data-frame slerp handles recorded quaternion poses, where both rotations are supplied, and does not share this missing-channel case.

Each sampled span with a root but no endpoint rotation previously constructed two quaternions and three Euler objects. It called `setFromEuler` twice, slerp once and `setFromQuaternion` once. Those constructions and calls are now omitted. The returned rotation tuple remains independently owned and preserves the identity conversion's `[-0, 0, -0]` values. Explicit rotations, including explicit zero rotations, still use the original quaternion calculation. These are source-derived allocation and operation counts, without a timing claim about complete playback.

`animationRoot.test.ts` checks linear and smooth sampling against the preceding quaternion calculation. It checks absent endpoint roots with outer support roots, the loop seam, independent results and rotation edits after translation-only samples. Spies assert zero quaternion preparation and Euler conversion calls for two consecutive translation-only samples in each mode. Existing animation tests cover clamping, sparse channels and smooth interpolation. No timeout, retry or quarantine changes apply.

The covered articles were reread against the final sampler diff, the owning guide and the animation controls:

- [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md): Walk Cycle and Import BVH still use the same add control. Playback, scrubbing, pause, Loop, Rename and Delete still use the same handlers in `AnimationsSection.tsx`. The sampler preserves positions and identity rotations, and leaves explicit rotations, span selection and loop timing unchanged. BVH matching, In place, Frame rate and import feedback are untouched. The existing `menu.png`, `retarget.png` and `loop.png` screenshots describe those unchanged controls and states.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md): the guide change describes an internal animation shortcut. It changes no joint field, import, hierarchy, mount, passive linkage, empty-joint deletion, design-versus-pose mapping, IK or robot selection behavior. Every section remains accurate. This article has no screenshots.

Neither article has a step, label or screenshot made inaccurate by the refinement. Both remain unchanged under preflight's explicit allowance for accurate covered articles. Its two coverage reminders remain mechanically present because the detector checks touched paths rather than the accuracy of unchanged prose.

Changed-file validation passed formatting, ESLint, documentation, site copy for 321 pages and types after formatting corrections. The initial related run passed 1,982 tests with one existing skip across 260 selected files in 96.85 seconds. The final run passed 1,981 tests with one existing skip, but the existing `src/cases/slots.test.ts` Hand Off to a Spot test exceeded its 5,000 ms timeout. Its source is unchanged. All new rotation cases passed in both runs. Logs are `scratch/check-animation-root.log` and `scratch/check-animation-root-final.log`. This is an unresolved validation finding, without a retry, timeout change or quarantine. Copy accounting reports net zero strings.

## Fastener assignment shares joint reaches

Repository-wide searches found one follower assignment implementation in `assembly/followers.ts`. `assembly/rigJoints.ts` and `utils/useFastenerRig.ts` use it for verification, poses and simulation. All three public assignment functions share the same preparation helpers.

Combined attachment previously built downstream sets three times per joint, collected explicitly listed IDs three times and assigned moving hardware twice. It now does each once. Standalone fixed-side assignment previously prepared downstream sets and listed IDs twice, and now prepares them once. No preparation survives the call. Carrier and mount ranking, first ties, direct-before-indirect ordering, listed-part exclusions and output ownership stay unchanged.

The 30- and 60-joint fixtures in `followerPreparation.test.ts` assert 30 and 60 downstream calculations per combined call, down from 90 and 180. Standalone mount calls fall from 60 and 120 calculations to 30 and 60. These are operation counts, without timing assertions or a claim about complete rig-build latency. Each downstream calculation still traverses the joint graph, and carrier selection still visits candidates.

The new test covers deepest carriers, first ties, servo exclusions, fixed sides, indirect followers, independent robots, empty clamps, source preservation and later edits. Existing `followers.test.ts` retains real range-of-motion and rig-membership coverage. No user action, label or visible state changes, so help instructions and screenshots remain accurate.

On November 17, 2026, `scratch/follower-parity.test.ts` matched ordered carrier maps, ordered mount maps and complete followed joints against the preceding implementation for 160 generated rigs. It repeated each comparison after joint-order, child and actuator edits and checked source preservation. The comparison passed in 890 ms on macOS arm64. This is a test-run duration, not an assignment benchmark.

Preflight identified [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) as a covered article. Its hardware paragraph now distinguishes moving links from fixed mounts and names the separate nut and insert relationships. These are the existing ownership rules preserved by the refinement. Hierarchy, mount anchoring, posing, joint deletion, IK and per-robot selection remain unchanged. The article has no screenshots, and no visible state changes require new captures.

Changed-file validation passed formatting, ESLint, docs, site copy for 323 pages and types. Related selection passed 471 tests across 63 files, including the follower tests, and failed two unchanged tests at their existing 5,000 ms timeouts. The failures were `classroom/grading.test.ts`'s Carry a cup valid submission for seeds 1 through 5 and `cases/fixtureWorkflow.test.ts`'s reused chest scene workflow. The related run took 75.04 seconds. No baseline comparison establishes their cause. They remain unresolved validation findings, without retries, timeout changes or quarantine. Logs are `scratch/check-followers.log`, `scratch/check-followers-docs.log` and `scratch/follower-parity.log`. Copy accounting reports net zero strings.

## Xacro extrema consume numeric arguments directly

A repository-wide search found two numeric argument maps in `utils/robotImport/xacroExpr.ts`, for `min` and `max`. Properties, macro arguments, conditions, `${}` and `$(eval)` all reach this evaluator through xacro expansion. Local folders, archives and linked robot descriptions share the expansion path. The `math.` aliases use the same built-ins.

Each extremum call previously allocated a numeric array of the argument count and spread it into the native function. The shared accumulator removes that array and the spread call. A 32-argument call removes one 32-element numeric array. It still converts every argument in order and performs one binary native extremum call per argument. Parser tokens, thunks and the evaluated argument list remain allocated. These are source-derived allocation counts, without a latency measurement or a claim about complete import speed.

`xacroExpr.test.ts` compares both built-ins with the previous mapped calculation across 32 generated numeric lists and seven edge-case lists. It covers empty inputs, booleans, both signed-zero orders, infinities, NaN, nested extrema, math aliases and the first rejected string after a nonfinite result. Existing expression, expansion and robot-import tests retain parsing, scope and import coverage. No timeout, retry or quarantine changes apply.

The three preflight coverage reminders were checked against the final accumulator and guide diff:

- [Import a robot](../../site/content/help/import-a-robot.md) still describes the same sheet, description selection, local import and shelf actions. Xacro properties, macros and defaults produce the same values, while unsupported expressions still stop import. Its `link.png`, `choose.png`, `robots.png` and `imported.png` captures show controls and states untouched by numeric accumulation.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) still describes the same imported axes, limits, torque limits and passive springs. No joint declaration, ownership, hierarchy, posing, IK or robot selection code changes. The contributor guide adds only an internal evaluator fact. This article has no screenshots.
- [A robot won't import from a link or folder](../../site/content/help/troubleshoot-app-robot-import-fails.md) retains every message and recovery action. Link validation, mesh loading, file selection, zip limits, XML errors and passive-joint handling are untouched. The evaluator still rejects the first string argument even after NaN or infinity. This article has no screenshots.

No article step, label, limit or visible state becomes inaccurate. All three articles remain unchanged under preflight's explicit allowance for accurate covered articles. Its coverage reminders remain mechanically present because the detector checks touched paths rather than whether prose became untrue.

A numeric fold probe on November 17, 2026 used Node 26.13.0 on macOS arm64. Each batch called both extrema 100,000 times on `sin(i)` lists. Two warmup batches preceded nine measured batches, alternating which implementation ran first. Median before/after batch times for 2, 8, 32 and 128 arguments were 7.918/2.047, 11.717/6.002, 26.899/21.873 and 103.484/87.301 ms. Checksums matched. The probe includes numeric conversion and both extrema, without parsing, expansion, mesh loading or a CI timing assertion. Script and raw results are `scratch/xacro-extrema-bench.mjs` and `scratch/xacro-extrema-bench.json` in the implementation session. An earlier callback-based fold regressed at 32 and 128 arguments, so the final fold uses direct native calls selected by the built-in's fixed maximum flag.

Final scoped validation passed formatting, ESLint, docs, site copy for 323 pages, types and all 352 related tests across 47 files. The related run took 3.59 seconds. The log is `scratch/check-xacro-extrema-final.log`. Copy accounting reports net zero strings.

## Inserted four-bars prepare their bar rotation once

Whole-app search found one CAD-to-scene bar rotation calculation in `linkage/linkageParts.ts`. Sketch Path insertion in `workspace/useSketchSession.ts`, agent insertion in `linkage/agentLinkage.ts` and closed-linkage simulation fixtures share this builder. The calculation now belongs to the insertion frame, rather than each bar. Each part still receives an independent rotation array. Preparation ends with the call, so later insertions read current placement.

For every four-bar insertion, rotation preparation falls from four calls to one. This removes three matrix inversions, three matrix multiplications, six Matrix4 clones, three Euler objects and three Euler extractions. These are source-derived operation and allocation counts, not heap or latency measurements. Other CAD, servo and joint calculations remain. No complete insertion speedup is claimed.

`linkageParts.test.ts` retains coupler-curve, servo mounting, lift, joint-range and CAD-recipe coverage on ground and tilted planes. Added coverage checks independent bar rotation arrays and fresh arrays across insertions. No timeout, retry or quarantine changes apply.

Rechecked [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) and [Simulate a four-bar](../../site/content/help/simulate-a-four-bar.md) against the changed builder. Insertion still creates the same four bars, crank servo, mounting and joint sweep. Simulation declarations and controls are untouched. Every step, label and screenshot remains accurate, so neither article needs an edit or new capture. No user action or visible state changes.

Also rechecked [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), which covers the contributor guide. Its joint fields, sources, hierarchy, hardware following, mounting and closed-loop explanation remain accurate. This change only moves repeated rotation preparation within the existing insertion builder. The article has no screenshots and needs no edit.

## Rest-root checks read existing coordinates

Whole-app searches for `isZeroRoot` and root-coordinate predicates found one shared implementation in `utils/kinematicsMotion.ts`. `isRestPose` uses it for legacy and per-robot roots. `withRobotPose` uses it when retaining the selected robot's root. Both callers now inspect the existing tuples without a concatenated coordinate array or per-call predicate callback. With both offsets present, each check removes one six-element array. Missing offsets no longer construct fallback empty arrays. Position checks can reject a root before visiting its rotation. These are source-derived allocation counts, without a claim about complete pose latency.

`kinematicsRoot.test.ts` compares the old predicate for missing roots and offsets, each coordinate in position and rotation, signed zero, both sides of the strict tolerance boundary, infinity and NaN. It checks legacy and per-robot rest-pose classification and source preservation. Existing kinematics tests retain selected-robot pose merging and transform coverage. No timeout, retry or quarantine changes apply.

Rechecked [Joints and kinematics](../../site/content/help/joints-and-kinematics.md), the covered article. The design-versus-pose behavior, Rest pose action, selected-robot scope, joint fields and hierarchy stay unchanged. No step, label or visible state changes, and the article has no screenshots. Its text remains accurate without an edit.

A predicate-only probe on November 17, 2026 used Node 26.13.0 on macOS arm64. Each batch made 1,000,000 calls over six roots: empty, position-only zero, rotation-only zero, both zero, translated and rotated. Four warmup pairs preceded eleven alternating measured pairs. Median batch time fell from 17.996 ms to 7.317 ms, with matching classification totals. This excludes rig construction, transforms and rendering, and sets no CI timing threshold. The script and raw samples are `scratch/root-offset-bench.mjs` and `scratch/root-offset-bench.json` in the implementation session.

Final scoped validation passed formatting, ESLint, documentation, site copy for 329 pages, types and 4,829 related tests across 688 passing files, with one existing skipped file and test. Related tests took 110.37 seconds. The log is `scratch/check-root-offset-final.log`. The initial check found a lint rejection of an inverted comparison and was stopped after its replacement check started. The final predicate names the tolerance result before testing it, preserving NaN rejection. Copy accounting reports net zero. Preflight's unchanged-article reminder was resolved by the article inspection above.
