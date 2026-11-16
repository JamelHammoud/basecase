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

## Mirror side naming reuses compiled rules

Whole-app search found one side-word replacement helper in `mirror/mirrorNames.ts`. Assembly Mirror uses it for part names, group names and joint ids and names. Agent Mirror uses it for part ids, names and group names. Skeleton declaration also uses the same rules to discover left/right, front/rear and front/back joint pairs. All callers now share four compiled expressions, created when the module loads. Skeleton pairing retains separate front/rear and front/back passes, while Mirror retains their sequential application.

Previously each replacement constructed one expression per word pair. In the 300- and 600-query fixtures, each query mirrors one Front bracket name and swaps one left joint id. Expression constructions during those queries fall from 900 and 1,800 to zero. The module retains four expressions, replacing repeated transient construction. These are source-derived operation counts checked by a constructor spy, without timing, heap or complete Mirror latency claims.

`mirrorNames.test.ts` compares repeated calls on all three axes with the preceding replacement calculation. It covers uppercase, title case, repeated matches, ASCII and non-ASCII boundaries, numeric suffixes, unmatched names, fallback names and the ordered front rules. Existing assembly, agent scene and skeleton tests cover integration. No timeout, retry or quarantine changes apply. The Mirror help article still describes the same naming, controls and steps, so no article edit or capture is needed.

Changed-file validation passed formatting, lint, documentation, site copy for 295 pages, types and all 553 tests across 72 related files. The related run reported 36.89 seconds on the shared host. Output remains in `scratch/check-mirror-names.log`. Copy accounting is net zero. Preflight flagged [The design agent](../../site/content/help/the-design-agent.md) because it covers the edited agent guide. Reading the article against this change confirmed that its tasks, capability descriptions and controls remain accurate, so it needs no edit or capture.
