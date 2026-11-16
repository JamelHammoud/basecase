# Scene storage and startup performance

Implementation: [Scene storage and startup](../guide/scene-tabs.md#performance-scene-storage-and-startup). Shared requirements: [Performance](../guide/performance.md).

## Dated lists prepare timestamps once

`dateGroups.test.ts` checks exact recent cutoffs, month and year labels, timezone offsets, calendar transitions, stable ties, source preservation and unreadable timestamps. Its 300- and 600-item fixtures require exactly 300 and 600 parses and one calendar preparation each. These are operation counts, without timing assertions or a claim about complete list rendering time.

### Month labels within dated lists

A whole-app search found Scenes and Chat History as the two consumers of `groupByDate`, with no separate date-heading formatter. Both now reuse month labels through a call-local map keyed by local year and month. The map is discarded after grouping, so later calls still read the current calendar. The standalone `dateGroupLabel` retains the same calculation.

The 300- and 600-entry fixtures distribute older entries across November 2026, October 2026 and October 2025. Instrumenting the Intl formatter accessor counts three format calls in either fixture, down from one per entry. Expected group labels and item counts are asserted. These are deterministic operation counts rather than wall-clock measurements. Timestamp parsing, sorting and per-item Date construction remain unchanged. No complete list-rendering speedup is claimed.

No actions, labels or screen states change, so help instructions and screenshots remain accurate. No browser walkthrough or quarantine changes apply.

## Insertion ranges scan scalar values

`workspace/robotPlacement.test.ts` covers 150,000 incoming parts and scene obstacles, plus exact coordinate and dimension reads at 600 and 1,200 parts. Articulated placement now reads each dimension once per part, down from six reads per dimension. These are operation counts, without timing assertions.

## Duplicate naming indexes taken names once

`copyName.scale.test.ts` checks gaps, case sensitivity, duplicate entries and unchanged input, and bounds name reads to twice the input size for 600 and 1,200 existing copies. Those fixtures previously took 180,900 and 721,800 reads.

## Boot never waits on anything it doesn't need to draw

The agent connection used to delay the window 0.7–2 s. Each tab builds its own WebGL context, environment map and shaders, costing about 60–250 ms apiece. Measure boot with real scenes reopened (`open-scenes` in `localStorage`), not an empty one.
