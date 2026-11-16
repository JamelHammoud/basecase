# Scene storage and startup performance

Implementation: [Scene storage and startup](../guide/scene-tabs.md#performance-scene-storage-and-startup). Shared requirements: [Performance](../guide/performance.md).

## Dated lists prepare timestamps once

`dateGroups.test.ts` checks exact recent cutoffs, month and year labels, timezone offsets, calendar transitions, stable ties, source preservation and unreadable timestamps. Its 300- and 600-item fixtures require exactly 300 and 600 parses and one calendar preparation each. These are operation counts, without timing assertions or a claim about complete list rendering time.

## Insertion ranges scan scalar values

`workspace/robotPlacement.test.ts` covers 150,000 incoming parts and scene obstacles, plus exact coordinate and dimension reads at 600 and 1,200 parts. Articulated placement now reads each dimension once per part, down from six reads per dimension. These are operation counts, without timing assertions.

## Duplicate naming indexes taken names once

`copyName.scale.test.ts` checks gaps, case sensitivity, duplicate entries and unchanged input, and bounds name reads to twice the input size for 600 and 1,200 existing copies. Those fixtures previously took 180,900 and 721,800 reads.

## Boot never waits on anything it doesn't need to draw

The agent connection used to delay the window 0.7–2 s. Each tab builds its own WebGL context, environment map and shaders, costing about 60–250 ms apiece. Measure boot with real scenes reopened (`open-scenes` in `localStorage`), not an empty one.
