# Panels and Layers performance

Implementation: [Panels and Layers](../guide/layout.md#performance-panels-and-layers). Shared requirements: [Performance](../guide/performance.md).

## Layers indexes groups once

`layerRows.scale.test.ts` checks scene order, complete group selection and collapsed/search results on 600 interleaved parts in 200 groups, with a linear budget for group lookups rather than a wall-clock limit.
