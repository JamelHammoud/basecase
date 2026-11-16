# Print planning and labels performance

Implementation: [Print planning and labels](../guide/printing.md#performance-print-planning-and-labels). Shared requirements: [Performance](../guide/performance.md).

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
