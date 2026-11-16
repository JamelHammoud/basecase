# Panels and Layers performance

Implementation: [Panels and Layers](../guide/layout.md#performance-panels-and-layers). Shared requirements: [Performance](../guide/performance.md).

## Layers indexes groups once

`layerRows.scale.test.ts` checks scene order, complete group selection and collapsed/search results on 600 interleaved parts in 200 groups, with a linear budget for group lookups rather than a wall-clock limit.

## Try grouping

`tryGroups` serves the Library robot rows, Tries mode and working or frozen dataset member grids through one shared helper. The previous implementation sorted a copy of all summaries, then copied every growing robot list on each append. The new implementation appends once per summary and sorts each completed list. For 10,000 tries belonging to one robot, this removes 49,995,000 copied prior-member references. Final lists retain the source summary objects.

A scratch Vitest comparison on an Apple M5 Pro, macOS arm64, Node 26.13.0 used 10,000 summaries with deterministic shuffled timestamps. Both implementations ran once before nine measured runs each. Median grouping times were 28.04 ms before and 1.47 ms after for one robot, and 3.28 ms before and 1.04 ms after for 20 interleaved robots. Complete grouped outputs matched the previous implementation for both inputs. These are local pure-helper measurements, not browser rendering or CI timings. The scratch benchmark and raw measurements stay in the session's ignored scratch folder.

`src/workspace/useTriesView.test.ts` checks robot ordering, newest-first ordering, stable timestamp ties, summary identity, frozen input ownership, independent result lists and empty input. The screen, labels and actions are unchanged, so this refinement adds no browser walkthrough or help screenshots.
