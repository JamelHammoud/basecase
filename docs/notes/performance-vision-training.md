# Vision training performance

Implementation: [Vision training](../guide/cases.md#performance-vision-training). Shared requirements: [Performance](../guide/performance.md).

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

Retained heap is the V8 heap-used difference after collection, with source images and predictions already retained. It includes diagnostics and evidence objects. It excludes image buffers, WASM, GPU memory and other processes. Small heap differences and timings are sensitive to collection and concurrent host activity. Verifying one model's evidence and preparing its first frozen display image took 90.717 ms and 10.566 ms respectively, without IPC, storage latency or rendering.

The browser resource capture used the actual Library entry, controlled training completion with real inference, ordinary persistence, both-model verification and first-image selection. It asserted 4 and 1,000 retained test-image rows. These fixtures have one class, unlike the two-class worker fixtures above, so their serialized sizes differ. The local harness served the development app because production bundles were absent. These are not production-bundle performance claims.

| Real test images | Open comparison and first image | Evidence bytes per model | Added page heap after collection |
| --- | --- | --- | --- |
| 4 | 872 ms | 2,377 | 593,180 bytes |
| 1,000 | 930 ms | 533,143 | 7,795,800 bytes |

Each browser row is one successful observation. The interval includes the command to open inspection, class and finding selection, image selection and browser-protocol round trips. It excludes fitting, evaluation and app boot. Page heap includes the inspection list and display, and excludes workers and GPU memory. The results do not establish that the larger dataset opens faster or provide a throughput comparison.

An earlier capped observation repeated validation in the renderer. The final implementation moves that work into the worker and returns row indices. Invalid one-image fixtures and the separate pre-boot navigation failure are excluded, as recorded in [vision test evidence](testing-vision.md#frozen-comparison-inspection). Detailed local measurements remain in the task's scratch resource JSON and logs. CI runs correctness coverage without timing thresholds, retries or increased deadlines.
