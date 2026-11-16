# Mirror performance

Implementation: [Mirror](../guide/inspector-and-selection.md#performance-mirror). Shared requirements: [Performance](../guide/performance.md).

## Assembly Mirror indexes scene identities once

Assembly Mirror previously used request-array membership for every scene part, then searched the scene again for every mate target. It now prepares a selection set and a first-match source map once per call. The map has at most one entry per scene id and ends with the operation. Port matching and joint anchoring keep their existing work.

On 16 November 2026, a scratch comparison ran the previous and current assembly implementations against 80 and 160 mated CAD sources. Each fixture placed the same number of unrelated parts before the sources and a stationary torso target last. Instrumented unrelated-part id reads fell from 6,480 to 240 and from 25,760 to 480. Both implementations retained every expected torso mate. These are operation counts, without timing assertions, garbage-collection measurements or a claim about total Mirror latency.

`mirrorAssembly.test.ts` retains the linear read bounds and checks copied and stationary targets, selection order and duplicates, missing selections and targets, duplicate target first matches, changed placement, independent calls and source preservation. Existing tests cover mirrored joints, groups and placement. The whole-app search found one assembly mate-transfer caller. Agent mirroring already indexes sources and does not transfer mates. The Mirror help article clarifies copied and stationary mate targets. Controls, labels, states and user steps are unchanged, so its screenshots remain accurate.

## Mirror keeps one reflected coordinate buffer

Imported and sculpted triangle soups previously copied the source positions for reflection, then copied that buffer again for winding reversal. Both now reverse winding in the owned reflected buffer. For a 100,000-triangle mesh with 900,000 numeric entries, this removes one 900,000-entry array and its copy per Mirror call. Indexed meshes keep their separate reflected positions and reversed indices. These are source-level allocation counts, without timing or garbage-collection measurements or a claim about total Mirror latency.

`mirrorGeometry.test.ts` compares the previous coordinate calculation for imported and sculpted geometry at seven lengths, on all three axes, with missing, empty and populated indices. Its frozen sources and double-reflection checks cover source preservation, signed zero, trailing incomplete triangles and independent returned arrays. Existing part and assembly tests cover placement, mates and joint mirroring. No controls, labels or steps change.

## Mirror selects candidates without sorting

`mirrorSelection.test.ts` compares 120 transformed mate fixtures and every nonempty symmetry subset against the previous sorting, including source order, edits and input preservation. Its 300- and 600-port fixtures reduce sort calls across the three selectors from three to zero. Existing datum tests compare every catalog component and the score-band boundaries, and assembly tests retain complete mate and joint checks. These are operation counts without timing assertions or a claim about complete Mirror time.

## Catalog Mirror prepares compatible ports once

`mirrorDatum.test.ts` compares the previous scans across every catalog component, 120 mixed fixtures, ties, empty inputs and edits while preserving sources. Its 300- and 600-port fixtures reduce kind reads from 271,800 and 1,083,600 to at most 2,400 and 4,800. Geometry comparisons within a compatibility group remain quadratic. These are operation counts, without timing assertions or a claim about complete Mirror time.
