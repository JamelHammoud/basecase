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

## Freehand attachment bounds scan strokes directly

A whole-app search for `sketchFrame`, `sketchStrokes` and `centredSpan` found one freehand attachment frame helper, called by `sketchFile` for Attach Sketch PNG export. Live drawing uses the shared stroke tracer but does not calculate a crop. The separate CAD Sketch bounds helpers handle different geometry and already accumulate bounds.

For N drawing points, the previous helper allocated one flattened N-entry point list and four N-entry coordinate lists. It read each x and y twice. The direct scan removes all five lists and reads each coordinate once, keeping constant auxiliary storage. These are code-derived allocation and read counts, not timings or a claim about complete PNG encoding speed.

`sketchStrokes.test.ts` compares complete frames with the previous buffered calculation across 80 generated multi-stroke drawings, then repeats after edits with signed zero and nonfinite values. It checks source preservation. A 200,000-point drawing checks its exact frame and 400,000 coordinate reads, where the previous calculation needed 800,000 reads and spread an oversized argument list. Existing tests retain empty, single-point, margin and stroke tracing coverage. No quarantine applies.

The attachment workflow, visible crop and controls do not change. [Attach photos, files and sketches](../../site/content/help/attach-photos-files-and-sketches.md) was checked against `SketchPad`, `useSketch`, `sketchFile` and the final bounds helper. Attach Sketch, Color, Done and Back retain their actions, and export still attaches `Sketch.png`. Photo and folder handling are untouched. [The design agent](../../site/content/help/the-design-agent.md) was checked against the guide diff, which adds only performance implementation and coverage facts. Its sketch input, modeling, Checks, undo and steering descriptions remain accurate. Neither article contains a screenshot to revise. Both articles stay unchanged because no step, label or visible state changed.

## Seeded triangle samples keep scalar coordinates

Kernel surface sampling previously constructed one input pair and one reflected or unchanged pair per point. Passing two scalars and reflecting them directly removes 600 and 1,200 temporary arrays for 300 and 600 samples. Points, normals and result records remain independently owned. These are source-level array counts, without heap measurements or a timing claim.

`meshQuery.test.mjs` compares every point, triangle index and normal for both sizes across three seeds. An independent linear area scan selects triangles, and the historical tuple interpolation supplies expected points. Empty counts, zero-area surfaces and source preservation are checked too. Printed-label and visible-share samplers complete the same refinement. The kernel sandbox, permissions and message boundaries stay unchanged. No user workflow changes require help or screenshot updates.


## Evidence selection stops at the upload cap

A whole-app search for `uploadEvidenceFolder`, `evidenceKind`, `MAX_FOLDER_FILES` and capped filter results found one evidence-upload selector. Picked folders and loose-file overflow both use it through `components/agent/useAttachments.ts`. Other capped lists select different data and do not classify evidence files.

`evidenceFiles.test.ts` drives the uploader with 0, 7, 800 and 10,000 files, alternating unsupported binary files with supported text files. It checks complete saved paths and text, selection order, progress, totals and file-name reads. Existing coverage retains four concurrent saves and failed-file accounting. No quarantine applies.

For the 10,000-file fixture, selection reads 800 names instead of 10,000. Upload classification still reads the 400 selected names, so total name reads fall from 10,400 to 1,200. The previous selector retained 5,000 supported references before slicing to 400. The new selector retains only the final 400 references. These are deterministic operation and storage counts, not timings or a claim about complete attachment latency. Folder traversal, file reading and upload costs remain.

[Attach photos, files and sketches](../../site/content/help/attach-photos-files-and-sketches.md) was checked against the final uploader. Its 400-file cap, skipped-file counts and attachment actions stay accurate. No action, label or visible state changes, so the article and screenshots stay unchanged.


## Agent-edit production investigation

The [workspace investigation](performance-workspace.md#agent-edit-production-investigation) owns the production agent-edit profile, model-preparation change, focused coverage and remaining interaction measurement gaps. It does not establish complete workflow responsiveness or a controlled speedup.

The [current-main comparison](performance-workspace.md#current-main-opaque-texture-batching-comparison) measures ten actual composer-driven mutation streams. All candidate workloads show orbit, selection and Inspector changes before request completion. Atomic edits retain unchanged geometry identities and disjoint concurrent document edits. The final real-store checkpoint retains accepted edits and handoff content. Summed completion improves, but mesh replacement and other interaction targets remain unresolved. The deterministic CI declaration separately covers Stop, undo/redo and scene switching without adding timing assertions.

The [full-scope main 371 comparison](performance-workspace.md#full-scope-main-371-comparison) supersedes earlier source and input-scope observations. All ten completion ratios pass, and every candidate records all three controls during actual requests. Remaining interaction and resource targets keep acceptance incomplete. The original Stop and scene-switching browser assertions remain with CI.

The [final report-reuse comparison](performance-workspace.md#final-report-reuse-comparison-on-main-371) supersedes earlier candidate-source measurements. All twenty observations retain accepted edits after reopening. Remaining latency, task and joint-completion targets keep original acceptance incomplete.

## Agent entry and cancellation coverage

The [fe8b production comparison](performance-workspace.md#final-merged-workflow-comparison-on-fe8b) characterizes the final merged pipeline and engine-helper layout on pinned Node 26.13.1. All twenty observations retain accepted edits and fresh Checks after reopening. Every candidate records ordinary controls during actual requests and meets the unchanged interaction, completion and sampled-memory targets. This is one paired observation per workload, with the measurement limits recorded there. Earlier profiles and violations remain evidence for their own source hashes. The Stop and scene-switching declarations remain with CI.


## CAD part suggestions prepare words once

A whole-app search for `nearestIds`, `closeness` and word-tokenization helpers found one closest-ID suggestion implementation. Missing-ID replies from `partCode` use it with the CAD filter. Parts search, recipe search and scene queries use separate matching semantics and do not call this scorer.

For N eligible candidates and Q query words, the previous scorer tokenized the query N times and each candidate Q times. The shared helper now tokenizes the query once and each candidate once, with no filtered shared-word list. A query without words skips candidate tokenization. Duplicate query words still contribute separately. Edit distance, containment, stable ordering and the five-result cap remain unchanged.

`src/agent/agentPartRecord.test.ts` compares full suggestion lists with the historical scorer for 40 candidates, seven query forms and filtered or unfiltered inputs. It retains empty inputs, no eligible candidates and source preservation. A 100-candidate, five-word fixture measures candidate-name reads falling from 500 to 100 with identical results, then edits a name and checks fresh ranking. These are deterministic operation counts, not wall-clock or heap measurements. No quarantine applies. Edit-distance and sorting costs remain.

[The design agent](../../site/content/help/the-design-agent.md) was read against the change. Modeling, Checks, steering, undo and agent limits remain accurate. The change adds no action, label or visible state, so the article and screenshots stay unchanged.
