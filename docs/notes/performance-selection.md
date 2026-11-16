# Selection performance

Implementation: [Selection](../guide/inspector-and-selection.md#performance-selection). Shared requirements: [Performance](../guide/performance.md).

## Selecting groups uses membership sets

`workspace/selection.scale.test.ts` checks interleaved groups, selection order and every selection subset for click modifiers, with array-read budgets on 600-part fixtures. Group expansion previously took 271,500 reads and a fully selected group toggle through a click took 543,301 reads on those fixtures.

## Boolean drill picking accumulates surface gaps directly

`booleans/picking.ts` removes the mapped and flattened gap arrays for each operand, the scored operand array and its ranking records. A single intersection array replaces one result array per probe. Probe geometry construction and Three.js raycasting remain unchanged.

On 16 November 2026 UTC, a scratch Vitest comparison ran on an Apple M5 Pro, macOS arm64 and Node v26.13.0. Each batch made 100 picks across 32 box operands, with 256 controlled intersections per probe. After one warm-up batch per version, seven alternating before and after batches had medians of 55.51 ms and 47.13 ms, a 15.1% reduction. Every pick selected the same first operand. The comparison used the previous picker from git and the changed picker with identical geometry builders. Controlled intersections isolate result processing and geometry setup, excluding real raycasting, rendering and browser input latency. These local timings are not CI results or an end-to-end interaction claim.

`src/booleans/picking.test.ts` uses real geometry to cover entry and exit faces, equal-distance ties, misses and edited operands. Its existing cut-surface test exercises drilling through the result into solid and cutout operands. The targeted related run passed four files and nine tests. No timing assertion or quarantine was added.
