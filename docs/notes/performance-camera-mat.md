# Camera mat tracking performance

Implementation: [Camera mat tracking](../guide/cameras.md#performance-camera-mat-tracking). Shared requirements: [Performance](../guide/performance.md).

## Homography fitting streams normalized corners into reusable rows

`homography.test.ts` compares 160 generated fixtures and their edits with the previous fit, plus short, singular, nonfinite and frozen observations. Its 300- and 600-corner fixtures reduce mapped array entries from 908 and 1,808 to eight, all in the unchanged linear solver. On macOS arm64 with Node 26.13.0, median fit times fell from 0.04460 ms and 0.07620 ms to 0.03025 ms and 0.06003 ms. Measurements used four warmup batches and 21 alternating batches of 100 fits per implementation. These measure fitting alone, without CI timing assertions or a claim about complete tracking time.
