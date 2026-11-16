# Mirror performance

Implementation: [Mirror](../guide/inspector-and-selection.md#performance-mirror). Shared requirements: [Performance](../guide/performance.md).

## Mirror selects candidates without sorting

`mirrorSelection.test.ts` compares 120 transformed mate fixtures and every nonempty symmetry subset against the previous sorting, including source order, edits and input preservation. Its 300- and 600-port fixtures reduce sort calls across the three selectors from three to zero. Existing datum tests compare every catalog component and the score-band boundaries, and assembly tests retain complete mate and joint checks. These are operation counts without timing assertions or a claim about complete Mirror time.

## Catalog Mirror prepares compatible ports once

`mirrorDatum.test.ts` compares the previous scans across every catalog component, 120 mixed fixtures, ties, empty inputs and edits while preserving sources. Its 300- and 600-port fixtures reduce kind reads from 271,800 and 1,083,600 to at most 2,400 and 4,800. Geometry comparisons within a compatibility group remain quadratic. These are operation counts, without timing assertions or a claim about complete Mirror time.
