# Assembly and repair planning performance

Implementation: [Assembly and repair planning](../guide/build.md#performance-assembly-and-repair-planning). Shared requirements: [Performance](../guide/performance.md).

## Screw-head contact thresholds stop at three

`ringContacts.test.ts` compares every eight-point contact pattern with the previous full-count verdict. It checks that queries visit the original points in order and stop at the third contact, or visit the whole ring when fewer than three match. Later edits, independent calls, short rings and source preservation are covered. The remaining sleeve-host ranking needs exact counts and retains its full traversal.

A scratch comparison matched complete fastener traces across 160 generated scenes, then matched another 160 traces after role edits and reversed placement order. Fixtures vary host width overlap and height, countersunk heads, washers, separate hardware seats, rotation and translation. Instrumenting exported `insideSolid` and `isNear` calls across the first 160 traces reduced queries from 19,301 to 18,406. Internal calls made within those functions are not counted. The two threshold checks no longer allocate filtered contact lists. Fully matching eight-point rings now need three predicate calls instead of eight.

Measurements used Vitest on macOS arm64 with Node v26.13.0. These are query counts and output comparisons, without timing assertions or a claim about complete assembly-check latency. Controls, report text and help steps are unchanged.

The changed-file check passed formatting, lint, docs, site copy and types. Related selection ran 64 test files with 385 passing tests and one failure. `electron/print/project.test.mjs`'s Bambu Studio compatibility case exceeded its existing 5,000 ms timeout. That case creates and round-trips a multi-material 3MF through the installed slicer, without invoking fastener tracing. Its shared analysis-worker import brings it into related selection. No retry, timeout change or quarantine was added.

## Assembly diagnostics select one candidate without sorting

`blockerChoice.test.ts` compares 500 generated fixtures against stable sorting, checks source preservation and edits, and exercises report lines and blocked service results. Its 300- and 600-choice fixtures require one blocker-count read per direction, two per lip candidate and two per split plane. These are operation counts without timing assertions or a claim about complete assembly-check time.

## Fastener evidence selects winners in one scan

`fastenerProbes.test.ts` checks competing receivers, clipping, the 0.2 mm cutoff, contact counts, tied uncut runs, transformed and reflected placements, role edits and independent results. Its 300- and 600-sleeve fixtures reduce overlap calculations from 4,445 and 9,937 to 301 and 601, including the selected engagement measurement. A scratch comparison matched 320 complete traces against the previous implementation across transformed placements and edited inputs. These are operation counts and output comparisons, without timing assertions or a claim about complete assembly-check time.

## Assembly grid samples use scalar coordinates

`samples.test.ts` checks nearest-cell selection, flat bounds, interior samples, empty geometry, source preservation, replacement solids and transformed output. Its 300- and 600-triangle point-cloud fixtures reduce map and reduce calls from 900 and 1,800 each to zero, and vector-component calls from 10,800 and 21,600 to zero. A scratch comparison matched complete sample arrays across 120 triangle soups at four resolutions, including flat geometry. These are operation counts and numerical comparisons, without timing assertions or a claim about complete assembly-check time.

## Straight moves reuse their grazing probes

`moveBlockers.test.ts` checks forward and backward hits, rigid transforms, reflection, contact faces, lips, source preservation and later direction or placement edits. Its 30- and 60-candidate grazing fixtures reduce sampled-origin clones from 11,010 and 22,020 to zero, and basis construction from 30 and 60 to at most two per query. Broad-phase misses prepare no basis. These are operation counts for move probes, excluding BVH internals, without timing assertions or a claim about complete assembly-check time.

## Build guide fasteners use indexed placement steps

`guideFastenerSteps.test.ts` compares the previous scans across 200 seeded orders and gate sets, source preservation, changed inputs and independent results. Its 300- and 600-fastener fixtures reduce gate-list reads from 90,000 and 360,000 to 300 and 600. These are operation counts, without timing assertions or a claim about complete guide-generation time.

## Driver clearance shares sweep preparation per screw

`driverSweep.test.ts` checks all 15 tool options, blocker order, rigid placements, exclusions, changed inputs and result ownership. On its 300- and 600-part fixtures, envelope expansions fall from 300 and 600 to one per screw. Cosine calls fall from 298 to 262 and sine calls from 306 to 270. These are operation counts, without timing assertions or a claim about complete assembly-check time.

## Mirror-twin checks count clashes once

`twinLint.test.ts` checks these contracts, geometry reports, later edits and source preservation. Its 150- and 300-pair fixtures reduce endpoint reads from 179,700 and 719,400 to at most 600 and 1,200. These are operation counts, without timing assertions or a claim about complete scene-check time.

## Build guide modules share geometry per planning call

`guideModules.test.ts` checks height and name ordering, translated copies, mirrors, missing boxes, small-group folding, empty input, edits, undo and source preservation. Its 100- and 200-module fixtures previously read part boxes 8,250 and 18,678 times. They now require at most 900 and 1,800 reads. These are operation counts for geometry lookup, without timing assertions or a claim that the whole planner is linear.

## Battery lead probes request only the nearest hit

`fitProbes.test.ts` compares against all-hit distances for misses, starts inside solids, axis ties, rotated, translated, scaled and mirrored obstacles, boundary clearances, multiple packs and later placement edits. The 300- and 600-layer fixtures previously collected 1,200 and 2,400 hit records from the layered solid. Each fixture now uses four bounded nearest-hit queries across its two obstacles and no all-hit query. These are query and hit counts, without timing assertions or a claim about complete check time.

## Guide placement updates scores incrementally

`guidePlacement.test.ts` compares complete orders against the previous calculation across 120 seeded scenes, later edits, repeated contacts, missing boxes and outside anchors. Its 40- and 80-part fixtures reduce distance measurements from 19,760 and 164,320 to 780 and 3,160. Contact-list reads fall from 1,482 and 6,162 to 40 and 80. These are operation counts without timing assertions. Candidate and cover selection still revisit remaining parts, so this does not make the complete planner linear.

## Removal and repair index screw relationships

`fastenerPlanning.test.ts` and `repairProof.test.ts` bound stack reads on 150- and 300-part fixtures while checking the resulting plans. On the 300-part fixtures, the previous implementations read stacks 45,150 times for blocked removal, 180,000 for minimum teardown and 90,000 for reassembly proof. Each now stays within 600 reads. These are operation counts, without timing assertions or a claim that the entire search is linear.

## Removal units index mutual blockers once per plan

`removalUnits.test.ts` compares every directed three-part graph, including duplicate, self and unknown blockers, and checks group priority, hardware, source preservation and geometry edits. Complete plans for 150 and 300 interlocked parts have local-move read budgets of 6,825 and 24,900. The previous planner read those moves 292,750 and 2,295,500 times on the same fixtures. Ordinary removal passes still revisit the remaining parts, so the complete planner is not linear. These are operation counts and budgets, without timing assertions.

## Minimum teardown prunes dependency sets directly

`minimalClosures.test.ts` compares ordered results and retained set identities against the previous pruning algorithm for all 512 ordered triples of subsets of three dependencies. It also checks empty frontiers, empty closures, duplicate alternatives, nonadjacent dominated entries, source preservation and later edits. Nested fixtures with 300 and 600 alternatives reduce set-iterator starts from 598 and 1,198 to 299 and 599. The new pruning code creates no subset-copy arrays or superset lists and performs no splice searches. These are operation counts, without timing assertions or a claim about complete repair-planning time. The Cartesian combination of prerequisite alternatives remains unchanged and can still grow combinatorially.

## Insert-wall minima accumulate during probing

`fitProbes.test.ts` checks real hollow-box geometry with three rotations, unequal wall thicknesses, missing upper and lower probe levels, a replacement thinner host, repeated calls, a solid host without two crossings and an absent host. Existing battery lead coverage remains in the same file.

A scratch comparison matched complete fit-probe output against the previous implementation for 240 generated shells. Fixtures vary rotation, translation, wall thickness and host height. A vector-clone spy measured 720 fewer clone calls, three per insert. One reusable origin now replaces those three origins, reducing origin-vector allocations from 720 to 240. Source inspection also removes seven measurement arrays per insert, three mapped lists, three filtered lists and one flattened list, plus the final minimum scan. Ray-hit lists and all 24 radial queries remain. These are allocation counts and output comparisons on macOS arm64, without timing assertions or a claim about complete Build-check latency. No control, report text or help step changes.

The related selection ran 57 files with 455 passing tests and one unrelated failure. `src/design-system/deleteTone.test.ts` reports Delete buttons without the danger tone in `BoardHoleFields.tsx`, `BoardKeepoutFields.tsx` and `BoardPlacementFields.tsx`. Its scanner reads TSX sources, none of which this refinement changes. The insert-wall and existing battery tests passed. No retry, quarantine or unrelated UI change was added.

## Grid subdivision normalizes only the longest edge

Repository search found one longest-triangle-edge subdivision path in `assembly/samples.ts`. Straight-move blockers and enclosure split planes share it. Comparing squared lengths before taking their maximum removes two square roots per triangle. Subdivision density, barycentric arithmetic, sample order and cache keys stay unchanged.

On November 17, 2026, `scratch/sample-parity.test.ts` matched complete Float32 sample buffers against the previous implementation across 80 generated triangle soups at four resolutions and four box scales. Cases include empty and flat geometry, tiny and large coordinates, and source preservation. The existing 300- and 600-triangle fixtures in `samples.test.ts` now assert 300 and 600 square roots, down from 900 and 1,800. These are operation counts and numerical comparisons, without timing assertions or a claim about complete assembly-check latency. No user action, label or visible state changes, so help instructions and screenshots remain accurate.

## Enclosure split probes reuse vector storage

Repository search found the remaining cloned ray origins in `assembly/splitTest.ts`. Straight-move probes in `moveBlockers.ts` already write into retained storage. Split probes now write the 0.15 mm offset into the ray’s own origin and reuse one vector per half-plane for the 0.3 mm containment offset. Both world origin and direction reset before each candidate because the previous candidate transforms the ray into its local frame. Containment preparation still runs only after a nearest hit.

`splitTest.test.ts` compares complete ordered blocker lists against the previous allocating calculation across 24 rigid placements, reversed candidates, duplicate identities, containing solids, misses, empty candidate lists and repeated calls. It also checks source matrices stay unchanged. Fixtures with 30 and 60 walls bound sampled-point clones at six per world sample, all from the unchanged half-plane partitioning. Candidate ray origins and containment points now require zero sampled-point clones. Previously each eligible sample-candidate pair cloned its ray origin, with another clone for each nearest-hit containment probe. These are structural allocation counts, not timings or a claim about complete Build-check latency. BVH queries, hit records and partitioning allocations remain.

No user action, label or visible state changes, so help instructions and screenshots remain accurate. No browser walkthrough, timeout or quarantine changes.

The November 17 targeted code check selected 57 related files. Its first run reported 428 passing tests, a reference-fixture direction-aliasing error in the new test, and two unrelated 5-second timeouts. The reference now uses `Ray.set` to copy its direction, matching the original implementation. The corrected test-only `check:changed` passed both tests in 1.05 seconds, and final formatting and lint checks passed. The other failures were `classroom/grading.test.ts` for the cup-carrying seed batch `[1, 2, 3, 4, 5]` and the scene case in `cases/fixtureWorkflow.test.ts`. Both run simulation workflows outside the changed split probes. Their timeouts remain unresolved, with no retry, timeout increase or quarantine added. Documentation checks passed and the copy diff is zero.

## Removal clearance stops when the verdict settles

Repository search found all boolean uses of the live-blocker list in `assembly/removalOrder.ts`. Screw and part clearance now use `some`, unit clearance uses `every`, and cross-unit fastening checks test each side directly. These predicates short-circuit without allocating filtered live-id lists. Cross-unit checks can still scan a stack twice. Diagnostic lists remain complete, including repeated entries.

On November 17, 2026, `scratch/removal-parity.test.ts` matched complete plans against the previous implementation for 500 seeded six-part scenes, then matched another 500 plans after geometry and stack edits. Cases include groups, unknown blockers, self blockers, multiple driver paths and internal screws. It also checked source preservation. On 300- and 600-entry blocked screw paths, indexed blocker reads fall from 600 and 1,200 to 301 and 601, including the unchanged full diagnostic traversal. `fastenerPlanning.test.ts` retains those read budgets and checks that replacing the blocker list makes the screw and part removable. These are operation counts, not timings or complete planner latency claims.

No user action, label or visible state changes. Existing help instructions and screenshots remain accurate.

The targeted check passed formatting, lint, documentation, types and all 463 tests across 60 related files. Its site-copy phase failed on the unchanged `site/content/changelog/2026-11-17-export-electronics-with-a-robot-kit.md`, line 15, which uses “does not” where the copy rule requires “doesn’t”. No publication text, timeout or quarantine was changed. Copy diff is zero and loop preflight reports no findings.

## Build-guide cover conversion runs once

Repository search found two conversions of the same cover in `guide/renderGuide.ts`, for the early preview event and the completed guide. Both now await the render's cover-thumbnail promise. This removes one image fetch, bitmap decode, 360-pixel thumbnail canvas and WebP encode per completed guide. Dimensions, quality and early delivery stay unchanged. A conversion failure rejects the guide through the existing cleanup path without repeating the failed work.

`renderGuide.test.ts` drives the rendering coordinator with controlled drawing and browser-image boundaries. Two renders with different cover sources perform two bitmap decodes and WebP encodes, down from four. It checks matching preview and saved cover values, early delivery while drawings remain pending, and renderer disposal on encoding failure. These are operation counts, not timings or real GPU measurements. Existing real-render coverage remains in `guideStage.test.ts`. No user action, label or visible state changes, so help instructions and screenshots remain accurate.

The unchanged-help preflight reminders were checked against both covered articles. [The path from design to build](../../site/content/help/from-design-to-build.md) describes the PDF, proven assembly order and printed-part letters, which this thumbnail conversion does not change. [Make a build guide](../../site/content/help/make-a-build-guide.md) retains its Make Guide, cover opening, page navigation, PDF actions, stale state and automatic-update instructions. The cover callback still runs before step rendering finishes, and `useBuildGuide` still sends that result to the card. Both referenced card screenshots show the same current and out-of-date states. Neither article needs a text or screenshot change.
