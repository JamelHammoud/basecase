# Trace plots performance

Implementation: [Trace plots](../guide/design-system.md#performance-trace-plots). Shared requirements: [Performance](../guide/performance.md).

## Plot ranges scan samples without copying them

`traceRanges.test.ts` checks empty and flat ranges, non-finite samples, typed-array views, source preservation and one read per sample. A local Node 26.13.0 measurement on macOS used eight traces of 6,001 samples, both axes, five warmups and 25 measured runs. Median range calculation fell from 7.75 ms to 0.24 ms. This measures range calculation alone, not a complete repaint, and isn't a CI timing assertion.

## Plot sampling writes directly into paths

`traceSampling.test.ts` checks complete paths against an independent bucket calculation across reduction boundaries, fractional widths, typed-array views, nonfinite samples and later edits. A scratch comparison matched 400 complete outputs against the previous implementation. On eight traces of 6,001 samples at 1,000 columns, set construction fell from 8,000 to zero, and array construction through `Array.from` and flattening each fell from eight calls to zero. On shared macOS arm64 hardware with Node 26.13.0, median path generation fell from 2.64 ms to 1.82 ms across 21 alternating ten-call batches after five warmup batches per implementation. These measure path generation alone, without CI timing assertions or a claim about complete repaint time.
