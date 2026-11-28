# Trace plots performance

Implementation: [Trace plots](../guide/design-system.md#performance-trace-plots). Shared requirements: [Performance](../guide/performance.md).

## Plot ranges scan samples without copying them

`traceRanges.test.ts` checks empty and flat ranges, non-finite samples, typed-array views, source preservation and one read per sample. A local Node 26.13.0 measurement on macOS used eight traces of 6,001 samples, both axes, five warmups and 25 measured runs. Median range calculation fell from 7.75 ms to 0.24 ms. This measures range calculation alone, not a complete repaint, and isn't a CI timing assertion.

## Plot sampling writes directly into paths

`traceSampling.test.ts` checks complete paths against an independent bucket calculation across reduction boundaries, fractional widths, typed-array views, nonfinite samples and later edits. A scratch comparison matched 400 complete outputs against the previous implementation. On eight traces of 6,001 samples at 1,000 columns, set construction fell from 8,000 to zero, and array construction through `Array.from` and flattening each fell from eight calls to zero. On shared macOS arm64 hardware with Node 26.13.0, median path generation fell from 2.64 ms to 1.82 ms across 21 alternating ten-call batches after five warmup batches per implementation. These measure path generation alone, without CI timing assertions or a claim about complete repaint time.

## Reduced plot buckets read each sample once

On 2026-11-17, a local Node 26.13.0 probe compared the preceding and current `tracePaths` with 6,001 samples of `Math.sin(i / 100)`, 1,000 columns and an explicit range of `[-1, 1]`. Numeric property getters counted 28,005 source reads before and 6,001 after. Both produced the same 21,301-character SVG path. This is an operation count, not elapsed time or a complete repaint measurement. Supplying the range isolates sampling from the separate range scan.

`traceSampling.test.ts` retains the independent complete-path comparisons and adds a 6,001-sample read-count case with repeated extrema, NaN and infinity. Each reduced sample is read once, including non-finite values. The existing cases cover entirely missing buckets, flat buckets, both extrema orders, first ties, uneven and fractional buckets, reduction boundaries and typed-array edits. Explicit-x plots use their separate placement path and do not enter bucket reduction. No UI state, label or interaction changes, so no browser walkthrough or help screenshot changes are needed.

## Path projection prepares axis dimensions once

On 2026-11-28, path generation moved invariant axis spans and drawable dimensions out of point emission. One y projection serves every trace in a call, and one explicit x projection serves every XY trace. Each index-spaced trace calculates its sample denominator once. Division, subtraction and multiplication retain their preceding order, avoiding rounding changes from reciprocal multiplication.

A local Node 26.13.0 probe on macOS arm64 used eight traces of 6,001 sine samples, a 1,000 × 96 box with an 8-unit inset, and explicit ranges of [-1, 1]. After ten warmup calls per implementation, 31 alternating ten-call batches measured median time-path generation at 1.520 ms before and 1.451 ms after. XY generation measured 4.163 ms before and 4.156 ms after. Complete serialized outputs matched at 172,841 and 511,449 characters respectively. These small local differences do not establish a user-visible or CI speedup. They exclude range scanning, React rendering and browser painting.

`traceProjection.test.ts` checks complete XY paths against the preceding coordinate formulas across lines, dots, missing and nonfinite coordinates, unequal sample lengths, typed-array views, empty traces, fractional widths, changed ranges and zero drawable height. Existing `traceSampling.test.ts` retains complete index-spaced path comparisons through reduction boundaries and later source edits. All `TracePlot` consumers share this implementation, including console, timeline and calibration plots. No interaction, state or copy changes, so help articles and screenshots remain accurate.
