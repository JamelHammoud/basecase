# Image comparison performance

Implementation: [Image comparison](../guide/agent.md#performance-image-comparison). Shared requirements: [Performance](../guide/performance.md).

## Overlap alignment stops at a perfect match

Repository searches found two intersection-over-union alignment searches, camera rotation/scale in `viewFit.ts` and target translation in `targetFit.ts`. Both now stop at the first score of one. Intersection cannot exceed union, and ties keep the earlier candidate. Searches without a perfect match retain all candidates, including empty masks whose score stays zero.

`viewFitAlignment.test.ts` compares complete alignment records with an independent exhaustive search across generated masks, rotations, dimensions, empty inputs and source edits. New perfect-match cases count photo pixel reads. A 3 × 3 mask stops after its first scale candidate, and a 64 × 48 mask stops after its second. With ten requested rotations, these replace 30 candidate evaluations. The larger case reads 15,360 photo pixels instead of 187,392, including the unchanged moments scan.

`targetAlignment.test.ts` retains exhaustive-grid comparisons, centered and boundary-offset matches and first-offset ties. A scratch comparison of the previous and current target implementations matched all returned fields across 40 generated requests, comprising 20 identical masks and 20 edited models. Each identical pair evaluated 41 translation candidates instead of 81. Instrumented source copies and the comparison are in `scratch/perfectFit.test.ts` during implementation, with results in `scratch/perfect-fit-evidence.log`.

These are operation counts, not timings or a claim about complete camera-fit latency. No action, label, visible state or help instruction changes. The existing design-agent help article remains accurate and needs no screenshot update.

Scoped code validation passed formatting, lint, site copy, types and all 202 related tests across 33 files. Documentation validation is recorded in the session handoff.

## Target outline gaps accumulate directly

Repository searches found two symmetric outline-gap accumulators, in `targetFit.ts` and `viewFit.ts`. Camera-fit details already accumulate scalar distances directly. Target fitting now does the same, removing its temporary two-distance array and iteration for each scanned grid cell. Both edge predicates and distance transforms remain unchanged. The target contribution still precedes the model contribution, retaining exact summation order, sample counts and maxima.

For a W × H target-fit grid, this removes W(H − 2) temporary pairs. A 256 × 256 grid removes 65,024 arrays and 130,048 pair-entry visits. These are operation counts derived from the loop, without timing measurements or a claim about complete comparison latency. The distance buffers and grid traversal remain necessary.

Existing `targetDistance.test.ts` compares exact mean and maximum target gaps with the previous calculation on 20 generated target/model comparisons. It also checks camera contour gaps. Existing target-fit tests cover matching and different rounded outlines at true and inferred scales. No action, label or visible state changes. The help articles describing design-agent comparisons remain accurate and need no replacement screenshots.

## Photo mask area rejections skip border contact

Whole-app search found one mask acceptance validator, `utils/photoMask.ts`'s `checkMask`. Both photo reference masks in `silhouette.ts` and sketch-target requests in `workspace/agentTargetRequest.ts` use it. Border measurement now follows the occupied-area refusals. Masks below 1% or above 60% occupancy never need border measurements. Exactly 1% and 60% still proceed to border checks. Refusal priority, messages, cut-edge flags and accepted outputs stay unchanged.

`photoMask.test.ts` instruments numeric border reads separately from native area iteration. On a 20 × 20 mask, empty, three-pixel, 241-pixel and full-mask fixtures now make zero border reads instead of 80. The four-pixel and 240-pixel boundary fixtures retain all 80 border reads. The dense fixtures also touch the frame, verifying that area refusal retains priority. Tests check occupancy, refusal category, accepted cut flags and unchanged source bytes. These are operation counts, without timing thresholds or a claim about complete photo-tool latency. The full area scan remains unchanged. No timeout, retry or quarantine changes.

The photo attachment instructions in [Requests that get good results](../../site/content/help/requests-that-get-good-results.md) still describe the same inputs and comparison behavior. This changes no action, label or visible state, so the article and screenshots remain unchanged.

Scoped validation passed formatting, lint, docs, site copy, types and all 69 related tests across ten files. The log is `scratch/refine-check.log`. Copy diff reports net zero. Preflight also flagged [The design agent](../../site/content/help/the-design-agent.md) because it covers the owning guide. Rechecked its photo inputs, catalog selection, Checks, scene history and user controls against this change. No claim, label or visible state changes, and the article has no screenshot to replace, so it remains unchanged.

Pull request #1700's Ubuntu unit job on 17 November 2026 exhausted its fifteen-minute job budget during checkout. The initial shallow fetch started at 20:27:54 UTC and was cancelled at 20:42:52 UTC. Dependency installation and tests never started. The aggregate Check failed because this required job was cancelled. This log provides no evidence of a slow or failing test, so the revision keeps the implementation, tests, workflow and timeouts unchanged. Local revision validation is recorded in `scratch/revise-1700-check.log`. The hosted checkout failure remains unverified locally.

## Image outlines share fixed sampling directions

Repository searches found one radial image-outline sampler and one twelve-point detected-hole contour builder, both in `imagePixelAnalysis.ts`. Both now read one table of 48 directions prepared at module initialization. Hole contours use every fourth entry, whose angle matches the previous twelve-sample calculation. Output point arrays remain independent of the table.

The existing image-analysis tests cover color and alpha boundaries, source preservation, enclosed holes, open background channels, detected centers and dimensions. Their two-hole case now checks every rounded hole coordinate. A scratch comparison matched complete previous and current analysis results for 100 generated images across 40, 48 and 56-pixel square grids, varying hole radii, foreground colors and image aspects.

After module initialization, those two-hole fixtures made 144 sine and cosine calls per image before this change and zero afterward. The shared table costs 96 calls once per module load. The scratch probe counts calls separately from result assertions, with results in `scratch/imageDirections-results.json` during implementation. These are operation counts, without timing assertions or a claim about complete image-import latency. No interaction, screen state or help instructions change.

## Photo trimming retains column mass

Repository searches found one column-mass calculation for photo trimming, in `photoMask.ts`, called by the shared `referenceMask` pipeline in `silhouette.ts`. Column heights now accumulate their area and horizontal first moment as they are emitted. The trim fraction reuses that area. The height list remains necessary for selecting thin columns, and each accepted trim still copies the source pixels.

For a nonempty mask spanning W columns, the previous calculation visited 3W height entries through three reductions after measuring the columns. The current calculation visits none through reductions. At widths 300 and 1568 this removes 900 and 4704 height-entry visits respectively. These are counts derived from the loops, without timing measurements or a claim about complete photo-tool latency. The full pixel scan and trim writes are unchanged.

`photoTrim.test.ts` compares complete outputs with the previous calculation across 720 mask and aspect combinations. It covers narrow dimensions, empty columns, asymmetric and nonbinary masks, offset buffer views, invalid aspects, source preservation, input edits and independent output ownership. Existing `photoMask.test.ts` checks the resulting silhouette profile after background-sliver removal. The interaction and visible output stay unchanged, so no help article or browser walkthrough changes.

## Photo foreground thresholds compare squared distances

Repository searches found two RGB-distance threshold paths: `imagePixelAnalysis.ts` foreground classification and `silhouette.ts` background flooding. Both now compare the squared distance with the squared cutoff. The silhouette border-spread calculation retains `Math.hypot` because it averages actual distances. RGB channels are byte values, and corner-average background channels have quarter-byte precision.

`imagePixelAnalysis.test.ts` checks strict color-distance and alpha cutoffs through complete image analysis, including transparent backgrounds and unchanged input bytes. Existing `silhouette.test.ts` checks its strict distance cutoff, independent channel variation, spread boundaries, border weighting and narrow images. A scratch comparison matched complete analysis results and silhouette masks on 600 seeded images with sizes from 8 × 8 to 32 × 32. The images include fractional corner averages, transparent backgrounds, partial alpha and both plain and busy borders.

On uniform opaque images, a scratch spy counted calls to `Math.hypot` across each complete pipeline:

| Image | Analysis before | Analysis after | Silhouette before | Silhouette after |
| --- | --- | --- | --- | --- |
| 128 × 128 | 16,397 | 13 | 16,896 | 512 |
| 256 × 256 | 65,549 | 13 | 66,560 | 1,024 |

The remaining analysis calls belong to outline simplification. The remaining silhouette calls measure border spread. These are operation counts, without a timing assertion or a claim about complete photo-tool latency. The scratch counter initially omitted outline simplification's 13 calls from its expected totals. Correcting that expectation left the measured reduction at one call per classified pixel. The comparison lives in `scratch/photoThresholds.test.ts` during implementation and is not committed.

## Traced contours avoid temporary row lists

`outlineTrace.ts` removes two mapped edge lists, one reversed row copy and ten pairs of sliced rows and mapped widths per nonempty trace. That removes 23 temporary arrays containing five times the occupied-row count in total entries. Ring points and sampling buffers remain owned by each call.

`outlineTrace.test.ts` checks single-row winding and caps with exact coordinates, scale, offset, sparse-row bands, source preservation and independent results. A scratch comparison matched complete outputs against the previous implementation on 1,000 generated masks. Widths ranged from 1 to 29 pixels and heights from 1 to 43, with empty rows, nonbinary pixels, four scales, four sample counts and seven offsets.

On macOS arm64, Apple M5 Pro and Node 26.13.0, a filled 40 × 600 mask sampled at 24 points took median times of 0.03058 ms before and 0.02618 ms after. Five warmup batches preceded 21 alternating measured batches of 1,000 traces. The temporary arrays held 3,000 entries per call before the change. These shared-host measurements cover tracing alone, without a CI timing assertion or a claim about complete photo-tool time. The throwaway comparison is `scratch/outlineComparison.test.ts` during implementation and isn't committed.

## Outline resampling emits rounded points directly

`outlineTrace.ts` now rounds each interpolated coordinate when it emits the sampled point. It removes the temporary unrounded point list and the final mapping pass. For N samples, this removes one outer array and N coordinate-pair arrays, plus N callback invocations. At the tool's 12 to 32 samples, that removes 13 to 33 arrays per trace. The contour ring and cumulative segment lengths remain operation-local allocations. These are allocation counts derived from the code, without timing measurements or a claim about complete tracing latency.

Repository searches covered resampling in outline tracing, Sketch linkage strokes, recorded joints, Case base traces and try-search signatures. Photo-outline tracing is the only path that rounds resampled millimeter coordinate pairs. Other resamplers produce unrounded coordinates or scalar signatures with distinct precision requirements.

The existing `outlineTrace.test.ts` checks exact single-row points, winding, caps, scale, offset, sparse-row bands and source preservation. A scratch comparison matched 3,600 complete results against the previous implementation across 120 generated masks. It used offset buffer views, nonbinary pixels, empty masks, six sample counts from zero to 32, five scales including zero and negative values, and positive and negative offsets. Source storage stayed unchanged. The throwaway comparison is `scratch/outline-rounding.test.ts` during implementation. No interaction or visible output changes, so no help article or browser walkthrough changes.

## Outline distances propagate one minimum per cell

`targetDistance.test.ts` compares every binary pattern on nine grids through twelve cells, 160 generated masks and later edits, long diagonals, source views, independent outputs and both comparison paths. On empty 300 × 10 and 600 × 10 masks, distance-buffer reads fall from 38,144 and 76,544 to 23,840 and 47,840, with no writes added. These are operation counts without timing assertions or a claim about complete comparison time.

## Photo outlines simplify through index ranges

`simplifyPolygon.test.ts` compares 1,800 open, closed and reflected outline queries with the previous calculation, including frozen inputs, ties, repeated points and later edits. Its 48-ray fixture removes 75 slice calls and 25 concatenations. A scratch comparison matched 120 complete photo analyses at three raster sizes. These are operation counts and output comparisons, without timing assertions or a claim about complete attachment time.

## Photo outline ranges prepare one baseline

`simplifyPolygon.ts` calculates each range's endpoint direction and squared length once, instead of recalculating them for each interior point. The existing `simplifyPolygon.test.ts` parity coverage checks the previous recursive calculation across 1,800 queries and boundary cases. Repository searches found no other point-list simplifier. Sketch's similarly named distance helper evaluates constraints rather than simplifying outlines.

On macOS arm64 with Node 26.13.0, the existing 48-ray, seed-3 outline fixture at tolerance 0.022 matched the previous result. Proxy-counted coordinate reads fell from 2,428 to 1,656. After five warmup batches, 21 alternating measured batches of 5,000 simplifications gave median times of 0.01262 ms before and 0.00973 ms after. The benchmark compared the pre-change range implementation with the new implementation. These shared-host measurements cover simplification alone, without a CI timing assertion or a claim about complete photo-tool time. The throwaway benchmark lives in `scratch/outline-bench.ts` during implementation and isn't committed.

## Mask bounds and row extents share one scan

`maskRows.test.ts` checks direct measurements, sparse masks, holes, nonbinary pixels, narrow and empty images, edits, source preservation and independent results. Its filled 40 × 300 and 40 × 600 profile and tracing fixtures read 12,000 and 24,000 pixels instead of 24,000 and 48,000. Scratch comparisons matched 3,200 band/profile results, 400 traced outlines and 400 complete target fits exactly against the previous implementation. On shared macOS arm64 hardware with Node 26.13.0, ten-profile batches on a seeded 600 × 600 mask took medians of 20.33 ms before and 9.17 ms after, across 30 alternating measurements after five warmups. These measure profile calculation alone, without CI timing assertions or a claim about complete photo-tool time.

## Camera alignment prepares masks once

`viewFitAlignment.test.ts` compares fresh-raster scoring on 60 seeded mask pairs, including source edits, empty masks, ties and result ownership. On empty 64 × 48 and 128 × 96 masks with 27 candidates, model pixel reads fall from 86,016 and 344,064 to 3,072 and 12,288. These are operation counts for mask preparation, without timing assertions or a claim about complete camera fitting time.

## Image floods queue each open pixel once

`pixelFlood.test.ts`, `imagePixelAnalysis.test.ts` and `targetFit.test.ts` check boundaries, enclosed regions, measurements and traversal counts. A blank 128 × 96 photo took 49,152 stack removals before this change and 12,288 after it. This is an operation count, not a wall-clock measurement.

## Target alignment reuses one raster

`targetAlignment.test.ts` compares exhaustive resampling across aspect ratios, scales, all nine combinations of offsets −4, 0 and 4, unchanged inputs and first-offset ties. On its 240 × 240 fixture, target data-property reads fall from 4,665,601 to 57,601, including the bounds scan's one property read. These are operation counts, without timing assertions.

## Comparison overlays reuse four colors

`targetOverlay.test.ts` compares every byte with the previous renderer across six scales, all four colors, nonbinary masks, changed inputs and independent results. Its 300- and 600-cell fixtures at 3× scale remove 5,400 and 10,800 temporary color arrays respectively. The four palette arrays are shared across renders, while each result owns its output buffer. These are allocation counts, without timing assertions or a claim about complete comparison time.

## Photo border medians use fixed histograms

`silhouette.test.ts` checks those boundaries, RGB extremes, enclosed background, narrow images and source preservation. A scratch comparison matched the previous masks and refusal results on 600 seeded images. On macOS with Node 26.13.0, rejecting one seeded 900 × 900 busy image took a median of 2.23 ms before and 0.13 ms after, over 25 alternating measurements after five warmups per implementation. This measures the busy-background refusal path, without a CI timing assertion or a claim about full photo-tool latency.

## Photo regions copy contiguous rows

`cropMask.test.ts` compares the previous pixel loop across 90 regions on five mask shapes, including fractional bounds, clipped and reversed regions, nonfinite bounds, zero dimensions, nonbinary pixels and offset buffer views. It also checks incomplete buffers, unchanged sources, edits and independent outputs. Existing `outlineTrace.test.ts` exercises tracing through the cropper. Photo scaling now measures its region directly, as recorded below.

On macOS arm64 with Node 26.13.0, a scratch comparison cropped the middle 80% of each axis of deterministic nonbinary masks. Each implementation had three warmup batches and eleven alternating measured batches of twenty crops. Complete results matched before timing. Median milliseconds per crop were:

| Mask | Before | After |
| --- | --- | --- |
| 300 × 400 | 0.1092 | 0.0702 |
| 1568 × 1568 | 1.9787 | 0.2231 |

The cropper replaces per-pixel JavaScript copies with one native typed-array copy and one temporary buffer view per selected row. It still allocates a zeroed output the size of the source buffer. These local shared-host measurements cover cropping alone, without a CI timing threshold or a claim about complete photo-tool time.

The initial parity fixture compared 90 crops at 300 × 400 through recursive assertions and exceeded the five-second test limit at 7.19 seconds. The retained suite uses a 31 × 43 mask for that shape, preserving all region cases. Larger masks stay in the on-demand benchmark. No timeout was raised.

## Corner-radius floods retain pixel indices

Repository searches found one inward corner flood, shared by standalone `cornerRadii` and both masks in `fitTarget`. It now queues pixel indices and tests fixed exclusive boundaries before offering inward neighbors. The visited set, neighbor order, radius formula and pixel classification stay unchanged. Empty masks and zero reach still return zero radii.

`targetCornerRadii.test.ts` compares an independent row-reachability calculation on 96 generated masks across six shapes from 1 × 1 to 31 × 23. It covers all corner directions, nonbinary pixels, offset buffer views, input preservation, empty masks and edits to a single occupied pixel. Existing `targetFit.test.ts` checks rounded rectangles, complete target-fit metrics and exactly one queue removal per open corner pixel. A scratch comparison also matched 400 complete corner measurements against the previous implementation.

On macOS arm64, Apple M5 Pro and Node 26.13.0, a cross-shaped mask used a seven-pixel central bar on each axis. Counting coordinate arrays passed to the stack and timing complete `cornerRadii` calls gave:

| Square mask | Coordinate arrays before | After | Median ms before | After |
| --- | --- | --- | --- | --- |
| 64 × 64 | 3,249 | 0 | 0.10347 | 0.08112 |
| 128 × 128 | 14,641 | 0 | 0.50966 | 0.42843 |
| 256 × 256 | 62,001 | 0 | 2.92770 | 2.02576 |

Four warmup batches preceded fifteen alternating measured batches of thirty calls per implementation. Allocation counting ran separately from timing. The scalar stack and visited set remain allocated per corner. These shared-host timings measure corner-radius estimation alone, without a CI timing assertion or a claim about complete comparison time. The temporary comparison and output live in `scratch/cornerBench.test.ts` and `scratch/cornerBench.json` during implementation and are not committed.


## Photo scaling measures regional bounds directly

Repository searches found one `maskBounds(cropMask(...))` path, in `photoScale.ts`. The shared bounds helper now accepts inclusive pixel limits. Photo scaling rounds its normalized region as the cropper does, then measures foreground directly in the source. It removes one full-size Uint8 buffer and replaces the cropped full-image bounds scan with a regional scan. Outline tracing still needs cropped pixels and retains its cropper.

`maskBounds.test.ts` compares 130 regional measurements against cropped masks across four shapes and an incomplete buffer. Cases include empty and nonbinary masks, clipping, reversed and nonfinite regions, offset views and source edits. Direct assertions cover inclusive single-column limits, full-mask bounds and the empty-region sentinel. `photoScale.test.ts` covers both axes, empty subjects and whole-robot dimensions from a known servo width.

On macOS arm64, Apple M5 Pro and Node 26.13.0, a central rectangular subject occupied half of each image axis. The selection covered the middle 20% of each axis. Complete scale results matched the previous crop-based implementation. Four warmup batches preceded fifteen alternating measured batches of twenty complete scale calls per implementation.

| Image | Removed buffer bytes per call | Regional pixels | Median ms before | After |
| --- | --- | --- | --- | --- |
| 300 × 400 | 120,000 | 4,800 | 0.25526 | 0.17837 |
| 1568 × 1568 | 2,458,624 | 98,596 | 4.83568 | 3.52247 |

Both versions retain the whole-subject scan. The baseline uses the previous scale implementation and cropper with the current full-mask bounds helper. These shared-host measurements cover scale calculation alone, without CI timing assertions or a claim about complete photo-tool latency. The temporary comparison and results live in `scratch/photoScaleBench.mjs` and `scratch/photoScaleBench.json` during implementation.

## Binary mask bounds stop at row edges

Repository searches found two shared binary-mask extent scans, `maskRows` and `maskBounds`, plus annotation `maskBox` with its own per-pixel box calculation. For integer horizontal starts, all three now search from each row's ends and skip the interior once both edges are known. Fractional horizontal starts retain forward sampling because reverse subtraction changes floating-point pixel addresses and coordinates. Annotation boxes reuse `maskBounds` after their existing dimension validation. Foreground color totals, area calculations and RGBA thumbnail alpha bounds have different input or measurement requirements and keep their existing scans.

`maskEdges.test.ts` compares all 5,050 binary masks across widths one through four and heights one through three with an independent full scan. It checks row records, full bounds and annotation boxes. Additional cases cover regional limits, fractional sampling, nonbinary pixels, incomplete buffer views, later edits and unchanged source bytes. Existing regional tests retain clipping, reversed and nonfinite selections. Existing row tests retain profile, tracing and target-fit coverage.

Proxy-counted reads for each of the three extent consumers on 300 × 300 masks are:

| Foreground | Previous pixel reads | Current pixel reads |
| --- | --- | --- |
| Filled | 90,000 | 600 |
| One occupied column | 90,000 | 90,000 |
| Empty | 90,000 | 90,000 |

The filled 40 × 300 and 40 × 600 profile and trace fixtures now read 600 and 1,200 pixels, replacing the 12,000 and 24,000 reads recorded for the earlier shared-scan implementation. Searches allocate no intermediate mask or per-row result. These are operation counts, without a timing assertion or a claim about complete photo-tool or labeling latency.

Implementation-session validation used `check:changed` on the six code and test files and the three owning documentation files. Formatting, lint, documentation, site copy and types passed. The last implementation-session related run passed 730 tests across 120 files. The new exhaustive and read-count tests passed.

That run failed three unchanged tests. `deleteTone.test.ts` reports missing danger variants on Delete buttons in `BoardHoleFields.tsx`, `BoardKeepoutFields.tsx` and `BoardPlacementFields.tsx`, which are unchanged from the starting revision. `targetDistance.test.ts` timed out in its generated Float32 distance comparison, and the 1,000-image case in `evidenceResources.test.ts` timed out while restoring frozen evidence. Both hit their existing 5,000 ms deadline and passed in the earlier related run. No deadline, retry or quarantine was changed. The implementation-session log is `scratch/mask-check.log`. Browser tests were left to CI because this changes no interaction or visible state.

Review reproduced two decimal-region regressions against the independent full scan. With width 6, horizontal start 0.4, vertical start 0.1 and foreground pixels at indices 1 and 2, reverse subtraction missed the second pixel and returned x1 = 0.4 instead of 1.4. At width 4 with both starts at 0.2, it returned 1.2000000000000002 instead of 1.2. The two regression cases in `maskEdges.test.ts` now exercise the retained forward sampling for fractional horizontal starts. Integer masks keep the endpoint read counts above. The failing reproduction is recorded in `scratch/mask-fractional-regression.log` during review.

Review validation in `scratch/mask-review-check.log` passed formatting, lint, docs, site copy and types. Related tests passed 732 cases across 120 files, including both decimal regressions, and reproduced the same three unchanged failures described above. No test deadline, assertion or quarantine was relaxed.


## Busy photo borders stop at the decisive sample

Repository searches found one border-spread rejection, in `silhouette.ts`, shared by photo reference masks and profiles. The median still reads every sample. Spread accumulation stops when a partial sum alone would fail the original full-border average. Distances are nonnegative. The early comparison checks both the total allowance and the original division, preserving floating-point rounding at the strict cutoff. Accepted borders retain their original accumulation order and complete scan.

`silhouette.test.ts` compares decisions with an independent complete scan for 60 images across widths 1, 2, 7 and 32, heights 1, 2 and 9, and red-channel variations 0, 12, 28, 29 and 255. Existing tests cover exact spread 14, corner weighting, channel medians, subject masks and unchanged source bytes.

On a 100 × 100 image split horizontally between red-channel values 0 and 255, distance calls fall from 400 to 43. A plain image keeps all 400 distance calls. These are operation counts, not timings or a claim about complete photo-tool latency. Border construction, median preparation and flood traversal are unchanged. There is no new interaction or visible state, so help screenshots and browser walkthroughs are unchanged.

Scoped validation passed formatting, lint, documentation, types and all 51 related tests across seven files. The command failed only the site copy check on the unchanged `2026-11-17-export-electronics-with-a-robot-kit.md` article’s “does not” at line 15. The same text is present in the starting revision. No unrelated article was edited. The check log is `scratch/refine-check.log`. Copy diff reports zero additions, changes and removals.

## Thin image subjects skip hole floods

Repository searches found one image-analysis hole detector, `imagePixelAnalysis.ts`, reached through `imageTo3DAnalyzer.ts`. It previously allocated a grid-sized visited buffer, built border seeds and flooded the outside even when no pixel could satisfy its later interior loops. It now checks the foreground bounds first. A span below two pixels along either axis means there is no interior candidate. Empty masks take this path too. Ordinary two-dimensional subjects retain the complete outside and hole floods, including filled subjects whose interior must still be classified.

`imagePixelAnalysis.test.ts` covers empty foreground, one point, horizontal and vertical lines and two-pixel bands. It checks empty hole outputs, unchanged source bytes and zero stack removals. A four-pixel enclosed hole checks the minimum accepted hole area. Existing cases retain open-channel, two-hole, color, alpha, dimensions and complete hole-contour coverage. A scratch comparison matched complete old and new analysis results on 240 generated images from 8 × 8 to 36 × 36, including thin bands, empty images and ordinary scattered foreground.

On a 128 × 128 image containing a vertical 100-pixel foreground line, stack removals fall from 16,284 to zero. The change also removes one 16,384-byte visited buffer and 512 border-seed entries for that image. These are operation and storage counts, without timings or a claim about complete image-import latency. The foreground scan, outline calculation and result ownership remain unchanged. The temporary comparison lives in `scratch/thinFlood.test.ts` during implementation. No action, label, visible state or help instruction changes, so no screenshot changes are needed.

Scoped validation passed formatting, lint, documentation, site copy, types and all 21 related tests across four files. Copy diff reports net zero. Preflight flagged the unchanged [The design agent](../../site/content/help/the-design-agent.md) because it covers the owning guide. Its photo inputs, scene edits, Checks and controls still describe the same behavior, and it has no screenshots to replace. The article remains unchanged. Validation logs and comparison fixtures stay in `scratch/`.
