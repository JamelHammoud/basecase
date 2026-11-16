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
