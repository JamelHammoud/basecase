# Assembly and repair planning performance

Implementation: [Assembly and repair planning](../guide/build.md#performance-assembly-and-repair-planning). Shared requirements: [Performance](../guide/performance.md).

## Retained build repair

The disposable worker reads retained coordinate and index arrays directly, without serialized mesh equality. It expands each solid into owned triangle buffers using twelve bytes per mesh index before BVHs and planner state. Both revisions release their BVHs after planning. Cancellation terminates the worker and rejects late replies. The document refuses a geometry fallback.

The initial whole-robot movement search exceeded existing test deadlines on hexapod and repeated-module fixtures, reaching 13.6 and 12.7 seconds in a focused run. Repair now prepares movement candidates for affected identities, their groups and a 160 mm neighborhood. All remaining solids stay fixed obstacles, and exit bounds include the entire assembly. This reduces search without dropping distant obstructions. The focused matrix then passed 32 tests in 2.79 seconds. These test durations are not a controlled performance comparison. No deadline, retry, wait or merge gate was added.

On November 20, 2026, `scratch/repair-production-perf.mjs` measured the ten production Kit fixtures after integrating main revision `3699e8e13` in an isolated macOS arm64 Node worker. Each design had twenty retained builds. Three samples measured exact comparison and source/target planning, then a real build-store repair retained its target assets and plan. Generated fixture Checks are synthetic Ready declarations. Values below are maximum milliseconds across the three samples and exact retained byte counts.

| Generated design | Compare ms | Plan ms | Source bytes | With repair bytes | Build record bytes |
| --- | --- | --- | --- | --- | --- |
| differential rover | 2.26 | 20.71 | 34,473 | 64,115 | 7,008 |
| SO-101-style arm | 2.48 | 12.90 | 44,426 | 81,786 | 7,286 |
| quadruped | 0.97 | 14.23 | 74,456 | 136,391 | 11,887 |
| hexapod | 2.13 | 12.12 | 101,917 | 186,329 | 15,097 |
| biped | 3.00 | 8.28 | 55,508 | 101,861 | 9,191 |
| pan-tilt camera | 0.38 | 2.93 | 32,576 | 60,569 | 6,523 |
| gripper | 0.45 | 8.80 | 30,030 | 56,062 | 6,270 |
| conveyor mechanism | 1.86 | 2.88 | 27,667 | 51,745 | 6,007 |
| mixed-servo arm | 0.67 | 8.95 | 59,663 | 109,863 | 9,660 |
| repeated limb modules | 1.37 | 11.16 | 112,591 | 207,316 | 15,125 |

The shared source byte count serves twenty builds. With-repair bytes include shared source and target assets, excluding the build record listed separately. Exact hashes, every timing sample and per-design memory snapshots are in `scratch/repair-production-perf.json`. The worker used v26.13.0. Worker used-heap snapshots changed from 104,182,120 to 75,281,992 bytes. Sampled process RSS peaked at 274,513,920 bytes. Heap includes the Vite loader and both retained fixtures, and RSS includes both Node isolates. Neither measures browser peak memory. Garbage collection can lower a later heap snapshot.

Terminating the Node worker during another synchronous planning run took 5.30 ms. Browser worker tests separately establish abort and disposal semantics through controlled workers. Browser cancellation delivery and peak browser memory remain unmeasured. These observations establish neither a production memory bound nor an interactive latency guarantee. The run is not a controlled before-and-after comparison.

The earlier captured seven-part bracket probe remains in `scratch/repair-perf.json`. Its synthetic manifest did not reconcile manufacturing outputs, so it is not the production matrix baseline. Frozen playback shares unchanged view parts and switches cached source/target parts. Export 3MF reads retained output bytes, without geometry preparation on the interaction thread.

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

## Insert-wall rays stop at the measured reach

Repository search found one insert-wall crossing collector, `sortedHits` in `assembly/fitProbes.ts`. All three probe heights and eight spokes use it. The BVH now receives the existing inclusive 25 mm reach directly instead of collecting every crossing and discarding distant hits afterward. Sorting and duplicate-hit removal still run on the retained crossings. The limit stays in the host's local ray frame, including for scaled hosts, matching the previous distance filter.

`fitProbes.test.ts` compares complete fit-probe output with unbounded queries filtered to the same reach on hosts with 150 and 300 nested box surfaces. Both retain a 2 mm wall minimum. All 24 queries supply the limit. The unbounded fixtures produced 3,877 and 7,753 hit records. Bounded collection stays at most 264 records for either fixture. These are operation counts on macOS arm64, not timings or complete Build-check latency measurements. The tests also cover walls just below, exactly at and above the reach, plus the existing rotated shells, missing levels, replacement hosts and battery-lead checks.

No action, label, report or visible state changes, so existing help instructions and screenshots remain accurate. No browser walkthrough, timeout or quarantine changes.

## Frozen individual builds

Implementation and coverage: [Frozen individual builds](../guide/build.md#frozen-individual-builds). The observation uses the generated Kit arm from `kit/entry.fixtures.ts`, two solid parts and a two-step guide, with the production Kit preparation, print-mesh worker, frozen-content worker and IndexedDB store. It runs on macOS arm64 with Node 26.13.0 and headless Chrome from the documentation capture harness. The app is served by Vite in development mode because this worktree has no production bundle. These are development observations on a shared host, not production latency budgets or Linux and Windows CI measurements.

Preparation starts when Make is clicked and ends when the committed build becomes selectable. Completion latency surrounds the real store's explicit completion operation through transaction commit. Reopen includes loading dependencies, worker integrity checking and hydration, without viewport drawing. Retained bytes count UTF-8 immutable payloads plus separately reported record and index JSON. They do not measure IndexedDB's physical disk footprint, browser compression or total renderer memory. Twenty builds include two UI-created records and eighteen additional records from their existing captured content, without repeating geometry preparation.

The first whole-snapshot implementation retained 2,516,587 payload bytes for one build and 5,033,174 for twenty builds of the same source. The second UI preparation captured different Checks evidence, so there were two snapshots with duplicate geometry. That observation led to per-content assets for source parts, project, geometry, outputs and provenance, with small Kit-manifest roots retaining their own evidence. `buildRecords.test.ts` guards the same case by changing Checks while retaining identical dependency hashes, and verifies reference-aware deletion. Serialization and hashing stay in workers, progress changes read only their own build record. The composed adapter keeps the existing storage factory unchanged.

The per-content implementation measured one preparation at 994 ms, one committed completion at 1.04 ms and reopening at 221.53 ms with the final composed adapter. One build retained 2,517,055 immutable payload bytes. Twenty retained 2,548,873 bytes across ten distinct assets, including the differing Checks snapshots. Their progress records occupied 4,185 JSON bytes and their shared index 5,505 bytes, for 2,558,563 total measured payload bytes. The browser reported no console or page errors. These single samples do not establish a timing distribution. The capture's server teardown reported that Vite remained open after its existing close deadline, although the capture passed. No timeout or retry was changed.

## Atomic build groups

The production `createMany` store operation validates one prepared Kit once for a group of one to twenty records. The existing worker client retains serialization, content hashing and integrity validation off the interaction thread. Group creation neither repeats geometry preparation per record nor changes the immutable asset representation.

`kit/buildBatch.test.ts` measures operation counts with the production build-record store and its serialized memory storage fixture. Each of the ten generated designs creates one record and then twenty more from identical prepared content. An update spy requires two total storage transactions, one per group. The immutable asset byte count after twenty additional builds must equal the count after one. Record UUIDs, names and completion metadata remain independent. A rejected group leaves the existing index and immutable bytes unchanged.

These are deterministic operation and retained-payload comparisons, not creation or reopening latency measurements. The fixture does not measure IndexedDB disk usage, transaction timing, worker transport, renderer responsiveness or metadata at the full one-hundred-build limit. This fixture does not measure allocation transaction cost. The workflow observations below cover that cost and metadata at the build-count limit. [Batch test evidence](testing-build.md#atomic-build-groups) distinguishes the tested store boundary from purchasing and print allocation.


### Allocation preparation and measurement limits

The frozen-content worker derives production signatures from canonical source fields and the captured local source mesh, including exact positions and triangle indices. Newly marked or sent print attempts reuse the analysis worker's mesh capture and transfer the returned owned buffers into that worker. Group creation still prepares geometry once, while allocation and return operations send only bounded ownership and source identities. Build demand reads retained signatures and manifest quantities without hashing geometry on the interaction thread.

The current implementation retains at most 100 local build records and 256 MB of unique frozen content. Ownership history has separate explicit refusal bounds. Deterministic tests establish one atomic update per group and unchanged unique content bytes from one to twenty records. They do not establish interaction latency, disk footprint or metadata at the storage limit.

The completed documentation capture used the production desktop renderer bundle on macOS arm64, Node 26.13.0 and headless Chromium through `openApp`. The separate web-demo target used the development server and was not the measured app. `scratch/production-capture-recovery-bundle.log` and `scratch/production-allocation-measurements.json` retain the final-source run and raw observations. Creation surrounds the ordinary dialog interactions through selectable committed builds. Reopening surrounds a saved-build click through visible allocation rows, including frozen-content loading and integrity verification but excluding final viewport drawing. These single-run observations include browser interactions and shared-host scheduling. They are not a latency budget, speedup comparison or Linux and Windows result.

| Observation | One initial build | Twenty-build group added to the first | At the 100-build count limit |
| --- | ---: | ---: | ---: |
| Creation through controls | 17,428.42 ms | 5,681.93 ms | Not separately timed |
| Retained build count | 1 | 21 | 100 |
| Unique geometry payload bytes | 2,575,668 | 2,575,668 | 2,575,668 |
| All unique immutable payload bytes | 2,664,662 | 2,734,883 | 3,039,126 |
| Mutable record and index JSON bytes | 3,063 | 12,405 | 49,521 |

The initial creation includes cold preparation while the group follows it in the same session. Each group prepares one Kit rather than one per robot. Different preparation evidence can create distinct small roots and project assets while geometry remains shared. Reopening the initial build took 11,525.52 ms. The twenty group members took 622.38 to 6,098.69 ms each, with a median of 2,507.74 ms and 47,528.49 ms summed across twenty sequential opens. No bound assertion is inferred from these samples.

At 100 retained build records, one native purchase reservation took 0.91 ms through validation, current-file read and atomic replacement. The canonical purchasing file occupied 7,196 UTF-8 bytes, containing two component owners and two assigned physical copies from one five-output plate. This is one transaction sample, not a maximum-history or Windows measurement. The expected refused second motor reservation produced one HTTP 500 console entry. There were no pending requests at capture completion. The harness reported its existing Vite close warning after the passing capture. Byte counts measure application payloads, not physical IndexedDB disk use, compression or renderer memory. The 256 MB content ceiling is tested as an atomic refusal boundary rather than filled with geometry during this observation.

An earlier native observation followed the recovery-safe record fields before the final-source bundle capture. A native observation using those fields retained 8,160 bytes with three component owners and 690,730 bytes at 200 attempts with 1,000 declared outputs. The small reservation took 43.32 ms and a return at the print-history bound took 4.34 ms. The observation is retained separately rather than treated as a speed comparison. Its unprofiled 43.32 ms result prompted a phase observation of the same final APIs.

The final-source capture passed in 175.95 seconds through the unchanged 180-second documentation harness deadline. Its final Kit stage marks were 47.57 ms for measurement, 113.60 ms for build-order checking, 403.91 ms for the guide and 35.37 ms for joint mapping. These are stage wall times, not main-thread CPU profiles. Worker preparation and serialization remain off the interaction thread. The shared-host observations do not establish a reopen latency guarantee.

Using that final capture’s retained records, the bounded native workload retained 8,216 bytes with three component owners and 690,786 bytes at 200 attempts and 1,000 declared copies. The reservation took 1.41 ms, the return at that bound 2.12 ms, and completion recovery 7.29 ms. Recovery retained exactly 200 attempts, and an additional explicit attempt was refused. The current phase data is `scratch/production-allocation-storage-profile.json`.

The same phase record separates file I/O from total wall and process CPU.

| Final native operation | Wall time | Process CPU | Read | Write | Rename |
| --- | ---: | ---: | ---: | ---: | ---: |
| Reservation | 1.41 ms | 1.25 ms | 0.05 ms | 0.16 ms | 0.12 ms |
| Return at print bound | 2.12 ms | 2.17 ms | 0.15 ms | 0.27 ms | 0.15 ms |
| Completion recovery | 7.29 ms | 8.44 ms | 0.08 ms | 0.27 ms | 0.15 ms |

These individual samples do not establish a latency guarantee or a cause for the earlier 43.32 ms sample. No geometry is prepared or transmitted by these ownership changes.

## Frozen build photographs

Preparation, bitmap decode, thumbnail encoding, SHA-256 and retained-content verification run in `kit/photo.worker.ts`. The interaction thread passes immutable Blobs and bounded observation metadata through existing strict IndexedDB transactions. It never converts full-size raster bytes or serializes images into JSON. Thumbnails use at most a 320-pixel longest edge. Only an enlarged selection creates an original-image object URL, and view cleanup revokes each URL.

The storage ceiling is 256 MiB of unique original-plus-thumbnail content and 2,000 associations, separate from frozen Kit storage. Per-step metadata is bounded to 20 photographs. Duplicate imports at one destination reuse the association, and identical originals across builds share retained bytes. Completion writes still read only their original build record. Deletion scans bounded observation metadata and removes unreferenced content in the same transaction as the build record.

The November 20, 2026 observation used macOS arm64, Node 26.13.0 and headless Chrome through `openApp`. The documentation harness served the development app because this checkout had no production bundle. Two builds were created through ordinary Build controls. Generated PNG data, including bounded trailing padding, exercised the exact original-byte ceiling without a camera. The largest image was 4,096 × 4,096 pixels and 20,971,520 original bytes. Its 320 × 320 JPEG thumbnail occupied 1,360 bytes.

| Observation | Result |
| --- | ---: |
| Worker preparation through available thumbnail, including startup, decoding and hashing | 202.34 ms |
| First durable association, including worker verification and transaction commit | 394.71 ms |
| Preparing and attaching eighteen additional generated images | 3,312.79 ms |
| One build at the twenty-photo step limit | 268,435,456 unique image bytes |
| Observation index at that step and byte ceiling | 7,663 UTF-8 JSON bytes |
| Twenty retained builds, with the stress image shared into eighteen additional builds | 268,435,456 unique image bytes |
| Observation index for that twenty-build workload | 13,135 UTF-8 JSON bytes |
| Refusing an addition at a 2,000-association fixture | 60.25 ms |
| Deleting one association from that fixture | 5.56 ms |

The one-build baseline already contained the small generated bracket image used by the help article. After adding the maximum-size stress image, those two associations retained 20,990,828 unique bytes and an 835-byte index. Filling its step to twenty images reached the separate 256 MiB ceiling exactly. The second ordinary-control build remained without an attachment. Eighteen additional records were created through the production group store and shared the stress image without increasing image content bytes.

The metadata-limit observation created 100 builds through the production store, then seeded the cross-product of their identities, two retained guide steps and twenty already-retained images into the real IndexedDB observation index. That bounded fixture contained 2,000 distinct associations. Refusal and deletion then used the unmodified production photograph store. This measures bounded metadata processing, not the cumulative cost of importing 2,000 files. The refused operation includes image verification before transaction refusal.

A Chrome main-thread CPU profile sampled 6.39 ms of self time in `buildPhotos.ts`, 9.81 ms in `keyValueAtomic.ts` and 17.92 ms in the shared worker RPC helper across the whole setup and limit workload. These are sampled self times, not complete interaction latency or longest-task bounds. The profile also includes 92.09 ms of fixture-only synchronous Kit serialization from the scratch setup. Ordinary Build creation retains its existing worker path. No production image conversion or hashing runs on the interaction thread.

Twenty sequential original-image opens included real store reads, worker hash checks, browser decoding and URL revocation. They ranged from 79.20 to 239.28 ms. After explicit garbage collection before and after that sequence, Chrome reported JavaScript heap use of 83,673,748 and 83,699,404 bytes, a 25,656-byte increase. Backing storage remained 78,424,640 bytes. These readings exclude physical IndexedDB disk usage, native decoded-image caches, peak worker memory and GPU memory. They establish neither a memory leak bound nor production, Linux or Windows latency. Raw measurements, the main-thread profile and the capture log remain in `scratch/photo-measurements.json`, `scratch/photo-main-thread-profile.json` and `scratch/photo-capture.log`.
