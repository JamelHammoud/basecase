# Print planning and labels performance

Implementation: [Print planning and labels](../guide/printing.md#performance-print-planning-and-labels). Shared requirements: [Performance](../guide/performance.md).

## 3MF project instances are grouped while numbered

Repository search found one project membership serializer in `src/print/threeMf.ts`. Multi-material Open in Bambu Studio uses this writer through the analysis worker. Ordinary per-material exports do not write project membership. No other project membership implementation needs the change.

Previously the writer copied every instance to attach its per-object index, then filtered the complete list for every declared plate. The writer now creates a list for each declared plate, numbers instances globally in input order and appends their XML directly to the matching list. Undeclared plates still consume copy indices without producing membership. NaN plate numbers remain unmatched, as with the previous strict equality filter. Repeated declared plates repeat the same membership in output. Each call owns fresh maps and lists.

For N instances and P plates, membership preparation replaces N copied records and P × N membership comparisons with N map lookups. At 600 instances across 30 plates, that removes 600 record copies and replaces 18,000 comparisons with 600 lookups. Plate XML assembly, object serialization and ZIP compression remain. These are source-derived operation counts, not timings or a claim about complete export latency.

`projectMembership.test.ts` compares complete archived metadata against the previous equations across 24 fixtures and their reordered and empty-plate edits. Fixtures cover interleaved object copies, undeclared and empty plates, duplicate plate declarations, signed zero, infinity and NaN. Inputs remain unchanged. Existing `project.test.ts` covers worker-produced archives, filament assignments, multi-plate plans, deterministic project bytes and legacy plate bytes. No timeout, retry or quarantine changes apply.

The covered help articles [Export plates as 3MF](../../site/content/help/export-plates-as-3mf.md) and [Print a robot's parts](../../site/content/help/print-a-robots-parts.md) retain accurate steps, labels, file names, material assignments and screenshots. No user action or screen state changes, so no help edits or captures are needed.

Changed-file validation passed formatting, lint, docs, site copy for 297 pages, types and all 379 tests across 59 selected files. The test phase took 11.84 seconds locally. The log is `scratch/check-project-membership.log`. Copy accounting reports zero added, changed or removed strings.

The preflight follow-up reread all four covered articles against the final diff:

- [Export plates as 3MF](../../site/content/help/export-plates-as-3mf.md) describes the per-material export path. That path does not call `modelSettings` without a project. Download names, plate layout, part names, orientation, labels, menu actions and its Export screenshot remain unchanged.
- [The path from design to build](../../site/content/help/from-design-to-build.md) covers the print directory broadly. Readiness, BOM, assembly order, sheet exports, repair and time estimates do not use the changed membership grouping. Its descriptions remain accurate, and it has no screenshots.
- [Print a robot's parts](../../site/content/help/print-a-robots-parts.md) includes the affected multi-material Open in Bambu Studio path. Copy indices still advance globally per object before membership lookup. Declared plates retain their input order and instances retain source order within each plate. Object names, extruders, matrices and project settings use unchanged serializers. Its filament, placement, copies and excluded-part claims remain accurate. The Print, Settings and Bambu project screenshots show unchanged controls and states.
- [Printability estimates](../../site/content/help/printability-estimates.md) also covers the print directory broadly. Face choice, supports, walls, filament, packing, obstacles and time estimates are computed before project serialization and remain unchanged. Its descriptions remain accurate, and it has no screenshots.

All four reminders explicitly permit accurate articles to remain unchanged. No step, label, claim or depicted state became obsolete, so the articles and their screenshots remain unchanged intentionally.

## Merge guide bounds accumulate as members are measured

Repository search found one union stand-in for Merge's saved-step estimate, in `src/print/merge/mergeGuide.ts`. Both Print and the agent receive the shared planner's result. The existing `selectionBounds` helper measures each member and immediately folds its extrema into the result. This replaces retention of every member box followed by six coordinate projections and extrema scans. Each part is still measured once. Stand-in center arithmetic, dimensions, rotation, retained identity, removed hardware and guide planning stay unchanged.

For N members, the change removes one N-entry box-reference array, six N-entry coordinate arrays and two three-entry axis arrays per union. The two result extrema arrays and each member's measured bounds remain. These are source-derived allocation counts, without timing assertions or a claim about complete Merge planning speed. The existing helper performs the same minimum and maximum arithmetic, including nonfinite coordinates and signed zero, without a persistent cache.

A local scratch replay compared bounds against the previous mapped calculation in 255 cases. It used 120 rotated and translated member groups derived from the Shin fixture, repeated each after editing a member, then checked NaN, infinities and signed zero on all three position axes. Every result matched and the initial inputs remained unchanged. The replay is `scratch/merge-bounds.test.ts`. Existing `src/print/merge/mergePlan.test.ts` retains complete group, saved-step, material, bed and actual boolean-merge checks. No permanent test duplicates the existing bounds helper.

Changed-file validation passed formatting, lint, documentation, site copy, types and all 49 selected test files with 291 tests. The test phase took 11.62 seconds locally. Copy diff reports zero added, changed or removed strings.

Preflight flagged [The path from design to build](../../site/content/help/from-design-to-build.md), [Merge printed parts into one print](../../site/content/help/merge-printed-parts-into-one-print.md) and [Printability estimates](../../site/content/help/printability-estimates.md). Their assembly-order, saved-step, printer-fit and estimate claims remain accurate. No control, visible state or user action changes, so their text, steps, labels and screenshots remain unchanged.

## Fleet relocation retains plate bounds

For a successful relocation of N items, the previous path measured the footprint twice. Each measurement allocated six N-entry arrays and N rectangle objects. It visited items once to build rectangles and once for heights, then visited rectangle fields through four mapped arrays and their extrema scans. Relocation now measures bounds in one item scan with five scalar extrema and reuses them for fitting and translation. Diagonal items also share absolute sine and cosine between both extents. The existing moved-item and matrix output allocations remain.

`src/print/fleetFootprint.test.ts` compares 120 complete bounds, fit and relocation cases against the previous calculation. It covers negative and diagonal rotations, axis-aligned yaw, copied items, bed obstacles, margins, refused placements, empty plates, edited inputs and unchanged sources. Additional cases compare NaN, infinities and signed zero in each placement field. Getter instrumentation on successful 300- and 600-item relocations records 600 and 1,200 yaw reads, including the returned item copies. The previous two measurements plus returned copies required 1,500 and 3,000 reads. These are operation counts, without timing assertions or a claim about complete sending time. Existing fleet and obstacle tests cover eligibility and placement integration. No UI, workflow or browser coverage changes are needed.

## Project filaments retain material matches

`print/projectJob.test.ts` compares filament order, colors and every object's assignment against the previous lookup rules over 80 generated tray lists. It covers mixed case and material suffixes, duplicate slots, external and negative slots, missing materials, malformed colors, copied objects, unchanged sources and edited tray order. Existing `print/project.test.ts` covers complete worker-written project archives and the single-material path.

On four materials with one tray each in material order, the previous comparator and color construction read tray types 41 times in a local Node replay. Preparation now reads them ten times, once for each prefix visited during the four material searches. The test counts reads through tray getters and checks fresh preparation after an edit. Every object also replaces its ordered-material search with a map lookup. These are operation counts, without timing assertions or a claim about complete export speed. Tray lists and material counts are small. No browser flow, on-screen state or archive format changes.

## Welding rejects collapsed triangles as they arrive

The shared welder removes the post-weld traversal and temporary JavaScript index list. For 30,000 triangles without collapsed faces, it removes 90,000 post-weld typed-index reads, 90,000 temporary list entries and the subsequent 90,000-entry typed-array copy. The existing index buffer becomes the result. For a mesh with half its triangles collapsed, the temporary 45,000-entry list is gone, while a typed copy of the retained prefix preserves exact buffer sizing. Welding still checks three indices per triangle during construction. These are structural operation counts, not wall-clock or complete export measurements.

`src/print/threeMf.test.ts` compares 80 generated 90-triangle soups with mixed collapsed faces against an independent reference. It also checks first-seen coordinates after quantization, winding and ordering, unchanged inputs, empty and fully collapsed meshes, and exact-sized output buffers. Other welders in CAD import, kernel meshes and mesh simplification have different rounding or face-retention rules and do not use the removed filtering pass. No browser flow or on-screen state changes.

## Plate statuses share prepared print history

`print/plateStatus.test.ts` compares the previous scan across 120 generated histories in both input orders, plus frozen inputs, repeated queries and later edits. With 100 and 200 records and unmatched plate queries, record-hash reads fall from 10,000 and 40,000 to 100 and 200. On all-replacement fixtures of those sizes, record-part-list reads fall from 20,000 and 80,000 to 200 and 400. These are operation counts without timing assertions or a claim about complete printing time.

## Printed-label plane areas accumulate during grouping

`labelFaces.test.ts` checks 80 transformed indexed boxes, exact threshold boundaries, disconnected faces, winding, degenerate triangles, typed-array views, edits and independent output buffers. On its 300- and 600-triangle rejected-plane fixtures, area measurements fall from 600 and 1,200 to 300 and 600. Retained faces also skip that area-only pass. These are operation counts without timing assertions or a claim about complete plate-writing time.

## Printed-label samples locate triangles with binary lookup

`labelSamples.test.ts` compares every coordinate across 360 generated face inputs, plus degenerate, nonfinite and edited geometry. `surfaceSampleIndex.test.ts` checks repeated boundaries, double precision, typed-array views and logarithmic read bounds. On equal-area 300- and 600-triangle fixtures, the 40 label searches reduce cumulative-area reads from 6,829 and 13,636 to 329 and 370. These are operation counts, without timing assertions or a claim about complete plate-writing time.

## Printed-label fitting visits centers only as needed

`labelFit.test.ts` compares 320 complete fits with exhaustive preparation across rectangles, holes, notches, rotations, rejected fits and later edits, and checks centroid ties and empty geometry. On 300- and 600-triangle square fans, triangle-coordinate reads for containment fall from more than 15,000 and 30,000 to at most six when the centroid fits at full size. These are operation bounds without timing assertions or a claim about complete plate-writing time.

## Printed-label fitting prepares boundary segments once

`labelBoundary.test.ts` compares 6,000 generated boundary queries with independent segment intervals and checks parallel, zero-length, reversed and touching edges, precision, state reset and source preservation. Its 300- and 600-edge fits read each source coordinate once. A scratch comparison matched 720 complete fits against the previous implementation across rectangles, notches, holes and subsequent edits. On subdivided 20 × 12 mm rectangles with AA labels, source-coordinate reads fell from 425,872 and 850,704 to 1,200 and 2,400. On shared macOS arm64 hardware with Node 26.13.0, median fit times fell from 2.85 ms and 5.52 ms to 0.59 ms and 0.62 ms. Measurements used 21 alternating ten-call batches after five warmup batches per implementation. These measure fitting alone, without CI timing assertions or a claim about complete plate writing time.

## Fit coupons skip hosts that cannot win

`fitCouponHosts.test.ts` compares complete coupons with exhaustive host selection across transforms, ties, disconnected geometry, the 0.5 mm contact tolerance, missing hosts and edited placements. Its 300- and 600-host fixtures reduce mesh-box queries from 300 and 600 to one each. These are operation counts, without timing assertions or a claim about complete fit-test time.

## Diagonal bed fits retain polygon projections

`bedProjection.test.ts` checks rotated, reflected, collapsed and nonfinite footprints, tolerance boundaries, source preservation and edited beds. Across two overlapping candidate footprints and 300 or 600 keep-outs, coordinate reads fall from 96,000 and 192,000 to 52,896 and 105,696. A scratch comparison matched 10,000 complete fits against the previous calculation, including 164 diagonal fits and 5,188 refusals. On shared macOS arm64 hardware with Node 26.13.0, batches of five passes over those fixtures took medians of 107.25 ms before and 89.51 ms after. Each used eleven alternating measurements after five warmups per implementation. These measure bed fitting alone, without CI timing assertions or a claim about complete print planning time.

## Plate packing selects both orientations in one scan

`packSpot.test.ts` checks 2,400 seeded queries, ties, tolerance boundaries, nonfinite values, source preservation, edits and result ownership. Its 300- and 600-rectangle fixtures reduce free-list visits from 600 and 1,200 to 300 and 600. A scratch comparison matched 500 complete layouts across 10,900 items, including build steps, fixed positions, pinned plates, keep-outs, gaps and diagonal placements. These are traversal counts and output comparisons, without timing assertions or a claim about complete packing time.

## Print orientations share triangle calculations

`printOrientation.test.ts` checks box contact areas, support hits and misses, angle and contact limits, tilted faces, degenerate triangles, source preservation, cache reuse and coordinate-read bounds for both batch paths. A scratch comparison matched complete reports on 30 transformed meshes and 90 manual-face requests exactly against the previous scorer. With ten candidates, 300- and 1,200-triangle fixtures reduced coordinate reads from 99,900 to 75,600 and from 399,600 to 302,400. Vector cross products fell from 7,602 to 4,902 and from 18,410 to 7,610, including BVH work. These are operation counts, without timing assertions.
  Support queries also reuse one ray and its origin and direction vectors for the entire batch. `printSupport.test.ts` compares exact costs and cast coordinates against the previous per-query allocation on supported meshes. Its 10- and 20-subdivision roofs make 606 and 2,406 support queries, each using one ray instead of a new ray and centroid clone per query. Automatic scoring keeps this ray separate from wall-thickness sampling. Later batches and changed geometry use fresh workspaces. These are allocation counts, without timing assertions or a claim about complete print-planning time.

## Print connected-component lookups compress their full paths

`print/componentGrouping.test.ts` checks membership, ordering, repeated joins, cycles, unchanged inputs and map-read budgets at 300 and 600 items. On the 600-item fixtures, total map reads fell from 721,798 to 4,792 for descending print joins, and from 368,996 to 10,198 for descending coplanar triangles. These are operation counts, without wall-clock assertions.

## Wall probes use scalar sample coordinates

The shared wall-thickness sampler no longer returns a temporary two-number array for each ray. A local replay compared complete printability reports and every support and wall cast coordinate against the previous implementation. Nine rotated and translated boxes combined 0.1, 1 and 10 scale factors with 1, 3 and 10 face subdivisions. Inputs used offset typed-array views and remained unchanged. Empty, degenerate and open triangle inputs also matched exactly.

The six smaller boxes each cast 4,000 wall rays and the three largest each cast 20,000. Temporary sample-pair construction falls from those counts to zero. These are structural allocation counts, without heap measurements, timing assertions or a claim about complete printing time. The replay is session evidence rather than a committed test. Existing `src/three/printability.test.ts` retains thin-panel, dense-mesh, solid-block and blind-pocket coverage. `src/three/printSupport.test.ts` retains support-cost parity, exact support casts and separate wall workspace coverage. No UI or workflow changes require browser coverage.

## Printed-label fallback bounds scan interleaved coordinates

The fallback grid now reads each triangle coordinate once and retains four extrema. For 300 and 600 triangles, the previous two filters visited 3,600 and 7,200 coordinates, copied 1,800 and 3,600 values into two typed arrays, then visited those copies twice for extrema. The new bounds scan reads 1,800 and 3,600 coordinates and allocates no coordinate arrays. These are structural operation counts, not timings or complete plate-writing measurements. Full-size centroid fits still bypass bounds preparation entirely.

`src/print/labels/labelFit.test.ts` retains the 320 complete-fit comparisons across holes, notches, rotations, rejected fits and edits. A dense fallback fixture repeats a ring’s triangles into an offset typed-array view with 192,000 points, comparing the complete result against the small equivalent ring. It checks the centroid is in the hole, so bounds preparation cannot be bypassed. In a local Node replay, spreading 192,000 coordinates into the previous minimum calculation threw `RangeError: Maximum call stack size exceeded`. The scan completed with the expected extrema. The engine’s precise argument limit varies. No UI, workflow or browser coverage changes are needed.

## Resting-face discovery stops when full

A local Node replay compared complete printability reports with the previous implementation on 20 meshes. Boxes, dodecahedra, icosahedra, 16-sided cylinders and 24-sided cones each used four rotations and a translation. Every mesh used an offset typed-array view and remained unchanged. Candidate directions, their order and every report field matched exactly. Empty and degenerate inputs also matched.

Instrumented face-normal clone and normalization counts fell from 18 to 6 for each dodecahedron, from 26 to 6 or 8 for the icosahedra, and from 24 to 6 or 8 for the cylinders. A visited face now normalizes once, including its resting check. After six accepted faces, remaining candidates receive no normalization. Area grouping and sorting still visit all buckets. These are operation counts, not timings or a claim about complete print planning speed.

The replay is session evidence, without a committed instrumentation test. Existing `src/three/printability.test.ts` covers solid blocks, dense and coarse thin panels and blind pockets. `src/three/printSupport.test.ts` covers exact support costs, ray coordinates, automatic and manual pose consistency and separate ray workspaces. No UI state or workflow changes require help or browser updates.

## Print material groups are built once

A local scratch replay compared complete plans and job specifications with the previous implementations over 100 seeded fixtures. The fixtures included five materials, build steps, skipped and unfit parts, copies, pinned placements and empty inputs. Every field matched, including hashes, matrices, local plate numbers, global plate numbers and file order. Source inputs remained unchanged. The replay is session evidence, without a committed parity harness.

For five materials and 300 or 600 records, classification previously read material fields 1,800 or 3,600 times during planning, and 3,300 or 6,600 times during job preparation. The shared grouping scan reads them 300 or 600 times in either path. Job preparation also removes the second set of per-material filtered plate lists. These counts cover material classification only, excluding packing, file-item construction and serialization. They are operation counts, without timing assertions or a claim about complete planning or export speed. Material counts are small.

`src/print/job.test.ts` checks file and slice-group agreement after build-order interleaving, copies, skipped and unfit inputs, reversed inputs, empty plans and subsequent input removal. Existing `plan.test.ts`, `obstacles.test.ts` and `project.test.ts` retain packing, placement and archive coverage. No controls, on-screen states or workflows change, so help and browser coverage remain unchanged.

## Service quotes are indexed per operation

A scratch Vitest replay compared indexed selections with the previous linear first-match lookup at 0, 1, 30, 300 and 600 parts and quotes. Reversed quote lists, repeated identities and missing ids returned the same quote objects. Instrumented part getters counted 45,150 and 180,300 identity reads for the previous 300-part and 600-part batches. Building the index required 300 and 600 identity reads. Each subsequent part lookup uses the map. These are operation counts, not timings or complete BOM latency measurements. Each consumer builds its own map, and no cache survives a call.

`src/print/serviceQuotes.test.ts` checks complete BOM parity and request selection when saved quotes contain duplicate and deleted identities. It verifies that replacing the first quote changes both consumers on the next call, preserves stale pricing and leaves sources unchanged. Existing tests cover fresh quotes, refusals, copy and material changes, service switching and removed parts. No controls, screen states or workflow change, so help and browser coverage remain unchanged.

## Manufacturing kit composition

Measured on 16 November 2026 on macOS arm64, Apple M5 Pro with 24 GiB memory and Node 26.13.0. Scratch captures use the Vite production desktop and web bundles, `openApp`, Chrome software WebGL and the real Export ▸ Kit action. They read the browser-delivered ZIP from disk. No export worker, archive producer or download delivery is replaced.

The current entry fixture has one exact STS3215 c001 as its stationary base and one printed moving arm. The repeated fixture has 39 solids, 19 printed instances with two copies each, 18 exact servos, seven modules and fifteen assembly steps. Inputs come from `kit/entry.fixtures.ts` and `kit/kit.fixtures.ts`. No printer or robot is involved.

### Current archive and preparation measurements

The final sampler includes `provenance.json` with the source scene, printer, bed, plate plan and file specification. Both archives delivered with empty app errors.

| Observation | Small arm | Repeated modules |
| --- | ---: | ---: |
| Click to download | 4,536 ms | 23,866 ms |
| Illustrated guide preparation | 4,145 ms | 14,899 ms |
| Assembly search | 6 ms | 3,985 ms |
| Plate writing | 4 ms | 6 ms |
| Fresh joint-map preparation | 10 ms | 950 ms |
| Archive composition and compression | 71 ms | 152 ms |
| ZIP bytes | 543,386 | 1,320,892 |
| Expanded bytes | 836,661 | 2,241,665 |
| Illustrated guide HTML bytes | 791,388 | 1,910,187 |
| Process-tree RSS before export | 1,249,591,296 | 1,415,577,600 |
| Process-tree RSS after delivery | 2,109,931,520 | 2,699,853,824 |
| Collected main-page heap before export | 17,206,364 | 19,087,476 |
| Collected main-page heap after delivery | 19,955,444 | 23,469,388 |

RSS sums the scratch worker and its descendants, including Chrome, renderer, GPU and worker memory. Shared pages can be counted more than once. This is retained process residency immediately after delivery, not peak memory or isolated archive-worker allocation. Main-page DevTools garbage collection does not collect every worker. The harness retains the last ZIP through its test hook, which normal production downloads do not retain. Browser graphics pools, geometry caches and allocator residency remain live. These measurements do not establish a stable memory reduction.

### Diagnosis and removed rendering work

The earlier three-part arm from `93e274222` delivered in 6,096 ms, including 5,662 ms of guide preparation and 54 ms of composition. Its ZIP was 715,162 bytes. The repeated fixture delivered in 34,455 ms, including 26,484 ms of guide preparation and 227 ms of composition. A web arm capture delivered in 9,815 ms, including 9,258 ms of guide preparation. Earlier observations missed their download deadline while preparation was active. These observations isolate guide latency rather than a failed compression or delivery call. Historical CI did not retain stage evidence, so its exact failed stage remains unknown.

Kit guides now use one export-owned strict worker, terminated after rendering or interruption. A failed worker refuses local rendering. Normal saved PDF guides retain their shared worker and incremental caches. Source-ownership tests verify worker refusal, termination and unchanged PDF saving. A shader compilation failure stops rendering rather than leaving blank drawings in a completed guide.

The drawing stage writes normal, ID and color textures in one geometry pass, sharing a depth buffer. A dedicated small visibility target avoids discarding full-page attachments between drawings. On the two-mesh real WebGL fixture, target disposals fell from six to zero and drawing calls from seven to three, including the composite quad. The composite shader removes four redundant nearest-neighbor lookups and per-fragment trigonometry. PNG bytes match the historical three-pass renderer and sixteen-neighbor shader from three views, including rotated geometry and ghosted overlaps. An additional view exposed a double-flipped back-face normal in the candidate pass. Correcting that normal made every strict comparison pass. Resolution, layout, view selection and assertions remain unchanged.

### Download observations and limits

Production captures after the rendering changes delivered the two-part entry in 3,203 ms on desktop and 7,458 ms on web. Both used the retained walkthrough's ten-second download wait and inspected guide, packing, exact c001 servo map and actual 3MF mesh, with empty app errors. These captures preceded the additive printer-plan provenance fields in the final sampler above.

The last capture of the final archive missed the ten-second desktop download deadline. Completed boundary entries ended at assembly search, while the export progress remained active in guide preparation. No compression boundary or app error was recorded. This remains unresolved latency evidence, not a passing final walkthrough. Published Linux and Windows results must establish whether the retained short walkthroughs meet their unchanged deadlines. No retries, timeout increases or quarantine were added.

Web fixtures seed their saved scene before startup through the existing IndexedDB migration and scene-restoration path. They assert no active Case and no first-launch rover request. Opening an empty database and then replacing the document previously allowed the startup rover Case to overlap preparation.

These single observations use different startup conditions and scene sizes. They are not a controlled before/after benchmark, and no speed ratio is claimed. The operation counts and pixel parity establish removed rendering work independently of host contention. Maximum-size archives, full-size sourced CAD scenes and isolated worker allocation remain unmeasured. Source geometry and expanded archive limits are 256 MB, with at most 10,000 scene parts. Export does not certify printer output or physical assembly.

### Outline sampling revision

On the same macOS arm64 host and Node 26.13.0, the existing OffscreenCanvas test worker compared the prior direction-dispatch kernel with a uniform offset kernel. The scratch probe used the box and ghosted torus fixture at three camera angles. It warmed each kernel once at 512 × 512 output pixels, then timed one draw including PNG encoding. Supersampling remained two. The prior kernel took 43.0, 47.6 and 33.5 ms. The candidate took 36.8, 41.4 and 43.1 ms. All three PNG comparisons matched exactly.

These single samples vary by view and do not establish a reliable wall-clock improvement. They also exclude whole-guide preparation, the robot fixture and CI contention. Structurally, the prepared offsets remove direction dispatch and the four rejected loop iterations per fragment. Full-strength ink stops further samples, which cannot improve that pixel. The final shader also selects ink color only once after finding the strongest edge. The retained parity checks compare against an independent frozen historical shader. No complete-download improvement is claimed from this probe. The CI download deadline remains unchanged.

## Start Next keeps one winning plate

`src/print/fleet.test.ts` compares 60 generated plate lists with exhaustive filtering and sorting. Fixtures include unordered and duplicate plate numbers, empty queues, all five plate states, loaded PETG and smaller printer beds. It checks returned object identity and unchanged source records. Existing cases retain printed-part replacement and sequential printer assignment coverage.

On ascending queues of 300 and 600 eligible plates, the instrumented test reads plate items for bed fitting once per selection. The previous exhaustive filter reads them 300 and 600 times. After the first plate becomes printed, the next call fits only the second plate. The candidate array and its sort are removed. Descending queues can still require every eligible fit. These are operation counts, without timing assertions or a claim about complete sending time. No controls, screen states or workflow change, so help and browser coverage remain unchanged.

## Printer polygon bounds share one scan

Bed setup previously mapped each polygon into separate X and Y arrays, then scanned each array twice for extrema. Job export duplicated that calculation for the bed. The shared bounds helper now visits each point once, retaining four scalar extrema and allocating only the result rectangle. For an N-point polygon, this removes two N-entry coordinate arrays and replaces six N-entry traversals with one. Job export still returns its existing two-entry plate-size tuple. These are structural operation counts, not wall-clock measurements or a claim about complete printing speed. Catalog polygons are small.

`src/print/polygonBounds.test.ts` compares all catalog bed, keep-out and obstacle polygons with the historical mapped calculation. It checks unchanged sources, empty and single-point polygons, negative coordinates, signed zero, NaN, infinities and fresh results after edits. Integration checks compare every catalog bed envelope and exported job dimensions. A 200,000-point polygon checks bounds without depending on the engine's function-argument limit. Existing obstacle, planning and archive tests retain placement and export coverage.

The helper does not change polygon validation, inscribed-bed fitting, obstacle expansion, packing or exported placement matrices. No controls, screen states or workflow change, so help screenshots and browser coverage remain unchanged. No persistent cache is added.


## Resting-plane queries stop at the first disqualifying vertex

`three/printability.ts` has one resting-plane query, shared by automatic print reports and their orientation consumers. Instead of finding the maximum projection across every vertex, it rejects a candidate on the first projection whose distance fails the strict 0.3 mm tolerance. The plane offset is divided once per candidate. Candidate ranking, normalization, rounding and accepted-face order stay unchanged. Accepted faces still inspect every vertex.

A local replay compared complete reports against the previous implementation on 60 two-box meshes. It combined four subdivision counts, three rotations and five relative offsets, including 0.299, 0.3 and 0.301 mm offsets. Every report matched exactly and source coordinates remained unchanged. The offsets exercise relative placements, not an isolated exact tolerance boundary after rotation and plane averaging. Existing orientation tests retain accepted tilted faces, degenerate inputs, support and contact boundaries.

On the stepped-box fixture rotated 0.3 radians, coordinate reads across the complete report fell from 108,000 to 92,625 for 600 triangles and from 429,030 to 367,665 for 2,400 triangles. BVH construction happened before counting, and both implementations shared the same BVH. These are operation counts, not timings or a claim about complete print-planning speed. `printOrientation.test.ts` retains both fixtures with full-report equality, source preservation and read bounds that the previous query exceeds. The session replay and raw counts live in `scratch/resting-replay.test.ts` and `scratch/resting-measurements.json`. No UI or workflow changed.


## Print pose selection retains one winner

Repository search found one pose selector in `src/print/plan.ts`, called by print reports and Merge support comparisons. Previously, automatic selection filtered poses into a candidate array, mapped them into a scored array with one ranking record per eligible pose, then reduced that array. Forced selection also built two arrays and one ranking record. The selector now retains the winning pose, fit and scalar score while traversing the source poses. No ranking storage survives or scales with candidate count. Bed-fit result allocation and fitting work remain unchanged.

For six and twelve eligible poses, source-derived counts remove two temporary arrays and six or twelve ranking records per automatic selection. A forced face removes two arrays and one ranking record. These are allocation counts, not measured timings or a claim about complete print-report speed. The initial search for the first eligible pose and manual direction lookup remain linear. Shape analysis always supplies automatic axis poses, so empty candidate sets are outside this selector's input contract, as before.

`src/print/poseSelection.test.ts` compares the selected pose identity, size, fit and yaw against the previous exhaustive calculation over 40 generated twelve-pose shapes, two beds and six placement choices. It covers requested faces, manual overrides, unmatched directions, fixed placement and turning. Separate cases preserve first ties and NaN and infinite score comparisons. Source shapes remain unchanged. Existing plan, obstacle and Merge tests cover the downstream pipelines. No UI control, visible state or user action changes, so help articles and screenshots remain current.


Changed-file validation selected 77 related test files and finished in 72.12 seconds. It passed 74 files and 633 tests. Six tests exceeded their existing 5,000 ms limits: the Bambu Studio archive compatibility test in `electron/print/project.test.mjs:58`, the three Carry a cup seed batches at `src/classroom/grading.test.ts:50`, and replay cases at `src/leagues/replay.test.ts:17` and `:57`. This run does not establish their baseline status. No timeout, retry, skip or quarantine changed. The full log is `scratch/check-pose-selection.log`. The initial lint finding was corrected and the final source lint passed separately.

Preflight identified [The path from design to build](../../site/content/help/from-design-to-build.md), [Print plates on several printers](../../site/content/help/print-plates-on-several-printers.md) and [Printability estimates](../../site/content/help/printability-estimates.md). Their build-order claims, printer eligibility, manual face choice, diagonal fitting, numbered steps and screenshots remain accurate. The refinement changes only temporary ranking storage, so those articles remain unchanged.


## Resting faces supply wall-sampling areas

Repository search found one wall-area preparation pass in `three/printability.ts`. Every automatic printability report already measures the same triangle areas while grouping resting faces. The face scan now fills the wall sampler's existing Float32 buffer and accumulates its rounded total. Face grouping retains its original double-precision total and skips only its own degenerate faces. Manual orientation scoring does not sample walls and stays unchanged.

A scratch replay compared complete reports and every support and wall ray coordinate against the previous implementation on 24 boxes. It combined three subdivision counts, four scales and two rotations, with translation and offset typed-array views. All reports and rays matched exactly, and inputs remained unchanged. Empty, collapsed and sub-threshold triangle inputs also matched. The replay is session evidence in `scratch/print-area-replay.test.ts`, with results in `scratch/print-area-results.json`.

For each mesh, counted coordinate reads fell by exactly nine per triangle. The 480-triangle rotated fixtures fell from 95,040 to 90,720 reads. The separate pass's 480 cross products and area square roots are also removed. Buffer size and precision remain unchanged. These are operation counts, without timing assertions or a claim about complete print-planning speed.

Existing `src/three/printability.test.ts` retains coarse and dense thin-panel, solid-block and blind-pocket checks. `src/three/printOrientation.test.ts` retains orientation costs, degenerate inputs and source preservation. `src/three/printSupport.test.ts` retains exact support casts and independent wall and support workspaces. No control, visible state or user action changes, so help articles and screenshots remain accurate.

Changed-file validation passed formatting, lint, documentation, site copy, types and all 84 selected test files with 695 tests. The test phase took 35.17 seconds locally. Preflight flagged the unchanged covered articles [Printability estimates](../../site/content/help/printability-estimates.md) and [A part is too big to print or has thin walls](../../site/content/help/troubleshoot-build-part-wont-print.md). Both were checked against the code. Their face counts, wall and support thresholds, labels, steps and visible states remain accurate, so neither article needs an edit.

## Fit-coupon overlap scoring uses scalar extents

Whole-app search found one box-overlap volume scorer in `three/analysis/fitCoupons.ts`, shared by every fit kind. It now subtracts the larger minimum from the smaller maximum along each axis and multiplies the extents. A negative extent returns zero. Host order, strict winner comparisons, mesh contact, containment and coupon cutting stay unchanged.

On November 16, 2026, `scratch/fit-overlap-parity.mjs` compared the actual helper with its former Three.js calculation across 54,756 box pairs. Cases included generated bounds, inverted and empty boxes, touching faces, signed zero, tiny and large coordinates, infinities and NaN. Results matched with `Object.is`, and every source box remained unchanged. The script and raw results in `scratch/fit-overlap-parity.json` are session evidence.

For 300 and 600 overlapping hosts, instrumented box clones fell from 300 and 600 to zero. The installed Three.js `Box3.clone` also constructs two vectors. Including the former size vector and coordinate array, source-derived temporary object counts fall from 1,500 and 3,000 to zero. These are allocation counts, without measured heap usage, timings or a complete fit-test latency claim. Mesh checks and coupon geometry still allocate.

Existing `three/analysis/fitCouponHosts.test.ts` checks complete coupon parity across transformed hosts, overlap ties, disconnected geometry, contact tolerances, containment, edited placements and repeated fit groups. Its 300- and 600-host cases retain mesh-query counts. `print/fitTest.test.ts` covers grouped fits, cut volume, open holes, host orientation and plate packing. No timeout, retry or quarantine changes apply. No action, label, geometry or visible state changes, so [Print a fit test](../../site/content/help/print-a-fit-test.md) and its captures remain accurate.

Changed-file validation passed formatting, lint, documentation, site copy for 308 pages, TypeScript and all 302 tests across 51 related files. The test phase reported 14.43 seconds. Complete output is in `scratch/check-fit-overlap.log`. Copy accounting is net zero. Preflight's covered-article reminder was resolved by reading the unchanged fit-test article against the implementation.

## Resting-face buckets register once per direction

Whole-app search found one resting-face bucket map, in `three/printability.ts`. Every automatic printability report uses it. The map now registers a bucket only on its first triangle instead of replacing the same reference after every triangle. Its retained normal, area and plane offset still accumulate in source order. Quantization, insertion order, degenerate-face exclusion and all scoring arithmetic remain unchanged.

A scratch comparison on macOS arm64 with Node v26.13.0 checked complete reports against the previous implementation for six translated boxes. It combined 1, 5 and 10 subdivisions per edge with zero and 0.3-radian rotations. All reports matched exactly and source buffers stayed unchanged. Empty, collapsed and sub-threshold triangles also matched. Instrumented face-map writes fell from 12, 300 and 1,200 to six for each box, including rotated boxes. These are measured operation counts, not timings, heap measurements or complete print-planning speed claims. Curved meshes can have more direction buckets, so their reduction depends on repeated quantized normals.

The replay, raw observations and log remain in `scratch/print-bucket-parity.test.ts`, `scratch/print-bucket-results.json` and `scratch/print-bucket-parity.log`. Existing `printability.test.ts`, `printOrientation.test.ts` and `printSupport.test.ts` retain thin-panel, pocket, pose, degenerate-input, source-preservation and ray coverage. This small map-write refinement adds no permanent test or browser walkthrough.

No user action, label or visible state changes. The existing [Printability estimates](../../site/content/help/printability-estimates.md) and [A part is too big to print or has thin walls](../../site/content/help/troubleshoot-build-part-wont-print.md) articles were checked against the preserved face counts, thresholds and manual face choices. Their instructions and screenshots remain accurate.

Changed-file verification passed formatting, lint, documentation, site copy for 316 pages and TypeScript. Related tests passed 704 cases across 86 files and failed one case in `src/design-system/deleteTone.test.ts`. It reported Delete controls without danger tone in the unchanged `BoardHoleFields.tsx`, `BoardKeepoutFields.tsx` and `BoardPlacementFields.tsx` Inspector files. The test phase took 38.48 seconds. This run is not a passing related-test check. No retry, timeout, quarantine or unrelated styling change was made. Complete output remains in `scratch/check-print-buckets.log`. Copy accounting is net zero. Preflight's two unchanged-help reminders were resolved by the article checks above.

The preflight follow-up rechecked both covered articles against the final code. `Printability estimates` still matches the six axis candidates, six additional resting-face limit, 45° overhang threshold, 30° support threshold and manual face override. `A part is too big to print or has thin walls` still matches the 0.84 mm wall limit, inclusive 100 mm² or 10% blocking thresholds, readiness messages, Auto Arrange and Lay on Face controls. Neither article embeds a screenshot. The refinement changes no control, label, report value or follow-up action, so no article or capture update is needed. The preflight command continues to emit these reminders because it checks whether a covered article changed, without reading this evidence.


## Printed-label fit probes use scalar coordinates

Whole-app search found triangle containment, padded trial boxes and binary height-search bounds together in `print/labels/labelFit.ts`. All labeled plate exports share this fitter. Boundary clipping already uses scalar coordinates in `labelBoundary.ts`. The fitter now reads six triangle coordinates directly, chooses each box half-extent directly and initializes its two search bounds separately. Returned boxes, spots and candidate points still allocate as before. The numerical expressions and evaluation order stay unchanged.

A scratch replay on macOS arm64 compared the previous and current implementations for 240 complete fits. It combined four tiled face shapes, five widths, four heights and three labels. It also checked centroid and boundary containment, source preservation, both box orientations and zero, finite, infinite and NaN heights. Every result matched exactly. The replay is `scratch/label-fit-parity.test.ts`, with raw counts in `scratch/label-fit-results.json`.

Instrumented calls in the previous implementation counted 389,556 triangle-coordinate arrays, 54,469 half-extent arrays and 1,612 search-bound arrays across that replay. The changed source constructs none of these arrays. These are source-level operation counts, not measured heap allocations or timings. An engine may already eliminate some temporary arrays, so this does not establish a complete plate-writing speedup.

Existing `labelFit.test.ts` retains exhaustive fit, tie, hole, notch, dense fallback, source-preservation and later-edit coverage. Existing label geometry and plate-file tests cover downstream exports. This reversible arithmetic refinement adds no permanent test, browser walkthrough, timeout, retry or quarantine.

No user action, label, geometry or visible state changes. [Label printed parts with their guide letters](../../site/content/help/label-printed-parts.md) still accurately describes the controls, dimensions, hidden-face selection and plate-only output. Its screenshots remain current.

Changed-file validation passed formatting, lint, documentation, site copy for 323 pages, TypeScript and 321 tests across 53 related files. The test phase reported 14.01 seconds. Complete output is in `scratch/check-label-fit.log`. Copy accounting is net zero.

The preflight follow-up read all three covered articles against the final diff. [The path from design to build](../../site/content/help/from-design-to-build.md) still describes guide letters cut into hidden faces. [Label printed parts with their guide letters](../../site/content/help/label-printed-parts.md) retains the same Print shortcut, Label parts and Don’t label controls, 0.4 mm depth, 4 to 10 mm height, omission feedback and plate-only output. Its `print-mode.png` and `letter.png` captures show states unaffected by scalar probe storage. [Printability estimates](../../site/content/help/printability-estimates.md) retains the same orientation choices, wall and support thresholds, packing and sliced-label freshness. The other two articles embed no screenshots. Every step, label and depicted state remains accurate, so all three articles and their captures stay unchanged. Preflight continues to emit the three unchanged-article reminders because it checks coverage paths rather than this evidence.

The preflight follow-up reran changed-file checks after expanding the article evidence. Formatting, lint, documentation, site copy and TypeScript passed. Related tests passed 320 cases across 52 files and failed the scene variant of `src/cases/fixtureWorkflow.test.ts` at its existing 5,000 ms timeout. The test phase reported 16.71 seconds. The earlier run passed all 321 cases against the same code. This follow-up is not a passing related-test check. No test, timeout, retry or quarantine changed. Full failure evidence is in `scratch/check-label-fit-followup.log`.


## Plate prefixes grow only at their end

Whole-app search found two plate-prefix initialization loops in `print/pack.ts`, shared by loose and fixed packing. Both now start at `spaces.length`. The array remains contiguous because every placement fills its missing prefix before writing its own plate. Existing spaces never need initialization again. Free-space searches, keep-out subtraction, candidate order, fixed positions, diagonal plates and numbering stay unchanged.

On November 17, 2026, a scratch replay on macOS arm64 with Node v26.13.0 compared complete outputs against the previous implementation in 126 cases. These included 120 generated combinations of fixed positions, high starting plates, skipped plate numbers, build steps, diagonal parts, keep-outs and gaps from zero through six. Six full-plate cases used 100, 300 and 600 loose or fixed parts. Outputs matched exactly, and generated source items remained unchanged.

Instrumented prefix-loop visits for loose parts fell from 166,650, 4,499,950 and 35,999,900 to zero. Fixed placement visits fell from 5,050, 45,150 and 180,300 to 100, 300 and 600. These are measured loop counts, not timings or heap measurements. Loose placement still searches earlier candidate plates and their free rectangles. This change removes only the repeated initialization scan inside that search, so complete packing is not claimed to be linear.

The replay and observations remain in `scratch/pack-prefix.test.ts`, `scratch/pack-prefix-results.json` and `scratch/pack-prefix.log`. Existing `plan.test.ts` and `obstacles.test.ts` retain packing, fixed-turn and obstacle coverage. This reversible loop-bound refinement adds no permanent test, timeout, retry or quarantine.

No user action, control, label or visible state changes. The covered articles [Printability estimates](../../site/content/help/printability-estimates.md) and [The path from design to build](../../site/content/help/from-design-to-build.md) still describe the same material packing, obstacle clearance and build-order plates. Both articles contain no screenshots. Their instructions remain accurate, so no article or capture changes apply.

Changed-file validation passed formatting, lint, documentation, site copy for 323 pages, TypeScript and all 700 tests across 85 related files. The test phase reported 58.84 seconds locally. Complete output is in `scratch/check-pack-prefix.log`. Copy accounting is net zero. Preflight emitted only the two unchanged-help reminders addressed above.


The preflight follow-up reread both complete covered articles against the final two loop-bound edits and their caller in `print/plan.ts`. In [The path from design to build](../../site/content/help/from-design-to-build.md), “How it gets made” still describes build-order plates. `buildPrintPlan` still groups materials and sorts plates by earliest guide step, and the packer still prioritizes fixed positions and then build steps. The article’s controls, readiness, slicing, sending, Merge, labels and repair instructions are untouched by these loop bounds.

In [Printability estimates](../../site/content/help/printability-estimates.md), “From estimate to slice” still matches per-material packing, keep-outs and placing unused parts last. `newPlate` still subtracts keep-outs, `placeFixed` still checks saved positions and `packPlates` still sets the tail for unassigned steps. Orientation selection, diagonal fallback, wall thresholds, estimates and sliced results are untouched. Both articles are concept pages without numbered steps or screenshots. Every label and linked action retains its behavior, so both pages stay unchanged. Preflight continues to report their unchanged coverage paths because it cannot infer this content verification.


## Packing splits append to one output list

Whole-app search found one MaxRects free-space splitter, in `print/pack.ts`. Every keep-out subtraction and fixed or loose placement uses it. It now appends surviving rectangles into one occupancy result, removing each nonoverlapping rectangle's singleton array and each overlapping rectangle's staging and filtered arrays. Rectangle construction, insertion order, nonoverlapping object identity, tolerance and containment pruning remain unchanged. The occupancy result and final pruned list still allocate.

On November 17, 2026, a scratch replay on macOS arm64 compared complete layouts against the previous implementation in 243 cases. Generated cases combined fixed positions, rotated parts, diagonal parts, starting plates, build steps, margins, keep-outs and gaps of zero, 0.0000001, 0.000001, two and six millimeters. All outputs matched exactly, and the generated source items and beds stayed unchanged.

For dense 100-, 300- and 600-part fixtures on a 256 mm bed with one keep-out, measured splitter visits were 4,250, 13,915 and 25,868. Overlapping visits were 378, 1,210 and 2,199. The corresponding removed temporary arrays are 4,628, 15,125 and 28,067, calculated as one array per visit plus one extra per overlap. These are source-level allocation counts, not heap measurements or timings. Containment pruning still compares free rectangles, so this does not establish linear packing or complete planning speed. Replay code, observations and output remain in `scratch/pack-split.test.ts`, `scratch/pack-split-results.json` and `scratch/pack-split.log`.

Existing `plan.test.ts` and `obstacles.test.ts` retain packing, fixed-turn, clearance and export coverage. This reversible allocation refinement adds no permanent test, browser walkthrough, timeout, retry or quarantine.

The preflight follow-up reread both complete covered articles against the final split-accumulation diff. In [The path from design to build](../../site/content/help/from-design-to-build.md), “How it gets made” still describes plates in build order. `buildPrintPlan` still groups inputs by material and orders plates by their earliest guide step. `packPlates` still prioritizes fixed positions, then build steps, with unused parts starting at the tail. Slicing, sending, Merge, guide letters, repair plates and all named controls are outside the changed splitter. Those claims and labels remain accurate.

In [Printability estimates](../../site/content/help/printability-estimates.md), “From estimate to slice” still describes per-material packing around clear areas. `newPlate` still subtracts every keep-out through `occupy`, and `placeFixed` still rejects saved positions through `placementFits`. The splitter retains the same 0.000001 tolerance and candidate order. Orientation choices, diagonal fallback, wall thresholds, brim clearance, time estimates and sliced results are unchanged. Both articles are concept pages without numbered steps or screenshots. No instruction, label, layout result or depicted state becomes untrue, so both articles stay unchanged. Preflight continues to emit coverage reminders because it checks changed paths rather than this content verification.

## Print-service transform lookup stops at the first match

Whole-app search found one plate-to-part transform lookup, `bedMatrixOf` in `print/plan.ts`. Print-service STL requests use it through `stlItems` in `print/serviceQuotes.ts`. The lookup now searches plate item lists directly and returns at the first match, removing the complete flattened list per requested part. Plate order, first-copy selection, matrix identity and fresh off-plate mappings stay unchanged. No index or cache survives a call. Other flattened searches in agent messages concern tool calls rather than plate transforms and are outside this refinement.

On November 17, 2026, a scratch replay on macOS arm64 compared the previous and current lookup across 350 cases. It covered zero through 30 plates, empty plates, duplicate part identities, missing parts and reversed plate order. All results matched exactly, matching matrix references were retained, source plans stayed unchanged and fallback mutations did not affect later calls. Replay code and results remain in `scratch/bed-matrix.test.ts`, `scratch/bed-matrix-results.json` and `scratch/bed-matrix.log`.

Instrumented 300- and 600-plate fixtures with an initial match reduced item-list reads from 300 and 600 to one each. The lookup no longer builds the corresponding 300- and 600-entry flattened arrays. These are operation counts, not timings or measured heap allocations. Missing or late matches still search the preceding items, and multiple requested parts still make separate lookups. No complete quote-latency improvement is claimed.

Existing `posedStl.test.ts` covers the off-plate Z-up output. `serviceQuotes.test.ts` covers quote selection, copies, mirrored parts, material edits, stale prices and printability blockers. This reversible lookup refinement adds no permanent test, browser walkthrough, timeout, retry or quarantine.

The preflight follow-up reread all three complete covered articles against the final `bedMatrixOf` diff and its production caller, `stlItems` in `print/serviceQuotes.ts`:

- [The path from design to build](../../site/content/help/from-design-to-build.md): “How it gets made” still describes plates in build order. `buildPrintPlan` still groups materials and sorts plates by earliest guide step. Slicing, sending, Merge, labels, repair plates and readiness are unchanged. Its print-service link remains accurate because lookup returns the same transform. This concept article has no screenshots.
- [Print plates on several printers](../../site/content/help/print-plates-on-several-printers.md): every Settings, Print, Start Next and Start Print step remains unchanged. `fleet.ts` uses `nextPlate`, `offeredTo` and bed-fit checks, without calling `bedMatrixOf`. Loaded-filament selection, plate numbering and build-step completion are unchanged. The `printers.png`, `start-print.png` and `plates.png` captures depict unaffected controls, state and plate order.
- [Printability estimates](../../site/content/help/printability-estimates.md): pose selection, support and wall thresholds, material packing, obstacle clearance and sliced-time substitution do not use this lookup. `choosePose` and `buildPrintPlan` are unchanged. Its Made by a Service claim remains accurate because quote selection and prices are untouched. This concept article has no screenshots.

[Price printed parts from a print service](../../site/content/help/price-printed-parts-from-a-print-service.md) also still correctly describes uploading each part in its plate pose and quoting copies together. Its settings and BOM screenshots remain current. No step, label, transform or depicted state becomes untrue, so all four articles and their captures stay unchanged. Preflight continues to emit the three coverage reminders because it checks changed paths rather than this content verification.

Changed-file validation passed formatting, lint, documentation, site copy for 327 pages and TypeScript. Related tests passed 699 cases across 84 files and failed one case in the unchanged `src/classroom/grading.test.ts`: Carry a cup across a table with a valid submission, prescribed seeds 1 through 5. It timed out at the existing 5,000 ms limit after 5,052 ms. The test phase took 42.50 seconds. This is not a passing related-test check. No retry, timeout, quarantine or unrelated classroom change was made. Complete evidence remains in `scratch/check-bed-matrix.log`. Copy accounting is net zero. Preflight's three unchanged-help reminders were resolved by the article checks above.

## Print-mode pointer queries retain one workspace

Whole-app search found one Print-mode ray constructor in `three/plates/plateView.ts`, shared by part picking and bed dragging. It now lives in `platePointer.ts` with one retained raycaster, normalized coordinate vector and horizontal bed plane per view. Both production query paths use it. Studio picking uses a different raycaster and is outside this Print-mode refinement. Canvas bounds and camera matrices are read for every query. Mesh intersections and returned bed points still allocate independent results, so later pointer queries cannot mutate saved drag points.

On November 17, 2026, `platePointer.test.ts` compared the previous fresh-workspace calculation with retained storage on macOS arm64. The 300- and 600-frame fixtures each exercise two independent views, making one mesh query and one bed query per view per frame. They vary canvas origin, dimensions, camera position, projection aspect and zoom. Exact rays, complete mesh intersections and bed points match. Stored bed points retain their coordinates after all later queries. A separate case checks bed hits, rays facing away from the bed, parallel rays and retained raycaster, coordinate-vector and plane identities.

For those fixtures, the previous code explicitly constructed 1,200 and 2,400 raycasters, the same number of coordinate vectors, and 600 and 1,200 bed planes and normal vectors. The replacement constructs two of each at view initialization. These source-derived operation counts exclude the raycaster's internal ray and vectors and the independent output points. They are not heap measurements or timings. No complete drag-latency improvement is claimed.

The initial test run found a new test's analytic zero expectation differed from Three.js by 2.22e-14. The assertion now compares exact output with the previous ray calculation, matching the parity contract used by the larger fixtures. Production arithmetic did not change.

[Print a robot's parts](../../site/content/help/print-a-robots-parts.md) still correctly describes dragging, selecting faces and refused obstacle drops. [Printability estimates](../../site/content/help/printability-estimates.md) still describes the same face override. No action, label, layout or depicted state changes, so the articles and captures remain current. No browser test, screenshot or changelog is added for this internal workspace change. Existing `e2e/printPlacement.e2e.test.ts` retains real Print-mode drag and placement coverage in CI.

## Seeded triangle samples keep scalar coordinates

Whole-app search found temporary barycentric pairs in printed-label fitting, visible-share analysis and kernel surface sampling. All three now keep those coordinates as scalars. Wall-thickness sampling already does this. With seed 7, each 40-point label face previously created 40 initialization pairs and 20 reflection pairs. Both counts are now zero. Returned point tuples remain. These are source-level array counts, without heap measurements or a timing claim.

Existing `labelSamples.test.ts` compares all seeded coordinates across generated faces, reversed winding, degenerate and nonfinite inputs, typed-array views and later edits. User actions and visible states stay unchanged, so help articles and screenshots remain accurate.

## Printed parts are partitioned once

Whole-app search found one printed-versus-remaining partition, `splitPrinted` in `print/tracker.ts`. Its production caller is `workspace/usePrinting.ts`, which supplies both the skipped count and print scope. The helper now appends each part to one output list during a single traversal. It removes the second shape-key calculation and history lookup per part. Both lists retain scene order and original part references. History sorting and replacement semantics remain unchanged.

On November 17, 2026, a scratch replay on macOS arm64 compared complete outputs with the previous two-filter implementation across 60 fixtures. Sizes were zero, one, five, 300 and 600 parts. Cases covered all six record states, stale shape keys, equal timestamps, later successful records and reversed history. Outputs matched and source parts and records stayed unchanged. Instrumented shape-key calls fell from 600 to 300 for 300 parts and from 1,200 to 600 for 600 parts. These are operation counts, not timings or heap measurements. Both output arrays and history preparation still allocate. No complete Print-mode latency improvement is claimed.

Replay source, results and output remain in `scratch/print-partition.test.ts`, `scratch/print-partition-results.json` and `scratch/print-partition.log`. Existing `tracker.test.ts` covers replacement persistence and stale shapes. `project.test.ts` checks tracker filtering through actual plate export. This reversible traversal refinement adds no permanent test, browser walkthrough, timeout, retry or quarantine.

[Print a robot's parts](../../site/content/help/print-a-robots-parts.md) still correctly describes the skip-printed switch, edited brackets returning to the plates and repair replacement scope. No action, label, partition result or depicted state changes, so its instructions and screenshots stay current.

The preflight follow-up reread both complete covered articles against `splitPrinted` and its caller in `workspace/usePrinting.ts`. The caller still defaults to skipping printed parts and passes the unchanged remaining-part list to `printScopeParts`.

- [The path from design to build](../../site/content/help/from-design-to-build.md): “How it gets made” still describes build-order plates, slicing and sending. The one-part repair plate still uses the existing repair scope. The partition does not change guide order, printed letters, readiness, kit contents or any named control. The article has no numbered steps or screenshots.
- [Printability estimates](../../site/content/help/printability-estimates.md): “From estimate to slice” still describes material packing, build-order priority and a single replacement copy. Pose selection, support and wall thresholds, obstacle clearance, sliced-time substitution and excluded sheet parts are outside this diff. The article has no numbered steps or screenshots.

Neither article has a step, label, claim or depicted state made untrue by this change, so both stay unchanged. Preflight continues to report their broad `src/print/` coverage because it detects changed paths rather than this verification.

The scratch replay passed all 60 fixtures. The initial changed-file check passed formatting, lint, docs, site copy for 330 pages and TypeScript, then failed before related tests started. Vitest reported `ENOTEMPTY` while removing the shared `node_modules/.vitest-cache` directory. The replay and changed-file check had run concurrently against the same linked dependencies. The required check was started again after the replay finished, with no test timeout, retry setting or repository configuration change. Initial logs remain in `scratch/check-print-partition.log` and `scratch/print-partition.log`, with the sequential check in `scratch/check-print-partition-final.log`.

The sequential changed-file check passed all static stages and 37 related tests across eight files. Vitest reported 827 ms for the test phase. Copy accounting is net zero. Preflight retains only the two unchanged-help reminders resolved above.

## Comparison fit plates

The November 18 local capture used the generated 608 bearing seat in `print/fitVariants.fixtures.ts`, a PETG host and three bore values: 21.9, 22 and 22.1 mm. Hardware was an Apple M5 Pro with 24 GiB RAM, macOS arm64, Node 26.13.0 and Chrome 157.0.8103.79. The ordinary single-value fit and the comparison used the same coupon cutter, printer and plate writer. The baseline was opened once to warm the existing analysis caches, then reopened for the measured preparation. The comparison always started a fresh operation worker.

These are single local development-server observations gathered while capturing help states. They are not production-build timings, CI timings, a throughput rate or evidence that comparisons are faster.

| Observation | Single value | Three values |
| --- | ---: | ---: |
| Preparation from the ordinary UI action to the plate or candidate controls | 297.55 ms warm | 345.76 ms |
| Delivered 3MF bytes | 2,979 | 5,813 |
| Retained dedicated preparation workers after completion | 0 | 0 |
| Shared geometry-worker used heap after explicit GC | 15,753,116 bytes | 15,815,504 bytes |
| Shared geometry-worker backing storage after explicit GC | 15,963,823 bytes | 15,963,854 bytes |
| Analysis-worker used heap after explicit GC, all four | 48,409,636 bytes | 48,409,636 bytes |

The first baseline action, including initial Print setup and restored-geometry readiness, took 1,865.24 ms. It is not comparable with the warmed baseline. Preparation timings include UI delivery. Byte counts come from the actual ordinary plate writer's binary output, including the comparison identity map.

Worker memory was sampled through Chrome's Target and Runtime domains. Each worker received `HeapProfiler.collectGarbage`, then `Runtime.getHeapUsage`. Both completed states retained six workers in this session. The operation worker was absent after completion and after cancellation. Across all workers, used heap changed from 78,557,592 to 80,455,660 bytes, then 78,898,388 after cancellation. Backing storage changed from 76,583,060 to 151,805,556 bytes. The changing remainder belongs to the thumbnail worker during these captures, so total-worker deltas cannot be attributed to comparison preparation. The geometry-worker increase was 62,388 heap bytes and 31 backing-storage bytes, while analysis-worker measurements were unchanged. No operating-system RSS or peak operation-worker heap was measured.

Cancelling an eight-value preparation took 7.14 ms from dispatching the Cancel click to clearing its busy state. A subsequent worker snapshot retained no operation worker and the same six shared workers. The original single-value entry has no Cancel control, so it has no corresponding latency measurement. Cancellation was measured on actual worker startup and source hashing. Native CAD cancellation still relies on the existing transaction guard and bounded kernel pool, rather than terminating unrelated kernel jobs.

`fitVariantJob.test.ts` exercises operation-worker disposal after successful preparation and a nonresponding request. It asserts that cancellation never invokes interaction-thread geometry as a fallback. Production geometry tests retain source arrays, independently measure resulting holes, inspect package identities and check deterministic bytes. [Failure observations and coverage](performance-printing.md#comparison-fit-plates) record which paths were observed locally and which remain assigned to CI.



The November 18 implementation extends ordinary Print Fit Test and shared design parameters. The ten-interface production matrix in `src/print/fitVariants.integration.test.ts` independently ray-measures regenerated coupon triangles for screw clearance, bearing seat, servo pocket, motor pocket, heat-insert bore, shaft bore, alignment pin, sliding rail, keyed hub and removable enclosure lip. Its generated sources include a keyed union, a long sliding channel and a removable plug with a flange. Purchased interfaces retain their catalog records, with real servo and motor meshes supplied to the pipeline. Preview preserves the complete source, and repeated preparation produces identical coupons. Each interface also exports all three candidates on one plate. The tests inflate those 3MFs and independently measure the same expected dimensions in their actual exported triangles.

The same matrix covers rotated host frames, orientation, empty recuts and cancellation before another candidate starts. `fitVariantGuards.test.ts` checks malformed targets, purchased bindings, source admission limits, explicit repeated mating instances, late results and changed geometry. `fitVariantBindings.integration.test.ts` runs actual native OpenSCAD compilation and the Sketch solver with connected boolean recuts. All requested values are independently measured in the resulting triangles. These native tests passed locally on macOS.

`fitVariantLifecycle.integration.test.ts` writes and inflates the real comparison 3MF. It checks exact source hash, parameter and binding identity, purchased record, values and failures, object IDs, plate numbers, matrices, material, geometry count and deterministic bytes. It applies the choice through `useDesignParameters` and the production document commit. One history entry restores complete geometry and declarations through undo and redo, including the design-choice record. The real native scene encoder and decoder preserve the chosen declaration and geometry. Readiness fingerprints and plate hashes change, and previous slice lookup fails for the changed plate.

Review added a two-plate export to this lifecycle test and compared each identity-map matrix with its independently parsed XML build transform. Before the correction, the first plate already differed at serialization precision, with 43.200241 in the map and 43.20024 in the model. Later plates also lacked the model's grid offset. The map now shares the model writer's translated, rounded transform. The failing reproduction is recorded in `scratch/review-fit-repro.log`.

The review correction passed changed-file formatting, lint, documentation, site copy for 340 pages, types and 1,985 related tests across 288 files. One existing test remained skipped by the current suite configuration. The log is `scratch/review-fit-check.log`. The final help-only check is `scratch/review-fit-help-check.log`. No browser walkthrough ran locally during review.

`workspace/fitVariantGuard.test.ts` covers a changed scene with matching names, inactive workspace, changed declarations, material edits, source placement edits and deletion. `workspace/fitVariantJob.test.ts` runs real worker handlers across a controlled clone boundary to check operation order, presentation preparation and disposal. Cancellation and a nonresponding request reaching the 30-second operation limit both dispose the worker. The limit reports a recovery error, while an ordinary cancellation stays quiet. A stopped worker cannot fall back to geometry on the interaction thread. These tests do not simulate a physical fit, test a printer, or relax insert, interference or assembly findings.

The help capture drove ordinary Print, Print Fit Test, explicit bore and mating-part selection, three values, preparation, candidate selection and Apply. It then opened Parameters on the editable design. Its final local run passed with no captured browser errors. The captures are `site/public/help/print-a-fit-test/values.png`, `comparison.png` and `choice.png`. Capture work used a local development server solely to produce these documentation states. The harness reported its existing Vite shutdown timeout after the successful capture, without a failing capture result.

Early capture attempts exposed three distinct conditions. Entering Print Fit Test before restored parameter verification finished discarded a stale baseline, so availability now follows the existing pending-verification state. Opening Parameters while ordinary Print was still open left the Print panel in front, so the capture now closes ordinary Print first. A second warm preparation could finish while Playwright was acquiring Cancel, so the cancellation measurement dispatches the two UI actions in one browser task and records the actual handler latency. No retry, timeout increase or quarantine was added to committed browser coverage.

`e2e/fitVariants.e2e.test.ts` is the focused CI walkthrough. It opens the generated bearing seat, uses the ordinary Print Fit Test header entry, prepares three values, exports through Export 3MF Plates, inspects the delivered package, applies a candidate, checks the recomputed Checks fingerprint and undoes the change. It explicitly has zero retries and retains the existing browser deadline. The full walkthrough was not run locally. Linux and Windows CI observations remain with the existing Check jobs. There is no claim of printer or physical measurement testing. [Preparation and retained-memory measurements](performance-printing.md#comparison-fit-plates) record local methodology and limits.

## Assembly cradles

The generator and writer each own an isolated instance of the existing geometry worker, with no renderer fallback. Cancellation terminates that worker and rejects pending delivery. Both operations have a 20-second deadline. Scene and selected-source limits apply before native generation, and scene triangle counts are checked before copying geometry buffers. Normals are prepared in the worker. The viewport adds only GPU attributes and the assembly transform for its tooling overlay.

A macOS arm64 measurement worker on Node v26.13.0 prepared the ten generated assembly fixtures once each through the production function. Preparation ranged from 15.60 to 42.62 ms. Output ranged from 476 to 908 triangles. Position buffers ranged from 17,136 to 32,688 bytes, with equal-sized normal buffers. Prepared input buffers ranged from 89,100 to 98,028 bytes. These timings exclude viewport extraction, fixture construction and cold WASM loading.

The measurement supplied the existing Manifold module with an observed native instantiation callback. Its allocated WASM linear memory remained 16,777,216 bytes throughout the ten jobs. This is allocated native heap capacity, not live native allocation count or a maximum-size workload bound. The measurement worker's sampled JavaScript heap ranged from 41,282,080 to 77,914,784 bytes and includes Vitest and fixture preparation. It is not the browser worker's peak heap. The operation deletes intermediate native objects and disposes the worker, so native memory is not retained across UI generations.

Raw measurements and the measurement script remain in `scratch/cradle-measurements.json` and `scratch/cradle-metrics.test.ts`. The bundled browser capture observed cancellation in 2.73 ms, from the termination request through RPC cleanup. It cancelled during real operation-worker startup. The observation is retained in `scratch/cradle-browser-cancellation.json` and uses `cradle:cancel`. `cradle:prepare` retains the latest successful preparation duration, triangle count and input/output byte counts. These measurements add no timing assertion, delay, retry or merge gate. [Build testing evidence](performance-printing.md#assembly-cradles) records the pipeline, capture and broader check limits. Physical holding behavior and printer fit have not been measured.



Issue #1917 uses the existing prepared geometry, Manifold loader, fastener tracing, driver screening, Print reports and 3MF writer. Ten generated scenes combine distinct manufactured profiles with actual M3 screw geometry and guide tool bindings: servo bracket, bearing housing, repeated leg module, pan-tilt base, gripper body, wheel hub assembly, electronics tray, fixed-arm elbow module, conveyor roller support and asymmetric sensor mount.

The geometry tests intersect the entire continuous source projection extrusion with the generated world-space cradle. The rotated case transforms the same native lift volume, rather than checking a few poses. Pipeline tests parse the real 3MF and its source metadata, compare object vertex extents with retained dimensions, retain original parts and quantities, and check the existing minimum wall threshold. Refusals cover undercuts, nonplanar resting geometry, inadequate support, open and nonfinite meshes, repeated identities, unsupported tools, excessive geometry and plates that do not fit. Access fixtures seed lateral insertion blockage, a small obstruction between screening rays, the hex key turning region and missing source moves.

The first kernel check exposed nine failed full-lift assertions at nominal base contact. Placing the cradle 0.01 mm below the source plane resolved them without weakening the empty-intersection assertion. `scratch/cradle-initial-failure.log` retains that observation. Adding the production path exposed collapsed offset facets and multi-piece hardware render meshes. Native closed-solid validation now follows the existing welding path. Nonselected hardware uses a conservative prepared-triangle convex obstacle envelope, while held source geometry still requires a valid closed native solid. The focused pipeline check then passed 14 tests in three files, before the later archive extent and session-binding assertions.

The capture walkthrough first missed the existing 30-second page-load deadline. The next observation loaded and reached selection. The fixture had assumed the base was the first guide step, while the existing planner begins with the arm module. The declaration now selects the current step's offered part and verifies that exact identity and its dimensions in the downloaded archive. The next capture observation passed in 23.01 seconds including startup and four PNG writes. It exercised ordinary Build controls, generation, the real browser download, return to the same step, removal presentation and unchanged robot parts and weight. Vite teardown reported retained dev servers after the test passed. The successful story asserted that the harness error list was empty. These are observations, not a browser flake-rate measurement.

A broad changed-file run selected 320 related files. It passed 298 files, failed 21 and skipped one. Twenty failed files reported existing timeouts across simulation, imported worlds, electrical Kit preparation, Lighten and mechanism regeneration. The remaining failure identified ordering of the two new devStudio hook names and was corrected. `scratch/cradle-code-check.log` retains the exact failures. No timeout, retry, quarantine or shared harness was changed. Existing print-browser repair ownership remains with #1853.

Cancellation tests terminate an owned worker request without a local geometry fallback. Stale archive tests replace the source while bytes are being written and refuse delivery. Session, plan, step, parts, project, scene and printer bindings are checked on preparation and export. These contracts cover temporary tooling only, without persistent build identities or completion records.

Holding strength, clamping force, durability and physical printer fit remain unmeasured. Native geometry checks do not establish these properties. Timing and memory observations belong in [Printing performance](performance-printing.md#assembly-cradles).

The final focused changed-file check passed all 39 tests in seven files, including the ten production profiles, native lift proof, actual tool envelopes, archive dimensions and source guards. A later capture reached generation but missed the existing 30-second result deadline. Instrumentation retained an empty error trace. The following diagnostic capture passed in 30.81 seconds with the final source guards and tool sizes, delivered the real archive and recorded worker cancellation. These separate observations do not establish a browser failure rate. No deadline or retry policy changed. Capture logs are `scratch/cradle-capture-frozen.log` and `scratch/cradle-capture-diagnostic.log`.

The pre-merge all-changed-file check selected 321 related files. It passed 317 files, failed three and skipped one. It passed 2,476 tests, with two test timeouts and an electrical-kit setup timeout. `cases/slots.test.ts` and `cases/terrain.test.ts` exceeded their existing five-second test deadlines. `kit/electrical.test.ts` exceeded its existing ten-second setup deadline. These files were unchanged, and no isolated baseline was measured in this session. Format, lint, documentation and types passed. The site key-cap findings from that run were corrected, and the following documentation check passed all 346 site pages. `scratch/cradle-all-final.log` and `scratch/cradle-docs-final.log` retain the outputs. That observation did not establish a green changed-file check.

### Integration with current main

The retained work was reapplied to `94a1bb558107b826888e88fe710c5c84652b44bd`. Conflicts were resolved by preserving frozen build records, completion controls, the independent frozen viewport and supplier commands. Cradle source metadata is an optional transient session field. Frozen sessions have no cradle source binding, so they expose no cradle action or tooling overlay. No frozen storage, manifest or completion protocol changed.

The post-merge check selected 324 related files and passed 320, with one skipped. It passed 2,515 tests. The same three unchanged files failed: the slots and terrain tests reached five-second deadlines, and electrical-kit setup reached its ten-second deadline. Format, lint, types and all 350 site pages passed. `scratch/cradle-main-check.log` retains this run.

The post-merge help capture reached the existing 30-second `page.goto` deadline before app readiness. It never reached the cradle action, so it provides no post-merge browser acceptance result. The earlier successful capture and its screenshots remain retained. `scratch/cradle-post-merge-capture.log` records the failure. An empty auxiliary trace cannot exclude page errors because its listeners were attached to the browser rather than its page context. The successful earlier story separately asserted the harness error list. No timeout, retry, quarantine or shared harness was changed.

A clean snapshot of the same main revision ran the three failing files through `check:changed`. All 33 tests passed in 16.18 seconds. This used a three-file selection rather than the 324-file related selection, so it does not reproduce the broad-run conditions or establish the cause. The baseline retained the same toolchain, deadlines and host. Its source revision is in `scratch/cradle-main-baseline-revision.txt`, and `scratch/cradle-main-baseline-check.log` retains the passing output. That focused comparison did not resolve aggregate validation or post-merge browser readiness.

### Bounded local validation and bundled capture

A later development-server capture again reached the unchanged navigation deadline. Corrected page instrumentation recorded 295 pending module requests and no page errors at teardown. `scratch/cradle-recovery-capture.log` retains the timeout. `scratch/cradle-recovery-navigation.json` retains the observed counts, while the following capture replaced the raw request trace. No cradle action had run.

Preparing the app bundle for help capture took 28.50 seconds. The existing harness then selected its fresh `dist` bundle. The actual walkthrough passed in 13.83 seconds, including four PNG writes, the downloaded 3MF assertions, unchanged robot parts and weight, return to the original step, removal presentation and a real operation-worker cancellation. The screenshots were refreshed from this bundled observation. `scratch/cradle-bundled-capture.log` retains the result. The unused web target still used its existing development server, and teardown retained the existing dev-server shutdown warning. No browser deadline or harness code changed.

For local aggregate validation, `VITEST_MAX_WORKERS=4` bounds concurrent test files through the existing runner option. This is an invocation setting, not repository test policy or a CI gate. The measured reason is the repeated 324-file deadline failures alongside a passing 33-test focused baseline on the same host. The bounded command retains every selected test, assertion and deadline. Its complete result is retained in `scratch/cradle-bounded-check.log`.

The four-worker aggregate observation passed 323 files and 2,536 tests, with one existing skipped declaration. Its related selection contained all 324 files. The test phase took 141.96 seconds, compared with 136.65 seconds for the earlier failed aggregate observation. These are individual observations under different concurrent host activity, not a measured throughput or reliability rate. The 5.31-second difference is retained alongside the deadline failures rather than hidden by a larger deadline. The local invocation changed no assertion, selection, retry, quarantine, isolation setting, repository configuration or CI gate. `scratch/cradle-bounded-check-result.json` records exit code zero and the exact input files. The successful bundled walkthrough establishes post-merge browser acceptance for the temporary cradle flow. Physical holding strength and printer fit remain unmeasured.


### Cradle review corrections

Review seeded a stationary context box through the cradle base with no insertion moves or driver requests. The original access check accepted it. `scratch/review-1941-regression.log` records the failing refusal assertion. Access checking now intersects every seated prepared solid with the cradle before insertion or driver checks. The same test moves the context clear and retains acceptance.

A hook replay also exposed options remaining open in an inactive workspace. Workspace deactivation now invalidates prepared results, step changes close options, and starting over resets the removal presentation. `useAssemblyCradle.test.ts` exercises leaving and returning to the workspace and moving to another step. `assemblyCradleActions.test.ts` resolves two face requests out of order and delivers another reply after closure. Selection tokens prevent either obsolete reply from changing the offered directions. These are state and geometry regressions. Browser execution of the corrections belongs to CI.

The review's 15-file changed check passed formatting, lint, types, documentation and all 350 site pages. Its related selection passed 278 files and 2,270 tests, with one existing skipped declaration. The test phase took 191.23 seconds with the existing four-worker invocation limit. `scratch/review-1941-final-check.log` retains the result. A separate four-file documentation check passed after export descriptions were clarified to distinguish source identities from the cradle's dimensions, with its output in `scratch/review-1941-site-final.log`. Help now ends its ten-step task at archive export, places each screenshot beside its action and keeps removal controls after the task. The changelog describes behavior without walking through controls. No existing test, assertion, deadline, retry, quarantine or shared harness changed.

## Windows print browser failures

[Check 44495446798](https://github.com/JamelHammoud/basecase/actions/runs/44495446798) at `aa8a3040a82b8bd1853561dbd2c12ffce9df38f6` failed four declarations in `e2e/print.e2e.test.ts` on Windows. The baseline Print Fit Test story reached its final empty-console assertion with `ERR_CONNECTION_REFUSED` for the STS3215 mesh on its local bundle server. The file shares one app, scene, printer state and error list. That retained error also failed the later label, Prusa and build-order stories. Retries reuse this state and are not independent observations.

Separate assertions also failed. The label story returned no omitted-letter notes rather than the expected four entries. The Prusa retry found two matching descriptions rather than one. The fleet retry omitted `base` from the expected three-plate layout. A refused mesh request does not establish the cause of these three assertions. Trace mesh delivery, guide readiness, label generation, printer state, base eligibility and fleet allocation as separate paths until evidence connects them.

[Last full green 44391437908](https://github.com/JamelHammoud/basecase/actions/runs/44391437908) passed the four Windows stories in 14,465, 6,740, 3,193 and 5,155 ms. Print, guide and browser test sources are unchanged. No changed environment component has been identified to pin. The four exact declarations are quarantined only on Windows through 28 November under priority owner [#1853](https://github.com/JamelHammoud/basecase/issues/1853). Print panel, shortcut and backend-call assertions remain active there, alongside print-placement browser coverage and the fast coupon, label, packing, tracker and fleet pipelines. Those do not replace the complete stories. Other platforms retain all four.

Focused diagnostic [44498263448](https://github.com/JamelHammoud/basecase/actions/runs/44498263448) selects the baseline coupon declaration at the failed revision with one worker, zero retries and quarantine off. Durable ticket: `db3e9a2b-52f5-4559-996a-1c542068b64e`. It observes only that path, not the three later assertions or their shared-state history. Restoration requires a demonstrated cause and fix and at least ten baseline and ten candidate observations for each failed Windows path at equal load, with retries disabled and current assertions and deadlines intact. Shared-file changes remain with #1853. The repair session does not measure a flake rate.

### Windows comparison Apply failure

The same Check prepared all three bearing comparison coupons in `e2e/fitVariants.e2e.test.ts`, exported through the ordinary palette command and inspected the real 3MF mesh and identity map. Selection reached `22.1 mm`, but `Apply 22.1 mm` stayed disabled until Playwright exhausted its existing 30-second click deadline. Application, readiness invalidation and undo were never reached. The button refuses stale sources and busy preparation. The log does not distinguish those conditions or establish why either persisted.

Last full green 44391437908 passed Windows in 16,913 ms. The browser, source guard and preparation hook are unchanged. The intervening tolerance-preservation edit in `fitVariantEdit` runs after application and does not establish a cause for pre-application disabling. Priority owner [#1854](https://github.com/JamelHammoud/basecase/issues/1854) owns identity, verification, worker, export, selection and Apply tracing. The sole declaration is quarantined only on Windows through 28 November. Linux and macOS retain the complete walkthrough. Windows retains the ten-interface matrix, native regeneration, source guards, worker lifecycle, real package identities, ordinary parameter commit, history and save/reopen integration. These do not replace browser Apply delivery.

Diagnostic [44498284294](https://github.com/JamelHammoud/basecase/actions/runs/44498284294) selects that exact declaration at the failed revision with one worker, zero retries and quarantine off. Durable ticket: `576dce39-8834-434b-b7ad-86c5487c619f`. Restoration requires a demonstrated cause and fix plus ten baseline and ten candidate equal-load Windows observations, preserving stale-source refusal, existing assertions and deadlines. No repair-session rate is measured.

The coupon diagnostic passed in 13,709.1286 ms in a 33,790 ms process on Windows image `20261103.298.1`. The failed print shard used the same image, establishing intermittent delivery at that revision and image without explaining the refusal. The fit-comparison diagnostic passed its complete export, Apply and undo story in 10,977.1068 ms in a 34,274 ms process on image `20261103.298.1`, compared with `20261116.315.1` in the failed fit shard. That establishes a pass at the failed revision without isolating an image component, measuring a rate or proving that the source guard is correct in every browser schedule. Both manifests were collected and verified in the repair session.

### Separate print-path observations

The repair collected three more verified, single-process observations at the exact failed revision, each with one worker, zero retries and quarantine off:

| Path | Diagnostic and durable ticket | Observation |
| --- | --- | --- |
| Debossed labels | [44499134700](https://github.com/JamelHammoud/basecase/actions/runs/44499134700), `3e905cb4-d508-40e9-ad41-790abd5d2500` | Passed all label and mesh assertions in 32,083.0393 ms, process 51,973 ms, image `20261116.315.1` |
| Manual Prusa | [44499137907](https://github.com/JamelHammoud/basecase/actions/runs/44499137907), `0c549a28-9e81-41b0-81c0-d490806e33a9` | Passed in 11,603.4913 ms, process 33,042 ms, image `20261103.298.1` |
| Build-order fleet | [44499140745](https://github.com/JamelHammoud/basecase/actions/runs/44499140745), `8b07f877-ddf9-4fb9-a1a5-8e7cf5965c31` | Failed in 23,505.5384 ms, process 45,896 ms, image `20261103.298.1` |

The failed print shard used image `20261103.298.1`. The isolated label and Prusa observations omit the preceding tests and their retained state. The fleet diagnostic passed the expected three-plate layout, clicked Start Next and Start Print, then timed out at line 397 with zero observed sends instead of one. That does not reproduce the original missing-base assertion. Original base eligibility and later send delivery remain distinct paths under #1853. No observation establishes an environment component to pin, a demonstrated product fix or a flake rate. Restore each path only after its existing assertion chain has ten baseline and ten candidate observations at equal Windows load with retries disabled. All future measurements target published revisions through the existing runner. The correction can retain quarantine when first published, then remove it in the same pull request after its published candidate is measured. No unpublished Windows execution is required.

## Replacement-finger outputs

The ten-target attachment matrix uses native OpenSCAD carriers and replacement fingers. It runs the ordinary part soup, measurements, Print plan, actual 3MF writer, drawing preparation, reconciled Kit manifest and ZIP producer. Every case retains two separate finger part ids with quantity one and purchases four M3 × 16 screws, four washers and four nuts. Both flat and V-shaped profiles occur in the matrix. All ten manufacturing rows passed locally in `scratch/finger-matrix-3.log`. This is generated-file evidence, not evidence from a printer or an assembled physical gripper.

The final manufacturing matrix uses the same rotated grippers, alternate supplied mounting dimensions and 21/22 mm travel as the physical matrix. Each finger appears exactly once in packing identities, with matching row quantities and one native manufacturing output. All ten rows passed in `scratch/finger-matrix-final.log`, alongside the 20 physical rows and both runtime-alias boundary tests. The ordinary recipe catalog also requires both native bore ports.

## Related incident summaries

Historical cross-owner observations remain in the linked summaries. Add new evidence and restoration observations to this note, beside the feature they exercise. Implementation, coverage judgments and quarantine restoration remain with the existing repair owners.

- [Nightly build exclusions on 21 November](node.md#nightly-build-exclusions-on-21-november).
- [Additional build and replay boundaries in Check 44885120824](node.md#additional-build-and-replay-boundaries-in-check-44885120824).

## Linux dispatch in Check 44887426902

The Linux build-order printing declaration reached the three-plate layout, then exhausted 30000 ms clicking Voron B Start Next. The resolved disabled button became detached. A later attempt stalled earlier opening Settings Printers, and is not evidence that the first dispatch stage succeeded. The declaration joins existing [#1853](https://github.com/JamelHammoud/basecase/issues/1853) only on Linux through 28 November 2026. Linux retains the other print stories plus fast fit, label, plan, tracker and fleet checks. macOS retains the complete fleet dispatch story. The owner must separate printer status, reservations, button replacement, dialog dispatch and shared state between attempts.

Restore each path only after a demonstrated correction and ten baseline and ten candidate equal-load observations on its excluded platform with retries disabled and current deadlines and assertions intact. No flake rate or candidate hosted completion is claimed. Existing #2029 exclusions already cover the photo-import, tendon and Current replay failures in this run, and are not duplicated.

The same failed published revision produced an additional focused observation. [Linux printing 44889810074](https://github.com/JamelHammoud/basecase/actions/runs/44889810074) clicked Start Print but received zero sends at line 397, failing in 20463.420997 ms with a 44940 ms process. This adds backend delivery to the separate status, reservation and dialog boundaries. The observation retained Vite-server cleanup warnings. It used one worker, quarantine off, retries disabled, x64 Node 26.13.1 and four CPUs on Ubuntu image `20261116.202.1`. Ticket `ae80936c-1f83-43ac-b0a0-841e3e7efb20` retains the verified artifact. This observation does not establish a common cause or candidate result.
