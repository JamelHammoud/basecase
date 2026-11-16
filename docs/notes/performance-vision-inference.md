# Vision inference performance

Implementation: [Vision inference](../guide/cameras.md#performance-vision-inference). Shared requirements: [Performance](../guide/performance.md).

## Vision decoders build only retained masks and landmarks

`decodeExtras.test.ts` and `decodeFace.test.ts` compare complete results across 80 generated fixtures each, plus cap boundaries, malformed discarded rows, edits and frozen inputs. With 300 and 600 overlapping generic candidates, mask-value reads fall from 7,200 and 14,400 to 3,612 and 7,212, and landmark reads from 6,000 and 12,000 to 3,010 and 6,010. On equivalent YuNet fixtures, landmark reads fall from 24,000 and 27,000 to 21,010 each. Counts include full validation. These are operation counts without timing assertions or a claim about complete inference time.

## COCO decoding visits only foreground pixels

`imageMasks.test.ts` checks every binary image across twelve rectangular shapes through twelve pixels, 160 generated masks, column crossings, frozen and edited inputs, sparse run arrays and independent results. On 300- and 600-pixel squares, coordinate rounding falls from 90,000 and 360,000 calls to zero for empty masks and one for a single foreground run, including full masks. These are operation counts without timing assertions or a claim about complete import or evaluation time.

## Vision resizers share spatial work across color channels

`preprocess.test.ts` compares 480 complete tensors with channel-by-channel sampling, including every resize and color mode, fractional scales, typed-array views, edits and malformed frames. `depthResize.test.ts` retains Pillow hashes and checks an aggregate baseline hash over 160 generated RGBA images, single-axis resizes and independent buffers. A scratch comparison matched 1,920 complete tensors and 160 depth images against the previous implementations. On 600- and 1,200-pixel stretch fixtures, `Math.floor` calls fall from 7,202 and 14,402 to 1,802 and 3,602. On depth fixtures targeting 30- and 60-pixel squares, `Math.floor` calls fall from 14,114 and 45,866 to 7,058 and 22,934. These are operation counts without timing assertions or a claim about complete inference time.

## Mask resizing prepares sampling columns

`maskSampling.test.ts` compares 100 complete suggestion and overlap fixtures and 160 encoded SAM masks with the previous calculations, plus edits, typed-array views, ties and wide and tall outputs. On 300- and 600-pixel squares, nearest column rounding falls from 90,000 and 360,000 calls to 300 and 600. Both versions also round one coordinate per row. Bilinear rounding falls from 270,000 and 1,080,000 calls to 600 and 1,200. These are operation counts without timing assertions or a claim about complete inference or training time.

## Image-label rasterization skips rows outside each ring

`polygonRaster.test.ts` compares 600 generated mask results with full-height rasterization and checks boundary, edit and rejection cases. Its four-row polygon in 300- and 600-row images reduces row scans and crossing arrays from 300 and 600 to four scans and one array. Wholly offscreen rings scan no rows. These are operation counts, without timing assertions or a claim about complete import or editing time.

## Annotation mask tracing appends boundaries directly

`maskPolygons.test.ts` checks pixel coverage, oriented area, edited inputs and independent outputs. Its 300- and 600-pixel checkerboards reduce filter calls from 1,500 and 3,000, sort calls from 1,200 and 2,400, and flatMap calls from 300 and 600 to zero. A scratch comparison matched 67,936 complete polygon results against the previous tracer, including every 4 × 4 mask. These are operation counts and output comparisons, without timing assertions or a claim about complete labeling time.

## Vision worker assets match the ONNX Runtime backend

`src/vision/inferenceWorker.test.ts` builds the production worker, runs a pixel-sensitive ONNX model in headless Chrome, checks opposing black and white frame detections, and requires WebGPU when the browser has an adapter. It uses the normal WASM fallback when the browser has no adapter.

## Prompt segmentation runs in its own worker

`node tools/vision/segmentation.mjs --models <folder> --image <truck.jpg>` runs the pinned model through real WebGPU inference in headless Chrome. The folder contains the five `.onnx` files named by `src/vision/segmentationModels.ts`. Download them from its pinned revision, and use Meta's [SAM 2 truck example](https://github.com/facebookresearch/sam2/blob/main/notebooks/images/truck.jpg). The command writes `scratch/segmentation-acceptance.json` by default. It seeds one point and checks 30 subsequent translated frames against the translated first mask, requiring at least 0.9 IoU, a nonempty mask, less than 95% foreground coverage, the frame cap and reset refusal. This measures temporal consistency on one example, not segmentation accuracy across other objects, occlusions or camera sources. It records each frame's elapsed time without a CI speed threshold. The test performs numerical checks and captures no screenshots.
