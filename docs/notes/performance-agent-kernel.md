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

## Scene handoffs share approximate bounds

`aiHandoff.test.ts` checks the JSON envelope, ordered part ids, contact descriptions in both exports, hidden parts, reference images, cutouts, reference axes, the inclusive 5 mm contact boundary, source preservation, later edits and empty scenes. Existing `annotationAttachments.test.ts` retains attachment and comment coverage. No quarantine applies.

For 300 and 600 separated visible boxes, each with a counted width getter, handoff generation now reads widths 600 and 1,200 times. The previous path required 900 and 1,800 reads, once for each of envelope bounds, contact bounds and Markdown rows. Bounds records fall from two per visible part to one, and visible non-image filtering falls from three passes to one. These are operation and storage counts, without timing assertions or a claim about complete autosave time. The pairwise contact scan remains quadratic.

## CAD coordinate conversion writes output directly

The whole-app search for `cadMeshToScene` and coordinate-tuple conversion found one shared mesh converter. Its consumers are agent creation and updates, CAD recompilation, linkage placement and geometry-worker sheet detection. Both mesh vertices and optional edge endpoints now write directly into their owned output arrays. The general point conversion helper remains appropriate for callers that need a returned point.

For V vertices and E edge endpoints, this removes 2 × (V + E) temporary three-number arrays. The previous call constructed an input tuple and `toScene` returned another tuple for each point. A mesh with 100,000 vertices and 20,000 edge endpoints therefore avoids 240,000 temporary arrays. These are code-derived allocation counts, without timing assertions or a claim about complete compilation speed. Output arrays, bounds and the mesh centering pass remain.

`cadMesh.test.ts` compares every returned field with the previous conversion for 100 deterministic meshes containing 3 through 300 vertices, then repeats after source edits. It checks source preservation, independent position outputs and unchanged index ownership. Another 42 combinations cover empty, signed-zero, nonfinite and incomplete vertices and edges. No quarantine applies. No user action, label or screenshot state changes.

Preflight's coverage reminder for [The design agent](../../site/content/help/the-design-agent.md) was checked against the final code. The converter preserves every returned field, so the article's modeling, Checks, undo and steering claims remain accurate. It describes no coordinate conversion steps or screenshot states to revise. The article stays unchanged.

## Scene version capture

Agent prompts await a durable per-lane baseline before sending work. Completion, Stop, adopted-run completion and tab closure use the same serialized workspace capture queue. Canonical serialization and hashing run in a worker, while ordinary scene serialization retains its immutable-part cache. Normal autosave and previews omit history and preserve its stored reference. Shared content and local fixture measurements are owned by [Scene storage and startup](performance-workspace.md#scene-version-codec-and-atomic-replacement).
