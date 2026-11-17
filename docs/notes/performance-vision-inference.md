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

## COCO decoding test instrumentation

Commit `65d6feb09` introduced the foreground-run decoder and its 300- and 600-pixel operation checks after the last green nightly. In run 43831610288 the 600-pixel test exceeded the unchanged five-second test budget on both platforms, taking 6.207 seconds on Windows. The same test passed on Windows in run 43824172798 and on both platforms in run 43820519938. This is test instrumentation overhead exposed by runner load, not evidence of a decoder performance regression.

For each size the old test spied on `Math.floor` while running the reference decoder three times, retaining 270,000 or 1,080,000 spy call records before counting optimized work. The reference now runs before installing that spy. Every decoded byte still compares with the reference, and optimized rounding still must equal the foreground-run count. Reference traversal counts remain derivable from the reference's single per-pixel floor call, rather than being measured again through a global spy in CI. No fixture size, product code, output assertion or deadline changes.

[Run 43860554212](https://github.com/JamelHammoud/basecase/actions/runs/43860554212), at `b7799712eda26e739e2ce79282149dba687df8d7`, again exhausted the unchanged five-second budget on the Windows 600-pixel test. The preceding run 43856125616 passed both unit jobs. The decoder and its test were unchanged between these runs. The classification is load-sensitive test overhead, rather than Windows-specific decoder logic. The earlier spy repair in `105e3fc1b` left three generic deep-equality comparisons over 360,000-byte typed arrays.

A single local stage probe on an Apple M5 Pro, macOS arm64 and Node 26.13.0 used the actual reference and production functions and the same three 600-pixel fixtures. Reference decoding totaled 5.10 ms and production decoding 2.85 ms. Generic `toEqual` comparisons took 489.50, 476.12 and 487.47 ms, totaling 1,453.09 ms. Comparing those same outputs through `Buffer.equals` took 0.23, 0.33 and 0.27 ms, totaling 0.83 ms. This isolates assertion overhead locally. It is not a Windows timing or a before-and-after flake-rate measurement, and the Windows log does not identify the timed-out stage.

The large fixtures now use `Buffer.equals` to check output length and every byte. Small exhaustive and generated masks retain generic deep equality. Fixture sizes, reference decoding, rounding counts, source immutability, independent-output checks and deadlines remain intact. No quarantine or coverage gap is introduced. Hosted Windows confirmation remains with the pull request's related unit check and the full nightly suite.


## SAM memory slots read retained frames directly

Whole-app search found the spatial bank and pointer ordering in `vision/segmentationMath.ts`. The segmentation engine reads the same pointer ordering for temporal distances. Bank construction now indexes retained frames directly. The exported pointer list uses the same lookup, preserving its independently owned result. First-frame conditioning, oldest-to-newest spatial slots, newest-to-oldest pointers and latest-frame spatial padding remain unchanged. Pointer padding repeats the oldest retained pointer, or the initial memory when history is empty.

With 15 recent memories, a bank previously built six temporary lists: six spatial references, six padded spatial references, seven complete spatial entries, 15 sliced pointer references, 16 pointer entries and the 16-slot pointer result. It reversed the pointer slice in place. Direct bank lookup removes all six lists, totaling 66 reference entries. The engine still receives its required 16-slot result, without the 15-entry slice and 16-entry staging list. These are allocation counts derived from the code, not elapsed-time measurements or a claim about model inference latency. Tensor sizes and arithmetic are unchanged.

`segmentationMath.test.ts` compares every byte in both complete tensor buffers against the previous slot construction for histories of 0, 1, 5, 6, 7, 14, 15, 16 and 20 frames. It also checks exact pointer identities, independent returned lists and history preservation. Existing prompt, mask and initial-bank tests remain active. No model execution, browser interaction, label or visible state changes, so existing help and screenshots remain accurate.
