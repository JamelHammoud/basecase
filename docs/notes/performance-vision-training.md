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
