# Mirror performance

Implementation: [Mirror](../guide/inspector-and-selection.md#performance-mirror). Shared requirements: [Performance](../guide/performance.md).

## Mirror keeps one reflected coordinate buffer

Imported and sculpted triangle soups previously copied the source positions for reflection, then copied that buffer again for winding reversal. Both now reverse winding in the owned reflected buffer. For a 100,000-triangle mesh with 900,000 numeric entries, this removes one 900,000-entry array and its copy per Mirror call. Indexed meshes keep their separate reflected positions and reversed indices. These are source-level allocation counts, without timing or garbage-collection measurements or a claim about total Mirror latency.

`mirrorGeometry.test.ts` compares the previous coordinate calculation for imported and sculpted geometry at seven lengths, on all three axes, with missing, empty and populated indices. Its frozen sources and double-reflection checks cover source preservation, signed zero, trailing incomplete triangles and independent returned arrays. Existing part and assembly tests cover placement, mates and joint mirroring. No controls, labels or steps change.

## Mirror selects candidates without sorting

`mirrorSelection.test.ts` compares 120 transformed mate fixtures and every nonempty symmetry subset against the previous sorting, including source order, edits and input preservation. Its 300- and 600-port fixtures reduce sort calls across the three selectors from three to zero. Existing datum tests compare every catalog component and the score-band boundaries, and assembly tests retain complete mate and joint checks. These are operation counts without timing assertions or a claim about complete Mirror time.

## Catalog Mirror prepares compatible ports once

`mirrorDatum.test.ts` compares the previous scans across every catalog component, 120 mixed fixtures, ties, empty inputs and edits while preserving sources. Its 300- and 600-port fixtures reduce kind reads from 271,800 and 1,083,600 to at most 2,400 and 4,800. Geometry comparisons within a compatibility group remain quadratic. These are operation counts, without timing assertions or a claim about complete Mirror time.
