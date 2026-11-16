# Agent and CAD kernel performance

Implementation: [Agent and CAD kernel](../guide/agent.md#performance-agent-and-cad-kernel). Shared requirements: [Performance](../guide/performance.md).

## Suggestion distances reuse one short row

`editDistance.test.mjs` compares all 7,225 pairs of strings through three code units from a four-unit alphabet with a full matrix, plus 160 generated strings, unbalanced lengths and both complete suggestion paths. With a 300- or 600-character query and a three-character candidate, row allocations fall from 301 or 601 to one four-entry row. Reversing the inputs also uses four entries instead of rows sized to the long string. These are storage counts without timing assertions or a claim about complete tool or site-check time.

## Unordered string pairs use one comparison

`pairKey.test.mjs` compares Unicode, generated strings and separator boundaries against sorting, checks CAD rounding and midpoint identity, and verifies zero sort calls for 300 and 600 pairs. These are operation counts without timing assertions or a claim about complete geometry-analysis time.

## Fixed file batches share a cursor

`eachLimited.test.mjs` checks concurrency, out-of-order completion, failures, empty batches and one source read per item. A scratch comparison matched start traces for 300 and 600 items at both limits. The previous four-worker queues called `shift` 304 and 604 times, and six-worker queues called it 306 and 606 times. The shared cursor calls it zero times. These are operation counts, without a timing assertion or a claim about complete transfer time.

## Worker batches build their indices once

`workerIndices.test.mjs` checks uneven batches, empty inputs and complete result restoration with null readings across one to eight workers. `analysisBatches.test.ts` checks both analysis dispatchers with four workers and one source read per job. A local operation-count probe compared identical payloads for four workers: 11 analysis jobs fell from 44 source reads to 11, and 10,000 jobs from 40,000 reads to 10,000. Recipe ports fell from 50,000 reads to 10,000 on the same batch size. These counts measure dispatch preparation, without timing physics or compilation.

## Agent mirroring indexes sources and existing twins once

`agentMirror.scale.test.ts` bounds scene reads for 600 sources with and without existing twins, and checks all axes, renames and collisions. The previous searches took 540,300 reads without twins and 720,600 with twins. This bounds lookup work, not geometry mirroring or collision suffix searches.

## The CAD kernel never touches the renderer or boot

A first compile costs about 0.15 s more than the old forked process (opening the window); later ones match it (guide examples: OpenSCAD 0.06–2.1 s, replicad 0.06–0.25 s, either host).
