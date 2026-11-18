# Vision training performance

Implementation: [Vision training](../guide/cases.md#performance-vision-training). Shared requirements: [Performance](../guide/performance.md).

## Frozen condition rescoring

`conditionResources.test.ts` uses generated 2 by 2 JPEGs, reviewed rectangular annotations and retained predictions. One warmup precedes one measured comparison at each size. Candidate and incumbent share the same correct predictions in this resource fixture. Both pass through frozen-content verification, annotation restoration and the existing task scorer. No inference runs. The helper returns support and metrics, without retaining another evidence archive.

The following observations were recorded on 17 November 2026 with Node 26.13.0, macOS 27.0.1 and an arm64 Apple M5 Pro with 24 GiB RAM. Other loop work and related tests were active. They are not production-browser measurements or timing assertions.

| Real test images | Rescore both reports | Evidence bytes per model | Returned result bytes | Heap-used difference |
| --- | --- | --- | --- | --- |
| 4 | 1.723 ms | 2.526 ms | 0.216 ms | 638 | 1,665 |
| 1,000 | 85.948 ms | 122.683 ms | 2.670 ms | 8,420 | 17,241 |

Heap-used difference is the V8 heap-used difference after collection, with source content and reports already retained. It includes the returned result and runtime caches. The negative 1,000-image difference reflects other reclaimed heap, so retained allocation at that size is inconclusive. These differences are not peak memory. They exclude image buffers, workers, WASM, GPU allocations and other processes. One observation per size does not establish throughput or a scaling ratio. Host contention and collection make timings and heap differences variable. The fixture asserts complete support, both scores and a 64 KiB returned-output ceiling for its two-class data, without asserting time or heap use.

The helper limits selected work before loading content to 32 million image and predicted-mask pixels, 20,000 reviewed objects and 2 million annotation/prediction pairs. Stored archives and their expanded entries each share a 64 MiB byte budget. Expanded entry lengths are charged before allocation. Dimensions must match retained predictions before another image is kept. Existing per-image archive, evidence and real-test limits remain active. These observations cover helper execution only. The shipped presentation retains one verified comparison in the existing evaluation worker. Group requests send its identity instead of cloning both reports again, with one frozen-content request at a time through a MessagePort. Cancellation releases an outstanding request and revokes presentation. These resource observations exclude that transport and browser rendering. The documentation capture records workflow correctness separately, without a browser timing claim.

## Saved image splits partition frames once

`src/vision/imageSplit.ts` removes three filtered frame lists and two full frame traversals from saved split partitioning. Each frame's saved assignment is read once, and its id goes directly into its destination list. Searching the app found this repeated saved-partition construction only in this shared helper. COCO, YOLO and image metadata exports all use it. Generated splits and their seeded ordering are unchanged.

On 300- and 600-frame fixtures, assignment reads fall from 900 and 1,800 to 300 and 600. These are operation counts against the previous three-filter calculation, asserted by `imageSplit.test.ts`, without timing assertions or an end-to-end export speed claim. The test also covers empty and singleton sets, source ordering, saved assignments overriding per-frame declarations, missing assignments, subsequent edits, source preservation, independent result lists and complete COCO and YOLO round trips. No browser behavior, copy, timeout or quarantine changes.

## Object evaluation shares annotation geometry across predictions

`metricsOverlaps.test.ts` compares complete detection and segmentation reports across 200 generated fixtures, frozen inputs, later edits and malformed masks. With three annotations and 300 or 600 predictions across two classes, box preparations and mask decodes fall from 900 and 1,800 to six each. These are operation counts without timing assertions or a claim about complete evaluation time.

## Classification evaluation accumulates confusion counts once

`metricsClassification.test.ts` compares complete reports across 120 generated fixtures, plus missing predictions, unsupported classes, repeated annotations, rejected labels, frozen inputs and subsequent edits. On 300-image, 300-class and 600-image, 600-class fixtures, declared-class property reads fall from 360,600 and 1,441,200 to 600 and 1,200. These are operation counts without timing assertions or a claim about complete training or evaluation time.

## Keypoint evaluation prepares landmark indices once

`metricsKeypointLookup.test.ts` compares 80 generated fixtures with the previous name lookup, checks source preservation, later edits, default tolerance and exact boundaries. Its 300- and 600-object fixtures each read the three classes' name lists six times in total, including the per-class failure-rate inputs. Previously, each object rebuilt the union from all three lists. These are operation counts without timing assertions or a claim about complete training time.

## Vision average precision shares a backward walk across recall thresholds

`metricsPrecision.test.ts` compares every ranking through eight detections and 80 generated longer rankings against the previous calculation, plus recall boundaries, missing ground truth, frozen inputs and subsequent edits. Its 300- and 600-detection fixtures reduce precision comparisons from 15,200 and 30,400 to 300 and 600. These are operation counts without timing assertions or a claim about complete model-comparison time.

## Image imports index annotation classes

`sourceClasses.test.ts` compares 80 mixed-label sequences against ordered scans and checks duplicate matches, edits, independent imports, malformed labels and the class cap. `classResolution.test.ts` checks sparse ids, named keypoints, VOC image order and Parquet rows and shards. A scratch comparison matched 120 complete imported frame sets against the previous readers. On 300- and 600-class fixtures with 3,000 lookups each by id, name and inferred id, source-property reads fell from 1,354,500 and 2,704,500 to 600 and 1,200. These are operation counts and complete-output comparisons, without timing assertions or a claim about complete import time.

## Image imports append retained keypoints directly

Both keypoint readers previously created a coordinate slice, a visibility list and an empty or singleton result array for each point. The shared COCO and image Parquet reader used `flatMap`. YOLO also retained an `Array.from` staging list before flattening. Both now append retained point objects directly into their output lists. Numeric input validation still runs before point decoding, including on discarded points.

For the four-point fixture, the source code removes twelve temporary per-point arrays from each reader and one additional staging list from YOLO. These are structural allocation counts, not heap measurements or import timings. Numeric parsing, mask rasterization and final point objects still allocate as before. No end-to-end speed claim follows from these counts.

`keypointReaders.test.ts` checks complete ordered point results for all 81 four-point visibility combinations through the YOLO reader and the shared COCO and Parquet point reader. It also checks two-coordinate YOLO points, independent imports, source preservation, missing labels, malformed lengths, nonfinite and unsupported visibility, and the different coordinate rules for absent points. Existing `readImageSource.test.ts` and `classResolution.test.ts` retain full source-reader and package round-trip coverage. This changes no user action, screen, copy, timeout or quarantine.

## Frozen prediction evidence bounds

Evidence is prepared in the existing evaluation worker from predictions already produced by the inference passes. Per-image object diagnostics reuse aggregate match arrays at each recorded threshold. Classification diagnostics use the existing top-one pass. Predicted masks use RLE, with a preflight scan refusing more than 131,072 runs before constructing the encoding. JPEGs, depth and ground-truth masks remain in frozen content storage.

Bounds are 1,000 real test images and 3 MiB of serialized evidence per model. Frame-count refusal happens before fitting and inference. Evidence creation checks running serialized size and never truncates a report. Ordinary storage independently retains its 8 MiB complete-run limit. Source navigation records only hashes of recording and camera-video bytes. It accepts recordings and individual videos through 64 MiB and at most four camera videos, without copying these assets into training runs.

Initial comparison verifies both evidence digests and prepares the comparison index in the evaluation worker. Only pairs of row indices return to the UI, which references the already-loaded reports. The renderer does not repeat evidence serialization or geometry validation. Selecting a frame loads one frozen archive, prepares its display geometry in that worker and transfers restored image/depth buffers back. Closing or changing selection ignores late replies. Scene and dataset changes remount inspection, and the shared image component revokes its JPEG URL.

### Measurements on 16 November 2026

The host was an arm64 Apple M5 Pro with 24 GiB RAM, macOS 27.0.1 and Node 26.13.0. Other loop work remained active. These are observations, not timing assertions or physical-model transfer evidence.

`evidenceResources.test.ts` generates complete frozen 2 by 2 JPEG fixtures at 4 and 1,000 images. It compares existing object matching without diagnostics against the same matching plus diagnostics, RLE evidence encoding and its SHA-256 digest. One warmup precedes five paired observations. The table gives medians. Added time is the median paired difference, rather than subtraction of the two displayed medians. The test checks complete diagnostics, unchanged aggregate reports, the byte bound and restoration of exactly one frozen image.

| Real test images | Matching alone | Matching and evidence | Added work | Evidence bytes per model | Retained evidence heap |
| --- | --- | --- | --- | --- | --- |
| 4 | 0.100 ms | 2.360 ms | 2.269 ms | 2,663 | 8,240 bytes |
| 1,000 | 6.787 ms | 21.081 ms | 13.582 ms | 604,145 | 1,310,800 bytes |

Heap-used difference is the V8 heap-used difference after collection, with source images and predictions already retained. It includes diagnostics and evidence objects. It excludes image buffers, WASM, GPU memory and other processes. Small heap differences and timings are sensitive to collection and concurrent host activity. Verifying one model's evidence and preparing its first frozen display image took 90.717 ms and 10.566 ms respectively, without IPC, storage latency or rendering.

The browser resource capture used the actual Library entry, controlled training completion with real inference, ordinary persistence, both-model verification and first-image selection. It asserted 4 and 1,000 retained test-image rows. These fixtures have one class, unlike the two-class worker fixtures above, so their serialized sizes differ. The local harness served the development app because production bundles were absent. These are not production-bundle performance claims.

| Real test images | Open comparison and first image | Evidence bytes per model | Added page heap after collection |
| --- | --- | --- | --- |
| 4 | 872 ms | 2,377 | 593,180 bytes |
| 1,000 | 930 ms | 533,143 | 7,795,800 bytes |

Each browser row is one successful observation. The interval includes the command to open inspection, class and finding selection, image selection and browser-protocol round trips. It excludes fitting, evaluation and app boot. Page heap includes the inspection list and display, and excludes workers and GPU memory. The results do not establish that the larger dataset opens faster or provide a throughput comparison.

An earlier capped observation repeated validation in the renderer. The final implementation moves that work into the worker and returns row indices. Invalid one-image fixtures and the separate pre-boot navigation failure are excluded, as recorded in [vision test evidence](testing-vision.md#frozen-comparison-inspection). Detailed local measurements remain in the task's scratch resource JSON and logs. CI runs correctness coverage without timing thresholds, retries or increased deadlines.

## YOLO rows place coordinates directly

Whole-app searches for YOLO label parsing and front-removal operations found one shared annotation reader in `vision/import/yoloRead.ts`. Detection boxes, segmentation polygons and pose keypoints all use it. The reader now parses the class id from the first token and fills the coordinate array at its final indices. It removes one array-front removal per annotation and avoids initially storing the class id in that array. String tokenization and numeric validation still visit every token in order. Geometry conversion and masks are unchanged.

On November 17, 2026, a scratch comparison matched complete reader outputs or refusal messages for 131 fixtures against the preceding implementation. Each fixture contained two annotation rows with surrounding whitespace and blank lines. Coverage included both classes, detection boxes, polygons, two- and three-coordinate keypoints, every visibility value, missing coordinates, negative values, fractional and missing class ids, NaN and infinity. Existing `readImageSource.test.ts`, `readerFidelity.test.ts` and `keypointReaders.test.ts` retain committed pipeline coverage. No timeout, retry or quarantine changes apply.

A numeric-preparation probe used Node 26.13.0 on macOS arm64. It compared the previous numeric map and shift with the new direct fill, including the production numeric validator. Three warmup pairs preceded nine alternating measured pairs. For 4 coordinates and 250,000 rows, median batch time changed from 27.134 to 20.861 ms. For 51 coordinates and 19,607 rows, it changed from 21.798 to 21.229 ms. For 4,096 coordinates and 500 rows, it changed from 43.375 to 43.233 ms. Outputs and checksums matched. These local timings exclude tokenization, image decoding, rasterization, persistence and UI work. The long-row difference is small and establishes no complete-import speedup. Scripts and raw results remain in `scratch/yolo-row-parity.test.ts`, `scratch/yolo-row-bench.test.ts` and `scratch/yolo-row-bench.json` in the implementation session.

Rechecked [Import an image dataset](../../site/content/help/import-an-image-dataset.md). Supported YOLO boxes, polygons and pose points, split declarations, import steps and limits remain accurate. The article now explains the preserved class-ID prefix and zero-based YAML class mapping. No user action or visible state changes, so the existing screenshots remain accurate.

Focused validation passed formatting, ESLint, documentation links, site copy for 330 pages, types and all 148 related tests across 19 files. Copy accounting reports zero added, changed or removed strings. Logs are `scratch/check-yolo-row.log` and `scratch/yolo-row-parity.log`. The covered-article preflight reminder prompted a second inspection. Local import, Roboflow and Hugging Face steps, labels, limits and all four existing captures describe untouched paths and states. The article adds the class-ID format rule preserved by this parser refinement. It introduces no UI strings.

## Declared operating requirements

Implementation: [Cases](../guide/cases.md#declared-vision-operating-requirements). `requirementEvaluation.ts` reuses evaluated rows and the ordinary task scorers inside the existing evaluation worker. Requirements sharing a group reuse one complete group score. No additional model inference, content access or JPEG decoding occurs. Group membership is stored as real-test indices, while the existing full snapshot preserves all members and source references. Per-model scoring refuses cumulative work above 32 million evaluated pixels, 40,000 annotation visits or 2 million annotation/prediction pairs. Segmentation charges resized pixel comparisons for every annotation/prediction pair, rather than only source mask dimensions. Required runs that exceed prediction mask encoding or serialized evidence bounds also save checkpoints, with an evaluation-limit outcome and no image-inspection action. Runs without requirements preserve the existing refusal behavior.

### Local evaluator observations on 17 November 2026

`requirementResources.test.ts` compares ordinary evaluation with the same input plus two overlapping condition requirements. Fixtures have 4 or 1,000 generated 2 by 2 detection images, two declared classes and one annotation/prediction per image. Encoded-image bytes are opaque to this evaluator. The separate ten-workflow matrix supplies real JPEG decoding and ONNX inference coverage. One warmup precedes five paired observations on an arm64 Apple M5 Pro, macOS 27.0.1 and Node 26.13.0. Other loop work remains active. Times below are medians, with added time calculated from paired differences.

| Real test images | Ordinary evaluation | With two requirements | Paired difference | Added report bytes per model | Added comparison bytes |
| --- | --- | --- | --- | --- | --- |
| 4 | 3.926 ms | 2.424 ms | -1.283 ms | 638 | 1,665 |
| 1,000 | 86.857 ms | 137.777 ms | 11.277 ms | 8,420 | 17,241 |

Comparison bytes include both reports and the comparison-attempt summary. Constant artifact and provenance fields are excluded from both sides. Additional inference, content reads and decoded image pixels are zero. The two requirements score 32 and 8,000 image pixels respectively. Detection does not decode ground-truth masks. Segmentation can decode ground-truth masks again through the ordinary scorer, within the cumulative pixel-comparison budget.

Collected V8 heap-used differences were 114,672 and 25,760 bytes. Sampled process RSS reached 107,053,056 and 204,472,320 bytes. These are Vitest worker-process observations, not isolated browser worker memory or a measured peak inside scoring. Collection, caches and host contention affect them. The final observation ran alongside 45 related test files. Small or negative paired differences reflect timing noise and establish no speedup or negative scoring cost. The final metric-path check is `scratch/requirements-evidence-limit-check.log`, with raw pairs in `scratch/requirements-resource-observation-4.json` and `scratch/requirements-resource-observation-1000.json`.

### Shipped browser evaluation worker

A scratch probe sends the same 1,000-image input to the shipped evaluation worker, first without requirements and then with two. Chrome DevTools attaches to that worker directly and samples `Runtime.getHeapUsage` before evaluation, after reply and after collection. One ordinary warmup precedes these single observations. The harness serves the development app because production bundles are absent. Timings include worker-message cloning and return, but exclude inference, content loading, image decoding and UI rendering.

| Evaluation | Call elapsed | Worker heap before | Worker heap after reply | Worker heap after collection | Serialized report |
| --- | --- | --- | --- | --- | --- |
| Ordinary | 69.920 ms | 10,473,664 bytes | 14,725,696 bytes | 10,480,460 bytes | 1,135,752 bytes |
| Two requirements | 141.665 ms | 10,480,460 bytes | 15,876,160 bytes | 10,506,636 bytes | 1,144,172 bytes |

Worker backing storage was 10,796,273 bytes before each call and after collection. After reply it was 11,423,865 bytes ordinarily and 11,972,653 bytes with requirements. The extra post-reply heap observation is 1,150,464 bytes, and the collected heap difference is 26,176 bytes. Samples after reply do not measure peak allocation. These single call times do not isolate scoring overhead or establish a throughput rate. Raw evidence is `scratch/requirements-worker-memory.json`, from `scratch/requirements-worker-memory-final.log`. [Testing evidence](testing-vision.md#declared-operating-requirements) records the probe correction and browser capture limits.
