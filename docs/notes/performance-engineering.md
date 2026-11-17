# Engineering calculations performance

## Whole-price formatters are prepared on first use

The app-wide search found `createMoney` in the currency store and the Settings currency-option builder. Settings builds labels for all 30 supported currencies using only the symbol and name. Previously those labels constructed 60 `Intl.NumberFormat` objects, including 30 discarded whole-price formatters. They now construct 30 exact formatters. Each money object prepares at most one additional formatter if a whole-price consumer uses it. There is no shared cache or change to rate ownership.

`src/utils/currency.test.ts` instruments the native formatter constructor. It checks 30 constructions after creating all currency labels and using exact, raw and plain formatting. Repeated whole-price calls across every currency raise the total to 60, without further constructions. Output matches native whole-price formatting for zero, negative, fractional, large, NaN and infinite values, including entered prices. Existing tests cover converted prices, rate refreshes and BOM CSV, Markdown and agent text.

These are deterministic construction counts, not latency or heap measurements. The change does not remove the exact formatters needed for currency symbols. There is no screen or workflow change.

Local verification on November 17 passed the isolated currency file's five tests, formatting, lint, TypeScript, site copy and documentation checks. The source-related selection ran 470 files, with 463 passing, one skipped and six failing. It passed 3,198 tests and failed 15. Fourteen failures hit the existing five-second timeout in `cases/slots.test.ts`, `cases/terrain.test.ts`, `cases/handoffGoal.test.ts`, `skills/kitTransitions.test.ts`, `sim/fixtures/passiveParity.test.ts` and `classroom/grading.test.ts`. The remaining classroom assertion received 15 completed runs instead of 20 after the seed-batch timeouts. Other work was running on the host. These observations do not establish a baseline cause. No timeout, retry or quarantine changed.

## Board placement preparation

A production-bundle probe used Chrome 157.0.8103.79 on arm64 macOS, with two and 32 repeated XL330 modules and a 100 × 80 × 1.6 mm carrier. Each module had an explicit three-pad JST placement. The probe called the shipped electrical worker through its normal request/reply protocol, using the catalog servo and header GLBs. Each row is one observation with a fresh worker. They are samples, not latency or memory bounds. Other work was running on the host.

| Modules | Placement | Candidates | Geometry preparation | Prepared triangle bytes | Preview preparation | Preview transfer bytes |
| --- | --- | --- | --- | --- | --- | --- |
| 2 | 13.4 ms | 829 | 128.5 ms | 1,830,240 | 3.1 ms | 38,592 |
| 32 | 127.6 ms | 38,560 | 316.5 ms | 29,283,840 | 24.0 ms | 608,832 |

Both searches placed every connector without a clearance or preparation blocker. Prepared triangle buffers stayed inside the worker. Scene JSON was 1,616 and 18,490 UTF-8 bytes. The shared input GLBs totaled 130,396 bytes. These describe cloned input contents, not the browser's internal wire encoding. Preview position and index buffer sizes are actual transferred byte lengths. Placement replies retain ordinary projection data, while inspection returns findings and scalar metrics.

Measured synchronous `postMessage` dispatch was 0 to 0.4 ms. Placement round trips, including worker startup and imports, were 239.2 and 310.3 ms. Inspection round trips were 142.3 and 366.3 ms. Preview round trips were 4.8 and 25.7 ms. The interaction-thread conversion into the existing renderer's number-array mesh contract took 0.3 and 7.1 ms. Heavy bores, placement and clearance work remained in the worker.

Chrome's `Runtime.getHeapUsage` was sampled after explicit collection before work, while holding the converted preview and after releasing it. Active-preview heap deltas were 193,796 and 1,265,964 bytes. After release, deltas were 115,004 and 2,360 bytes. Backing-storage deltas after release were 9 and 0 bytes. No workers remained after either job. These renderer samples include initialization and instrumentation costs. They exclude full-app rendering, GPU memory and whole-process RSS. They do not establish a leak bound across repeated edits. The currently displayed mesh intentionally remains live until replaced.

An earlier Node-only probe measured 4.72/74.74 ms placement and 78.51/209.42 ms preparation before derived header meshes and final assembly evidence were included. It did not measure browser dispatch or transferable previews, so it is not the current feature baseline. Raw browser observations and the throwaway probe are retained in the task handoff. There is no earlier shipped board-placement baseline.

Implementation: [Engineering calculations](../guide/build.md#performance-engineering-calculations). Shared requirements: [Performance](../guide/performance.md).

## Axis rotations allocate only their result

The whole-app search found two callers of the shared Rodrigues calculation: direct `rotateAbout` in swing-torque sweeps and prepared `rotationAbout` in payload poses. The calculation now holds its three perpendicular components as scalars instead of constructing a cross-product array. Each rotation still returns a fresh vector and keeps the previous multiplication and addition order. No caller or sampling policy changes.

A scratch Vitest probe counted calls through both entry points while running complete payload maps and a default torque sweep. An all-revolute six-link arm with 300 samples made 17,100 rotations. A twelve-link arm with 600 samples made 133,200 rotations. The default −90° to 90° sweep made 37 rotations. The previous helper constructed one temporary cross-product vector per rotation, so these fixtures remove 17,100, 133,200 and 37 temporary arrays respectively. Counts were measured on macOS arm64 with Node v26.13.0. They are source allocation counts supported by measured call counts, not heap measurements, timings or complete Checks latency measurements.

`payloadRotation.test.ts` compares both rotation entry points exactly with the previous formula across zero and nonunit axes, signed zeros, tiny and overflowing coordinates, nonfinite values and multiple turns. Its existing comparisons retain complete mixed-joint pose and payload-map coverage, later source edits and floor rejection. Existing `swingTorque.test.ts` checks complete sampled torque maxima. No UI, user action or screenshot state changes, so the existing torque and Payload help articles remain unchanged.

## Axis distances use scalar products

A whole-app search found one tuple-based point-to-axis cross-product distance helper, `utils/engineeringMath.ts`. Servo alignment, wheel contacts, agent interface checks and planned-joint matching share it. The separate `three/analysis/lineDistance.ts` prepares a line projection with retained Three.js workspaces and already avoids per-query vectors. Its degenerate-line behavior differs and stays unchanged.

The tuple helper previously allocated one offset vector and one cross-product vector per query. It now calculates those six scalar components directly and passes the same three products to `Math.hypot` in the same order. For 300 and 600 queries, temporary three-coordinate arrays fall from 600 and 1,200 to zero. These are source-derived allocation counts, not measured timings or complete Checks latency measurements. Axis normalization remains the caller's responsibility.

`engineeringLineDistance.test.ts` compares exact outputs with the former calculation for 1,800 generated point, origin and axis combinations, 300 later edits and 448 exceptional combinations. It checks source preservation, nonunit and zero axes, signed zero, subnormal values, overflow, infinities and NaN. Existing engineering output, wheel-contact and agent interface tests retain consumer coverage. No timeout, retry or quarantine changes apply.

No labels, controls, verdicts, user actions or screenshot states change. The existing Servo torque and sizing and Checks in the Build tab help articles remain accurate.

Validation on macOS arm64 with Node v26.13.0 passed the corrected test's changed-file check, including formatting, lint, site copy, types and both tests. The initial four-file check passed documentation, site copy and types, but caught a test nesting limit that was then fixed. Its broad related selection completed in 202.61 seconds with 2,446 passing tests, 22 failures across ten files and one skipped file and test. The failures were 20 timeouts and two classroom count assertions reporting 15 rather than 20 after seed groups timed out. The timeout files were `classroom/grading.test.ts`, `cases/caseBuilder.test.ts`, `cases/contactProbes.test.ts`, `cases/slots.test.ts`, `cases/terrain.test.ts`, `cases/worldImportRuns.test.ts`, `reality/bodyFit.test.ts`, `strength/lightenPipeline.test.ts`, `skills/kitTransitions.test.ts` and `utils/armSizing.test.ts`, all under `src/`. Lighten reached 30 seconds and the others reached five seconds. This shared-host run is not evidence of clean broad-suite validation or a proven cause for those failures. No retries, timeout changes or quarantine entries were added. Logs remain in `scratch/check-axis-distance.log` and `scratch/check-axis-distance-correction.log`.

## Robot attachment bounds compare directly

`engineeringReadings.test.ts` covers nearby unassigned parts, distant scenery, dynamic objects and independent robot loads through complete engineering reports. A scratch comparison matched complete body results against the previous implementation across 60 cases. Fixtures used all three axes, both directions, gaps of 0, 49.999, 50, 50.001 and 100 mm, reversed part order, dynamic exclusions and later bounds edits. It also checked that grouping preserved its inputs.

Two growing-chain fixtures used 300 and 600 unassigned solids in reverse order, each 10 mm wide with a 50 mm gap. Instrumenting axis-array `every` calls measured 45,150 and 180,300 before, and zero after. Complete body results matched. Each comparison now avoids its three-element axis array and callback. The number and order of bounds comparisons remain unchanged, including the quadratic worst case in nearby-part growth.

Measurements used scratch Vitest on macOS arm64 with Node v26.13.0. These are operation counts, not timings or complete Checks latency measurements. No timing assertion or permanent test was added. The Weight and center of mass help article was checked against the unchanged grouping rule and controls. No screen state or help step changed.

## Box corners allocate only their results

The whole-app search found one box-corner constructor using nested temporary axis arrays, `utils/engineeringMath.ts`. Its consumers are Payload hand-point selection and joint-support span measurement. Other eight-corner loops already select coordinates directly. The motion-hardware mesh loop constructs a four-corner mounting pattern, rather than a box.

Each box previously constructed one X array, two Y arrays and four Z arrays, alongside the eight returned tuples and their outer array. Direct construction removes those seven temporary arrays and eight pushes per box. The nine returned arrays remain independently owned on every call. These are code-derived allocation counts, without a timing measurement or a claim about complete Checks latency. Input coordinates are copied without arithmetic, retaining signed zero, nonfinite values, coincident bounds and reversed bounds.

Existing `payload.test.ts` covers complete Payload rows, stronger actuators, the injected payload sampler and non-arm exclusion. `engineering.test.ts` covers sound and unsupported joints through the complete report. No new browser behavior, control, label or screenshot state changes. No quarantine or test-policy change applies.

Local verification on macOS arm64 with Node 26.13.0 passed formatting, lint, docs, site copy and types. Related selection ran 363 files in 102.84 seconds, with 361 passing, one skipped and one failing. It passed 2,277 tests. The two-arm Hand Off case in `cases/slots.test.ts:113` exceeded its existing 5,000 ms deadline. Isolated checks of that file passed all six tests with the original helper in 884 ms and the refined helper in 741 ms. These file durations include import and setup. This isolates the observed timeout from a repeatable result failure, without establishing its cause or complete Checks latency. The baseline log stays in `scratch/box-corners-baseline-check.log`. No deadline, retry or quarantine was changed.

## BOM categories group rows once

`bomCategories.test.ts` compares complete ordered groups and purchase summaries against the previous per-category filters across 100 generated lists and their edits. Coverage includes empty categories, reversed rows, changed categories, repeated references, unpriced lines, zero prices, estimates, warnings, stale prices, source preservation and independent result arrays. Existing `bom.test.ts` and `buyLine.test.ts` retain BOM export and purchase integration coverage.

A scratch Vitest comparison matched complete Markdown and agent text exports against the previous implementation for 100 generated lists with zero to 297 rows distributed across all nine categories. Getter-count fixtures with 300 and 600 rows reduced category reads from 2,700 and 5,400 to 300 and 600 per grouping call. The Build purchase list and both grouped export formats share this pass. CSV retains its existing ungrouped row traversal. Category order and subtotal arithmetic are unchanged.

Measurements ran on macOS arm64 with Node v26.13.0. These are operation counts, not timings or complete Build latency measurements. An initial scratch fixture supplied estimated totals without their required estimate records and failed in the existing Markdown formatter. The corrected fixture used explicit line totals and passed. No timing assertion was added. The buying and on-hand help articles were checked against the unchanged controls and screenshots, and their coverage now includes the shared grouper.

## Time bottlenecks scan contributors once

`engineeringTimeBottlenecks.test.ts` compares selection against the previous sort formula across 100 generated plate and assembly-step lists and reversed inputs. It covers first ties, fastener ties resolved by minutes, empty lists, signed zero, infinities, NaN and matching sliced durations. Inputs stay unchanged. Existing `engineeringTime.test.ts` and `engineeringTimeGuide.test.ts` retain complete budget and saved-guide integration coverage.

A scratch comparison ran the previous and current `buildTime` with 300 and 600 plates and steps. Plate `i` has `(i * 37) % count` hours. Each step repeats its own unique screw id `(i * 37) % 19 + 1` times, exercising the retained within-step repeat rule. Complete results matched. Instrumenting `Array.prototype.sort` found two sorts and 4,080 comparator calls before for 300 contributors, and two sorts and 8,870 calls for 600. Both new runs made zero sort calls. The two copied candidate arrays are also removed. Selection now makes one traversal per list, keeping one candidate per traversal. NaN plate estimates keep the old sort because their comparator does not define a total order.

Measurements used Vitest on macOS arm64 with Node v26.13.0. These are sorting operation counts, not timings or total comparison counts. No claim is made about complete Checks latency and no timing assertion was added.

## Assembly time tallies accepted parts directly

`assemblyTimes.test.ts` compares complete per-step results against the previous calculation across 160 generated step lists and their later visibility edits. It checks source preservation, screws, inserts, ordinary parts, hidden and reference parts, pivot axes, missing ids, empty steps and repeats within and across steps. Existing `engineeringTime.test.ts` retains full budget, slicing, printer-count and servo-setup coverage.

A scratch comparison passed explicit steps to the old and new `assemblyTimes` functions and counted calls to `Array.prototype.map` and `filter`. With 300 built parts in 30 ten-part steps, calls fell from 153 to one. With 600 built parts in 60 steps, calls fell from 303 to one. Complete results matched. Each step still owns its output id array. The removed temporary arrays are the two built-part staging lists and four per step, or 122 and 242 in these fixtures. The part index also no longer constructs a two-element entry array per built part.

Counts were measured with Vitest on macOS arm64. These are operation and allocation counts, without timing assertions or a claim about complete Checks time. Guide planning, membership rules, allowances and within-step duplicate treatment are unchanged.

## Motion boundaries scan without sorting

`engineeringSweep.test.ts` compares complete motion finding items against the previous filter-and-sort calculation across 100 generated clash lists and their later edits. Coverage includes reversed and one-sided ranges, first-pair ties, published-joint depth and floor exclusions, no collisions, signed zeros, infinities and NaN angles. The existing engineering pipeline tests retain range sampling and slide verdict coverage.

Getter-count fixtures assign clash `i` the angle `((i * 37) % count) - count / 2 + 0.5`, with a designed range of −90° to 90°. Across 300 and 600 clashes, source-angle reads fall from 4,180 and 9,440 to 604 and 1,204. Each direction retains one clash and one clear sample without filtered candidate arrays or sorting. Counts were measured with Node on macOS arm64. These are operation counts, without timing assertions or a claim about complete collision-sweep or Checks time. Geometry work and sampling density are unchanged.

## Torque summaries select the worst joint in one scan

`worstJointLoad.test.ts` compares selection against the previous filter-and-sort implementation across 160 generated load lists. It checks both Build summaries and Study metrics, missing ratings, first ties, source preservation, later edits, signed zeros, infinities and NaN ordering. NaN inputs retain the old sorting path rather than imposing a new ordering.

Getter-count fixtures assign joint `i` the share `(i * 37) % length`, then compare the selected object with the previous implementation. On 300 and 600 loads, share reads fall from 4,334 and 9,600 to 300 and 600. Study also drops its extra copy of the filtered candidates. Counts were measured with Node v26.13.0 on macOS arm64. These are operation counts, without timing assertions or a claim about complete Checks or Study time.

## Payload maps prepare gravity loads once

`payloadRotation.test.ts` compares complete maps through mixed joints, zero and nonfinite loads, source edits and floor changes. Its six-link, 300-sample fixture reduces mass reads from 6,300 to six and limit reads from 1,800 to six. Its twelve-link, 600-sample fixture reduces mass reads from 46,800 to twelve and limit reads from 7,200 to twelve. Rejected and zero-sample maps read neither value. These are operation counts, without timing assertions or a claim about complete Checks time.

## Subset searches retain indices instead of recursive copies

`combinations.test.ts` checks every subset through ten items against an independent bitmask oracle, plus lazy reads, retained results, interleaved traversals and edited inputs. A scratch comparison matched all three previous enumerators across 231 size and count cases. On complete 300- and 600-item selections, each previous enumerator starts 300 and 600 array iterators for recursive copies. The shared traversal starts none. These are operation counts, without timing assertions or a claim about complete fitting or planning time.

## Torque-speed diagnostics retain only emitted samples

`torqueSamples.test.ts` compares complete outputs across 120 generated channel pairs and 13 settling offsets, plus nonfinite inputs, source edits and independent results. Its 300- and 600-window fixtures reduce source-value reads from 600 and 1,200 to 300 and 600. These are operation counts without timing assertions or a claim about complete simulation time.

## Holding loads project without temporary vectors

`holdingTorque.test.ts` checks physical load directions, 1,200 generated loads and subsequent edits, source preservation, signed zeros and nonfinite coordinates. Its 300- and 600-load fixtures reduce temporary lever and moment vectors from 600 and 1,200 to zero. These are operation counts, without timing assertions or a claim about complete check time.

## Power-source searches share actuator and regulator preparation

`servoPowerSelection.test.ts` compares complete source, rail and voltage results across 300 catalog mixtures, reversed inputs, later edits and voltage boundaries. Its 300- and 600-source fixtures with 20 servos reduce actuator-model lookups from 6,000 and 12,000 to 20, and regulator scene scans from 300 and 600 to one. Directly compatible sources prepare no regulator list. These are operation counts without timing assertions or a claim about complete check time.

## Arm sizing retains shoulder distance bounds

`armSearch.test.ts` checks candidate order after rejected confirmations, translated and turned bases, edited inputs, empty targets and unreachable-target blame. Its three-target fixture reduces distance calculations from 32,448 to 2,355, and its 600 mm target fixture from 86,672 to 2,946. A scratch comparison matched 52 complete results and candidate sequences against the previous calculation. These are operation counts and result comparisons, without timing assertions or a claim about complete sizing time.

## Payload poses share each hinge rotation

`payloadRotation.test.ts` compares complete poses and payload maps against the previous calculation across mixed joints, zero axes, changed inputs and floor rejection. Its six-link, 300-sample fixture reduces sine and cosine calls from 17,100 each to 1,800 each. The twelve-link, 600-sample fixture reduces each from 133,200 to 7,200. Prismatic chains call neither function. These are operation counts, without timing assertions or a claim about complete check time.

## Analytic arm reach shares elbow-branch calculations

`armReach.test.ts` checks branch order, generated tool targets, joint margins, full extension, refusals, source preservation and calculation counts. A seeded scratch comparison matched 12,169 planar results and 300 target-pose results exactly against the previous solver. On its 300- and 600-query fixtures, inverse-cosine calls fell from 13,420 and 22,610 to 6,720 and 11,326. Two-argument arctangent calls fell from 27,140 and 45,820 to 3,088 and 4,938. These are operation counts, without timing assertions or a claim about complete arm-sizing time.

## Planar hulls share one traversal

`convexHull.test.ts` checks outline order, enclosure, source preservation and degenerate inputs. `supportMargin.test.ts` checks signed distances and the single-contact refusal.

## Torque percentiles select one rank

`torquePercentile.test.ts` compares the previous sorting formula with 160 sample lengths in generated, ascending, descending and constant order. It covers eleven quantiles, later edits, input preservation, signed zeros, infinities, NaN and sparse samples. Walk and fall callers retain their settling, heating and contact windows. Partition work is capped before a sorting fallback, so unfavorable pivots cannot cause unbounded quadratic partitioning. Exceptional samples keep stable sorting because comparator equality can preserve their source order.

A scratch Vitest benchmark on macOS arm64, Node v26.13.0, generated sample `i` as `((i * 73) % 127) / 10`. After 20 warm-up calls per implementation, 100 calls at the 99th percentile took 0.606 ms before and 0.445 ms after for 60 samples, 57.164 ms and 7.135 ms for 560 samples, and 672.421 ms and 15.753 ms for 10,000 samples. These are single local aggregate timings with concurrent related tests, not CI budgets or complete simulation measurements. Two larger scratch batches exceeded Vitest's five-second timeout, so the measurement batch was shortened without changing any timeout. The final scratch run passed. No timing assertion was added.

## Standing contacts index wheel hinges once

`engineeringWheelContacts.test.ts` covers the first qualifying axle, nonrevolute and unrelated joints, tilted and zero axes, normalization, duplicate children, one hinge with several children, separate bodies, source preservation and edits. The shared-hinge fixture checks each body separately because the lowest-margin body can conceal a missing index entry for another child. Centerline tolerance remains inclusive at 10% of wheel height. Rejected wheel candidates retain the exact mesh base or bounds fallback. Existing `engineeringContacts.test.ts` and `engineeringPowerReadings.test.ts` cover stability rows for wheels, casters, feet and shifted mass.

A scratch Vitest comparison matched complete stability results against the previous implementation for 120 generated scenes with 0 to 39 contact parts. Two larger fixtures had 300 and 600 contact parts, the same number of joints, two children per joint and every seventh joint prismatic. Instrumented child getters reduced joint ownership reads from 77,400 to 258 and from 309,000 to 515. The previous implementation scanned all revolute joints for every contact part. The new index reads each revolute joint's children once, then scans only that part's candidates and stops at the first matching axle. These are operation counts, not timings or measurements of complete engineering reports. No timing assertion was added.

## Walk summaries tally unmeasured servo current directly

`engineeringIdleCurrent.test.ts` checks battery runtime against the current formula across 1, 2, 12 and 30 mixed catalog servos. Every third joint has recorded power. Actuator assignments include repeated ids, and removing an assignment makes that servo contribute idle current on the next call. The test checks source preservation and the walking report. Existing `engineeringPowerReadings.test.ts` covers standing estimates, failed walks, rail conversion and measured joint reporting.

A scratch comparison matched complete power rows and battery runtimes against the previous implementation for 100 scenes with 1 through 100 servos. Reversing joints and servos and removing an actuator assignment also retained identical power rows. Instrumenting `Array.prototype.filter`, `map` and `flatMap` around battery runtime for 300 and 600 servos reduced calls from 21 to 18 in both fixtures. The removed arrays are the flattened driven-actuator ids, the unmeasured part list and its mapped idle currents. The sum retains servo order and the existing zero initial value.

Measurements used Vitest on macOS arm64 with Node v26.13.0. These are array-operation counts, not timings or complete Checks latency measurements. Measured-joint filtering and hungriest-joint sorting remain unchanged. No controls or help steps changed.

## Battery cost advice selects one compatible pack

A whole-app search for `premiumPick` and `sameBattery` found one battery premium selector. Agent add and update results reach it through `agentCostRequests.ts`. Actuator advice already takes the first match from a shared price-ordered catalog, whose other callers need that ordering. Battery supply planning ranks different electrical criteria and remains separate.

For N catalog entries and K electrically compatible alternatives, the previous selector allocated a K-entry filtered component list, K price records and a further price-filtered list before sorting. The replacement visits N entries once and retains only successive cheapest qualifying records. It removes three temporary arrays and candidate sorting. Compatibility checks and price reads retain source order. These are code-derived traversal and allocation counts, not timings or complete agent-response measurements.

`premiumBattery.test.ts` checks voltage, capacity, continuous current, bare cells, absent prices, NaN prices, the strict half-price boundary, first equal-price ties, reordered catalogs, edited prices and unchanged source records. Existing `premiumPick.test.ts` retains real-catalog actuator advice and formatted text coverage. No quarantine or timing assertion applies. User actions, output text and screen states are unchanged, so help instructions and screenshots remain accurate.

## Standing stability retains one result

The whole-app search found one lowest-margin stability selector, `utils/engineeringStability.ts`. Build and agent engineering reports both consume it through `runEngineering`. Ordinary calculations no longer build a result list, allocate a temporary empty array per excluded body through `flatMap`, or sort the body results. Geometry measurement still runs for each eligible body. Equal margins keep the first body. A NaN margin falls back to the previous calculation and stable sort, including remeasurement, to preserve exceptional ordering.

`engineeringStability.test.ts` compares complete selection results with individually measured, sorted bodies for sizes zero through 79, reversed source order and later center-of-mass edits. It covers massless and contactless exclusions, negative and tied margins, source preservation and nonfinite coordinates. Existing `engineeringContacts.test.ts` and `engineeringWheelContacts.test.ts` cover full report rows and support geometry.

A scratch comparison loaded the previous implementation from git and matched complete results for 300 and 600 bodies. Every body used a 200 mm square foot, 100 g mass and center of mass `[(i * 37) % count, i + 1, 0]`. Instrumenting only the body-result sort measured one sort with 2,017 comparisons before for 300 bodies and one with 4,500 comparisons for 600. Both new runs made zero body-result sort calls. The replacement makes 299 and 599 margin comparisons respectively. Support-hull sorting is unchanged.

Measurements used scratch Vitest on macOS arm64 with Node v26.13.0. These are operation counts, not timings or complete Checks latency measurements. The logs are in `scratch/stability-counts.jsonl`. No timing assertion, quarantine or browser test was added. No controls, help steps or screenshot states changed. The existing Weight and center of mass and Build checks articles remain accurate.

## Walking power retains the highest-current joint

The whole-app search found one highest-average-current joint selector in `utils/engineeringPower.ts`. Both engineering report rows and battery runtime use it. The measured-joint filter remains because the exceptional NaN path needs its original order. Ordinary selection now runs alongside driven-actuator collection, retaining the first equal reading. A NaN reading sorts that local filtered list with the previous comparator, preserving its exceptional ordering without copying it first. Infinite and negative readings retain the comparator's winner.

For N measured joints, the ordinary path removes one N-reference copy and the sort. It adds N current comparisons to the existing actuator collection traversal. These are source-derived operation counts, not timings or a claim about complete Checks latency. `engineeringIdleCurrent.test.ts` bounds average-current reads to 2N + 1 for 300 and 600 measured joints, and checks the reported actuator. It also compares the winner with the previous stable-sort calculation across source reversals, ties, empty measurements, negative values, infinities, NaNs and later reading edits. Existing idle-current and power-reading tests retain totals, idle fallback, runtime and report coverage. No timeout, retry or quarantine changes apply.

The existing [Checks in the Build tab](../../site/content/help/build-checks.md) article still describes the same current, runtime and supply checks. The [Get a robot ready to build](../../site/content/help/get-a-robot-ready-to-build.md) article still describes the same highest-current joint, measured average and peak amps, runtime and estimate fallback. Its Build, Payload and Settings captures remain accurate. No action, output text or visible state changes, so both articles remain unchanged.

Targeted validation passed formatting, lint, types, documentation, site copy for 291 pages and 2,264 related tests across 361 passing files, with one existing skipped file and test. The test run took 72.76 seconds. Logs remain in `scratch/check-walk-current-final.log`. The first validation was stopped after an unused test parameter was reported, and the corrected inputs passed the final run. Copy accounting is net zero. Preflight's two help notices were resolved by the article checks above.

## Gait crouch scans knee angles directly

The whole-app search found one gait crouch extractor in `utils/engineeringCrouch.ts`. `runEngineering` shares it across Build and agent reports. Pose playback and motion-reference extrema serve different sampling rules and do not compute this verdict.

For each eligible gait and knee, the previous code built a frame-value array, a numeric-value array and, when numeric samples existed, an absolute-value array. With G gaits, K knees and F dense frames, it created 3GK temporary arrays and wrote 3GKF entries. The replacement creates none of those arrays and reads each channel once in frame order. Two gaits, two knees and 300 or 600 frames remove 12 arrays and 3,600 or 7,200 temporary entries respectively. These are source-derived operation counts, not timings or complete Checks latency measurements. Gait filtering and pitch grouping remain unchanged.

`crouchGait.test.ts` compares complete biped models with the previous array-based calculation over 169 pairs of knee values. It includes absent channels, positive and negative angles, signed zero, the 30° floor, infinities, NaN, excluded poses, name-selected gaits, source-selected gaits and empty keyframes. It also checks unchanged inputs, later edits and independent prior results. Existing `engineeringCrouch.test.ts` covers crouch torque, voltage, load sharing and report rows. No timing assertion, retry or quarantine applies.

The existing [Servo torque and sizing](../../site/content/help/servo-torque-and-sizing.md) article was checked against the changed extractor. Its parallel-axis selection, knee tie rule, 30° minimum crouch and two-leg load sharing remain unchanged. The refactor changes no report labels, thresholds or actions described by the article. The [Checks in the Build tab](../../site/content/help/build-checks.md) article also describes the same verdict. Both articles remain accurate, with no changed instructions or screenshot states.


## Budget retains only displayed contributors

The whole-app search found one Budget contributor selector in `utils/engineeringBudget.ts`. Build and agent reports share it through `runEngineering`. Other BOM views display their complete lists and retain their ordering. Passing Budget rows display no contributor items, so they now skip selection entirely.

For N ordinary BOM lines, warnings and failures read each candidate cost once and compare it with at most three retained costs. The selector retains three leaders, with a transient fourth reference during insertion. It removes the N-reference copy, full sort and final slice. Equal costs keep source order. NaN costs fall back to the previous stable sort because its comparator does not define a total order.

A scratch Vitest comparison on macOS arm64 with Node v26.13.0 used checked line costs `(index * 73) % 127`. For 300 lines, price getter reads fell from 4,194 to 1,177. For 600 lines, they fell from 9,582 to 2,377. Both selected the same three source objects. These are operation counts, not timings or complete Checks latency measurements. Logs remain in `scratch/budget-counts.jsonl`.

`engineeringBudget.test.ts` compares the previous selection across lengths zero through 99, reversed source order, checked prices, unchecked estimates, missing prices, ties, negative costs, signed zero, infinities, NaN and later replacements. It checks source preservation and bounds price reads to 4N for 300 and 600 lines. Existing `budget.test.ts` retains complete report coverage for passing, warning and failing budgets, with an explicit empty-items assertion for passing rows. No timing assertion, retry or quarantine applies.

The existing [Price the parts and set a budget](../../site/content/help/price-the-parts-and-set-a-budget.md), [Checks in the Build tab](../../site/content/help/build-checks.md) and [A check blocks Ready to build](../../site/content/help/troubleshoot-build-check-blocks-ready-to-build.md) articles describe the same totals, thresholds, blocker behavior and actions. No labels, instructions or screenshot states change, so the articles remain accurate.

Focused Budget validation passed five tests across two files. The targeted changed-file run passed formatting, lint, types, documentation and site copy for 295 pages. Its related-test selection passed 1,737 tests across 268 files, skipped one existing test file and failed the unchanged two-slot MuJoCo handoff test in `src/cases/slots.test.ts:113` at its existing 5,000 ms timeout. That run took 97.51 seconds. The failure is outside Budget selection and was not retried or given a larger timeout. Logs remain in `scratch/check-budget.log` and `scratch/budget-focused.log`. Copy accounting is net zero. Preflight flagged two unchanged help articles, both checked above with no changed instructions or states.

## Crouch materializes only the winning pitch group

A whole-app search for pitch grouping found one implementation in `utils/engineeringCrouch.ts`. Build and agent engineering reports share it through `runEngineering`. Skeleton sizing selects a fixed scene axis and does not use this candidate-group scoring rule.

Each candidate previously filtered normalized axis records and mapped them into a joint list before calculating its score. Scoring now counts matching directions and detects the first knee directly. The winning axis alone constructs its member list. Candidate scoring, source order, stable sorting, nonfinite comparator behavior and final height ordering remain unchanged. The preparation remains local to each chain.

For N parallel horizontal joints, the previous grouping created 2N member arrays containing 2N² references. The replacement creates one N-reference output list and performs N additional direction comparisons after scoring. At 30 and 60 joints, member arrays fall from 60 and 120 to one, and member references written fall from 1,800 and 7,200 to 30 and 60. Normalized-axis preparation, candidate ranking records and sorting remain. These are source-derived operation counts, not timings or complete Checks latency measurements.

Existing `crouchAxes.test.ts` compares the full lever and knee results against the previous member-list calculation for 529 empty, mixed and reversed chains. It includes knee ties, level and parallel thresholds, zero and nonfinite axes, edited inputs and independent results. Its 30- and 60-joint cases retain source-axis read bounds. `engineeringCrouch.test.ts` retains complete report and crouch-torque coverage. No timeout, retry or quarantine changes apply.

The existing [Servo torque and sizing](../../site/content/help/servo-torque-and-sizing.md) and [Checks in the Build tab](../../site/content/help/build-checks.md) articles still describe the same selected group, tie rule, crouch floor, verdicts and controls. No user action, label or screenshot state changes.

## Swing torque streams angle samples

The whole-app search found one swing-torque sampler, `utils/engineeringTorque.ts`. Engineering joint loads and skeleton sizing call it. Payload maps and motion sweeps use different sampling rules and do not call its angle-list builder.

For S angle samples, the previous implementation allocated one S-entry angle list and S identical three-coordinate gravity vectors. The replacement retains no angle list and prepares one force vector per call. The default range from -90° to 90° has 37 samples, removing one 37-entry list and 36 gravity vectors. The maximum range endpoint is also calculated once instead of once per loop condition. Rotation and moment vectors remain per sample. These are source-derived operation counts, not measured timings or claims about complete Checks latency.

`swingTorque.test.ts` compares exact maxima with the former buffered calculation for 270 combinations of ranges, axes and masses, then repeats after lever edits. Cases include default and reversed ranges, fractional endpoints around the tolerance, single samples, NaN ranges, zero axes, signed zero, negative masses, infinities and NaN. Inputs remain unchanged. Existing engineering and skeleton-sizing tests cover the consumers. No timeout, retry or quarantine changes apply.

The existing Servo torque and sizing and Checks in the Build tab help articles describe the same load estimates, verdicts and actions. No controls, labels, help steps or screenshot states change.

Changed-file verification on macOS arm64 with Node v26.13.0 passed formatting, lint, types, documentation, site copy and 1,794 related tests across 280 passing files. One existing file and test were skipped. The related run took 92.87 seconds. Logs remain in `scratch/check-swing.log`. Copy accounting is net zero. Preflight flagged the unchanged Servo torque and sizing article, which was checked against the preserved sampling and verdict behavior above.

## Arm facing retains only target bearings

A whole-app search for `facingYaw`, bearing lists and widest circular gaps found one arm-facing calculation. Size Arm to Targets and the agent's `size_arm` both call it through `sizeArm`. Other widest-gap calculations operate on different inputs.

For n targets and k eligible bearings, the previous calculation allocated n coordinate pairs, an n-entry coordinate list, a k-entry filtered list, a k-entry bearing list and a k-entry gap list. It also scanned gaps for their maximum and then its first index. The new calculation retains only the k-entry bearing list and scans circular gaps once with scalar state. Sorting remains necessary and unchanged. At the supported eight-target limit with every target eligible, this removes eight coordinate pairs and four staging lists. These are code-derived allocation counts, not timings or complete arm-sizing latency measurements.

`armFacing.test.ts` compares the previous arithmetic across generated layouts of one through eight targets, reversed order, duplicate targets, translated bases, wraparound, nonfinite coordinates and edits. Explicit expectations cover the inclusive 1 mm exclusion and first-gap ties. Existing `armSizing.test.ts` retains full reach, payload and servo-selection coverage. No quarantine or browser behavior changes. Help coverage was rechecked against both flagged articles. [Size an arm from the points it must reach](../../site/content/help/size-an-arm-to-its-targets.md) still correctly describes the selected guides, payload, origin placement, target-facing direction, servo choices and refusal state. [Joints and kinematics](../../site/content/help/joints-and-kinematics.md) describes joint declarations, ownership, poses and IK, none of which this storage change alters. Both articles and the existing arm-sizing screenshots remain accurate and unchanged.

## Engineering body joints group in one scene pass

The whole-app search found one engineering body builder, `utils/engineeringBody.ts`, called through `robotWeight` by Build and agent reports. Its former robot loop filtered the complete scene joint list for each robot. Other ownership filters query one selected robot or preserve rig traversal order instead of scene order. They do not repeat this body-builder scan.

For R robots and J scene joints, ownership lookups fall from R × J to J. Preparation adds one R-entry map pointing at the existing groups, then appends into their output joint lists. With 20 six-joint bipeds, lookups fall from 2,400 to 120. With one robot, the ownership lookup count remains J and the map adds one entry. These are source-derived operation counts, not timings or complete Checks latency measurements. Rig construction, attachment growth, body mass and foot selection remain unchanged.

A scratch comparison on macOS arm64 with Node v26.13.0 compared complete body results against the pre-change module for zero through twenty separated bipeds. It interleaved joints across robots, then reversed the source list and compared again. All 42 comparisons passed. The script and log remain in `scratch/body-parity.test.ts` and `scratch/body-parity.log`. An initial scratch fixture accidentally supplied nested joint arrays and was corrected before this comparison.

`engineeringBody.test.ts` drives real `robotWeight` preparation on two bipeds with interleaved reversed joints. It checks robot order, scene joint order and identity, actuator membership, independent mass and feet, unchanged inputs and fresh output after a later joint-order edit. Existing `engineeringReadings.test.ts` covers separate robot loads, scenery exclusion, dynamic objects and transitive attachments. No timeout, retry or quarantine changes apply.

The existing [Checks in the Build tab](../../site/content/help/build-checks.md) and [Servo torque and sizing](../../site/content/help/servo-torque-and-sizing.md) articles still describe the same mass, load and stability behavior. No user action, label or screenshot state changes, so both articles remain unchanged.

Preflight also flagged [Weight and center of mass](../../site/content/help/weight-and-center-of-mass.md). Its own-parts rule, passive joints, 50 mm attachment limit, scenery and dynamic-object exclusions, per-robot mass and lowest stability margin remain unchanged. The article and its instructions remain accurate.


## Stance loads accumulate supporting contacts once

The whole-app search found one floor-contact centroid calculation for stance torque, in `utils/engineeringTorque.ts`. Build and agent reports share it through `jointLoad`. Skeleton sizing uses one modeled foot position rather than a measured floor-contact list, so it has no equivalent repeated centroid scan.

For F floor contacts and K downstream contacts, the previous calculation filtered F entries, then traversed the K-entry list twice. It looked up each accepted measurement four times. The replacement scans F contacts once and reads each accepted measurement once, accumulating count, X and Z in source order. One K-entry temporary list and 2K extra list visits disappear per joint. For 18 joints each supported by one of six contacts, this removes 18 temporary lists and reduces measurement lookups from 72 to 18. These are source-derived operation counts, not timings or complete Checks latency measurements. Downstream ownership, body mass, load sharing and moment calculations remain unchanged.

`engineeringStance.test.ts` compares exact stance loads with the previous filtered calculation for both biped pitch axes, no contacts, one contact, multiple contacts, unrelated contacts, reversed order, repeated references and later bounds replacements. It also checks unchanged scene inputs. Existing `engineeringReadings.test.ts` retains full report coverage for separate robots, scenery exclusion, floating feet and four-leg load sharing. No timing assertion, timeout, retry or quarantine changes apply.

The existing [Servo torque and sizing](../../site/content/help/servo-torque-and-sizing.md) and [Checks in the Build tab](../../site/content/help/build-checks.md) articles still describe the same stance estimates, verdicts and actions. No user action, label or screenshot state changes, so both articles remain unchanged.

Validation on macOS arm64 passed 1,841 related tests across 291 files, with one existing file and test skipped. That run took 64.82 seconds. Its initial formatting and type findings were confined to the new test fixture. After correction, changed-file checks passed formatting, lint, documentation, site copy for 297 pages, types and the focused comparison test. Logs remain in `scratch/check-stance.log` and `scratch/check-stance-correction.log`. Copy accounting is net zero. Preflight flagged the unchanged torque help article, checked above.

## Electrical package preparation

Preparation runs in a dedicated worker. The interaction thread snapshots electrical inputs and dispatches the job, then delivers the ZIP. Mesh, sculpt, CAD and torque-sample payloads are omitted from the snapshot. Export does not await geometric cable routing, which belongs to the existing wiring measurement pipeline. The first production walkthrough exposed that unnecessary dependency by exceeding the existing download deadline on 180 modules. Removing the routing wait allowed both sizes to complete without changing any deadline or retry.

The pure package producer was measured on a shared macOS arm64 host with Node 26.13.0. Scenes contained one Waveshare adapter, C001 servos, ordinary joints and a declared 6 V, 20 A tether. One warmup preceded five preparations per size. Timing includes projection, canonical source hashing, schematic and library serialization and ZIP compression.

| Servos | Connector and requirement endpoints | ZIP bytes | Median preparation | Range |
| --- | --- | --- | --- | --- |
| 1 | 7 | 11,672 | 1.81 ms | 1.39–2.77 ms |
| 180 | 365 | 157,458 | 45.30 ms | 40.01–49.12 ms |

These are Node producer measurements, not renderer or CI latency. The repeated-module preparation exceeds a frame budget, so worker ownership is required rather than a scheduling delay. Browser measurements below use the production desktop harness and separate interaction-thread snapshot, synchronous dispatch and delivery work from total asynchronous preparation. They are local observations, not timing assertions.

| Production fixture | Snapshot | Synchronous dispatch | Delivery | Total async preparation |
| --- | --- | --- | --- | --- |
| one-servo | 0.38 ms | 0.15 ms | 1.32 ms | 124.94 ms |
| 180-servos | 0.09 ms | 0.29 ms | 1.17 ms | 144.06 ms |

The production walkthrough delivered both ZIPs without download failures or app errors. The small scene includes selected source, fuse-holder and switch metadata. The repeated scene uses 180 servo modules without joints to isolate export work. Total preparation includes worker startup and asynchronous waiting, not continuous interaction-thread execution. These single browser samples do not establish a latency distribution or a whole-page frame profile.

The measurement source and logs remain in `scratch/electrical/measure.ts`, `final-measure.jsonl`, `interaction-measurements.json` and `final-capture.log`. [Build](../guide/build.md#electrical-projection) describes worker ownership and [test evidence](testing-build.md#electrical-projection) records validation limits.

## Routed-board reconciliation

A macOS host probe on Node v26.13.0 compared the ten generated boards with their KiCad 9.0.6 native-save derivatives. Each fixture received ten warmups and 100 measured comparisons. The compiled production comparison code ran in Node, without a renderer or worker transport. Inputs ranged from 7,034 to 11,898 UTF-8 bytes. Median times ranged from 0.223 to 0.496 ms, and per-fixture p95 ranged from 0.290 to 0.682 ms.

The comparison probe sampled JavaScript heap use after each comparison and forced GC before and after each fixture's measured group. Peak sampled heap increases ranged from 4,125,208 to 8,523,880 bytes. Post-GC heap differences ranged from -4,288 to 233,200 bytes. These include allocator and runtime effects and aren't an app retained-memory bound. Sources and results remain in `scratch/board-format-probe.ts` and `scratch/board-reconcile-measurements.jsonl`.

The completed dual-bus production fixture contains 5,444 imported UTF-8 bytes. A separate macOS Node probe warmed the production import and export preparation once, then measured ten iterations with real prepared geometry. Import includes decoding, geometry preparation, current electrical projection, source comparison and hashing. Export preparation repeats current geometry and projection and constructs the native request. These producers run in the electrical worker in the app.

| Phase | Median | Range |
| --- | --- | --- |
| Import preparation | 261.23 ms | 249.09–306.74 ms |
| Export preparation | 258.84 ms | 246.40–298.08 ms |

After ten iterations and forced GC, JavaScript heap use rose 319,824 bytes and RSS rose 4,636,672 bytes. These are process-level retained differences, not a maximum-input memory bound. Two subsequent native service jobs completed with zero retained active jobs. Their post-GC heap difference was -38,784 bytes and RSS difference was -1,294,336 bytes. Worker disposal releases its parsed trees and native reply. The scene intentionally retains the exact routed source and validation report.

The warm macOS native DRC, parity and fabrication run took 1,909.20 ms and produced 8,346 bytes across ten fabrication files. The full ZIP was 37,988 bytes. An earlier macOS acceptance run took 8,370.88 ms, while the Linux container acceptance run took 3,652.91 ms. These are individual observations on a shared host, not comparative platform benchmarks or timing assertions. Native version startup, file IO and process launches are included. A real CLI cancellation scheduled after 100 ms completed with an empty isolated directory in 107.15 ms total. Abort-to-cleanup took 2.30 ms. The probe awaited actual process close before inspecting the directory.

The reader bounds bytes, depth, nodes and atoms before reconciliation. Canonicalization sorts bounded trees without recursively escaping nested JSON strings. Parsing, geometry, hashing, ZIP creation and native processing stay off the interaction thread. The board preview key excludes routed text, rules and evidence, preserving prepared geometry when those records change. The native service bounds two concurrent jobs, worker heaps, process deadlines and output bytes. Source and logs remain in `scratch/measure-routed.ts`, `scratch/routed-measurements.jsonl` and `scratch/routed-measurements-errors.log`. The 37.29-second browser documentation capture exercises native import, export and stale findings, but does not establish a renderer frame profile or an 8 MiB latency bound.
