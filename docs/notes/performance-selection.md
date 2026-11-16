# Selection performance

Implementation: [Selection](../guide/inspector-and-selection.md#performance-selection). Shared requirements: [Performance](../guide/performance.md).

## Selecting groups uses membership sets

`workspace/selection.scale.test.ts` checks interleaved groups, selection order and every selection subset for click modifiers, with array-read budgets on 600-part fixtures. Group expansion previously took 271,500 reads and a fully selected group toggle through a click took 543,301 reads on those fixtures.
