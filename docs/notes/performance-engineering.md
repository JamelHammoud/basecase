# Engineering calculations performance

Implementation: [Engineering calculations](../guide/build.md#performance-engineering-calculations). Shared requirements: [Performance](../guide/performance.md).

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

## Standing stability retains one result

The whole-app search found one lowest-margin stability selector, `utils/engineeringStability.ts`. Build and agent engineering reports both consume it through `runEngineering`. Ordinary calculations no longer build a result list, allocate a temporary singleton array per eligible body through `flatMap`, or sort the body results. Geometry measurement still runs for each eligible body. Equal margins keep the first body. A NaN margin falls back to the previous calculation and stable sort, including remeasurement, to preserve exceptional ordering.

`engineeringStability.test.ts` compares complete selection results with individually measured, sorted bodies for sizes zero through 79, reversed source order and later center-of-mass edits. It covers massless and contactless exclusions, negative and tied margins, source preservation and nonfinite coordinates. Existing `engineeringContacts.test.ts` and `engineeringWheelContacts.test.ts` cover full report rows and support geometry.

A scratch comparison loaded the previous implementation from git and matched complete results for 300 and 600 bodies. Every body used a 200 mm square foot, 100 g mass and center of mass `[(i * 37) % count, i + 1, 0]`. Instrumenting only the body-result sort measured one sort with 2,017 comparisons before for 300 bodies and one with 4,500 comparisons for 600. Both new runs made zero body-result sort calls. The replacement makes 299 and 599 margin comparisons respectively. Support-hull sorting is unchanged.

Measurements used scratch Vitest on macOS arm64 with Node v26.13.0. These are operation counts, not timings or complete Checks latency measurements. The logs are in `scratch/stability-counts.jsonl`. No timing assertion, quarantine or browser test was added. No controls, help steps or screenshot states changed. The existing Weight and center of mass and Build checks articles remain accurate.
