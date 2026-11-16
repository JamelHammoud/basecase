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

The [Design a linkage from a path](../../site/content/help/design-a-linkage-from-a-path.md) task and [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) concept remain accurate. Their controls, limits, coordinates, insertion, posing and simulation behavior do not change. The concept has no screenshots or numbered steps. Its four-bar explanation still matches `kinematicsLoop.ts`, which uses unchanged `linkAngles`, while preview bars and insertion still use unchanged `fourBarPose`. Joint fields, sources, hierarchy, deletion, modeled poses, IK and robot selection are outside the point-only sampling change. No help text or screenshot state needs an edit.

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

The same tests cover sparse and empty frames, own enumerable names, inherited and hidden properties, channel getters that must remain unread, source preservation, later edits and independent sets. Pose filtering retains the rig’s joint order, while the agent summary retains its unique channel count. Repository searches found these two production RobotAnimation channel-union consumers. The tuple-based `skills/moveFixtures.ts` builder prepares test fixtures rather than discovering channels on an existing animation. No UI, workflow, help screenshot or quarantine changes.

The three help coverage notices were checked against this channel-discovery change:

- [Animate a robot with a walk cycle or motion capture](../../site/content/help/animate-a-robot.md) keeps the same walk creation, BVH import, playback, scrubbing, pause and loop actions. `sampleAnimation`, gait generation and import behavior are unchanged. The menu, retarget sheet and loop-menu screenshots show unchanged controls.
- [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) keeps the same joint fields, sources, hierarchy, modeled poses, IK and robot selection. The guide addition describes internal channel collection only. The article has no screenshots.
- [The design agent](../../site/content/help/the-design-agent.md) keeps the same animation capability, checks, priorities and editing controls. `animateText` uses the shared collector for the same unique joint count, without changing its reply wording. The article has no screenshots.

All three articles remain accurate and are intentionally unchanged. No new capture or help copy is needed for this internal allocation refinement.
