# Performance plan: a UI thread that never blocks

Goal: the app stays at 60 fps and answers every click while the agent works, however big the scene. No main-thread task over 50 ms during an agent run, on any scene the agent can build.

This is the Figma model applied to Basecase: the UI thread only takes input and draws; every computation that scales with triangles or pixels runs elsewhere, on shared data, in parallel, in WebAssembly where JS is too slow.

## What freezes today (measured)

Production build, Apple M5 Pro (Metal), the 281-part Ribbit scene (19 joints, 312k CAD triangles). A headless replay (`scratch/perf/agent.mjs`) feeds the renderer the same `agent-request` and `acp-session-update` events a real run sends, and records long tasks and frame gaps.

| Agent action (tool) | UI frozen for | Where |
|---|---|---|
| `verify_design` (`verify`) | **12.7 s**, one task | `runEngineeringNow` → range-of-motion `sweepClashes` → `findInterferences` per angle step |
| `check_scene` (`interference`) | **1.3 s** | `findInterferences`: 0.9 s in `penetration`/`isInside` raycasts, the rest rebuilding world-space BVHs |
| `get_bom` (`bom`) | 0.6–0.7 s | `buildPrintReport` → `checkPrintability`: 6 orientations × raycasts, BVH builds |
| `look` / `compare` (`screenshot`) | 0.2–0.4 s per call | `captureViews` renders with the live renderer, then `toDataURL('image/png')` on the main thread |
| Every edit (`apply`), 1.2 s later | 0.1–0.15 s renderer + 0.06–0.1 s Electron main | Autosave sends the whole scene (10 MB here, 43 MB for the biggest saved scene) as one string; main parses, re-stringifies and `writeFileSync`s it, plus `design-spec.json` pretty-printed |
| First shadow render after load | 0.42 s | A shadow program still compiles on first use (`getProgramInfoLog`), despite `warmShaders` |
| Chat streaming | **0** | 4,359 updates at 80/s into one growing transcript (110k characters, 11k DOM nodes): no long task, no frame over 17 ms |
| `model_part` (place, then its automatic `check_scene` on the new part) | 0.06 s max | The geometry worker usually finishes the part during the op's pacing sleeps |
| `pose`, `animate`, `simulate` | not measured | The same paths as above, repeated: `animate` runs a whole-scene interference, then 8 × (`setPose` + interference + floor check), then up to 8 renders |

What this rules out:
- **React and the transcript aren't the cause, on this machine.** Streaming is clean. The code still does avoidable work per chunk (step 7 of Phase 1) that a slower Mac will feel, but it won't fix the freezes.
- **Rendering isn't the cause.** Idle and streaming frames hold 16.7 ms on a 281-part scene. A C++ renderer would not remove one of the freezes above.
- **The cause is about five computations** run synchronously in the renderer's request handlers, several of them doing the same expensive setup (world-space BVHs) on every call.

Not covered by the headless replay (Electron only): IPC structured-clone of big payloads, and anything else on the Electron main process. Phase 0 adds that.

## What Figma does, and what transfers

- Figma's editor is C++ compiled to WebAssembly with its own WebGL (now WebGPU) renderer; React only draws the chrome. Its speed comes from three things: memory it controls (one typed-array heap, no GC on the hot path), GPU state it keeps instead of rebuilding, and loading less (pages on demand). WebAssembly mostly bought load time (3×), not steady-state speed. ([Building a professional design tool on the web](https://madebyevan.com/figma/building-a-professional-design-tool-on-the-web/), [WebAssembly cut Figma's load time by 3×](https://www.figma.com/blog/webassembly-cut-figmas-load-time-by-3x/), [Figma rendering powered by WebGPU](https://www.figma.com/blog/figma-rendering-powered-by-webgpu/), [one page at a time](https://www.figma.com/blog/speeding-up-file-load-times-one-page-at-a-time/))
- Figma benchmarks real files in Electron on every commit and tracks the **worst** frame, plus any operation that freezes over 100 ms. ([Figma, faster](https://www.figma.com/blog/figma-faster/))
- Onshape keeps the kernel on servers and sends the client triangles: the split Basecase already has with its kernel child processes. ([How does Onshape really work](https://www.onshape.com/en/blog/how-does-onshape-really-work))
- VS Code moved everything heavy out of Electron's main process into utility processes that talk to the renderer over MessagePorts: "a busy main process can result in an unresponsive user interface." ([VS Code sandbox](https://code.visualstudio.com/blogs/2022/11/28/vscode-sandbox), [utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process))

What transfers: Figma's **discipline** (nothing heavy on the UI thread, shared memory instead of copies, native-speed code where JS is slow, worst-frame benchmarks), not a rewrite of the editor in C++. The scene model, React UI and three.js viewport stay.

## The target architecture

```
 Renderer main thread          input, React, live viewport draw, gizmo; nothing O(triangles)
   │  part identities + transforms (tiny messages)
   ▼
 Scene geometry store          positions / indices / BVHs per geometry key, in SharedArrayBuffers
   ▲            ▲            ▲
 Analysis      Capture       Geometry / thumbnail / guide workers (exist today)
 workers ×N    worker
 interference, renders for look / compare, silhouettes,
 sweeps, print  encoded to WebP/JPEG in the worker
 (JS → WASM)

 Electron main                 windows and menus only
 Utility process               library, autosave, agent bridge, ACP; MessagePort to the renderer
```

## Phase 0. Measure every change (first, small)

- Turn the replay into a committed benchmark, `npm run perf:agent`: production build, a fixture scene built in code (a robot preset plus a few hundred CAD parts made by the geometry ops, so it runs on a clean clone), the same request sequence, and a pass/fail budget: no long task over 100 ms now, 50 ms once Phase 2 lands. Report the worst frame and each tool's latency, like Figma's per-commit benchmark.
- An Electron variant that runs the same events through the real main process and IPC, and logs main-process event-loop delay (`perf_hooks.monitorEventLoopDelay`).
- A dev-only long-task log in the app: any task over 100 ms during an agent run is written with the request kind that was in flight.

## Phase 1. Get it off the UI thread (biggest win, JS only)

Every agent request handler becomes: snapshot the plain data it needs (parts are immutable, so this is a list of identities and transforms), post it to a worker, await the result. The live scene is never mutated for a computation again (today `sweepClashes` moves live objects and puts them back, which pins it to the main thread).

1. **Analysis worker pool** (`navigator.hardwareConcurrency − 2`, at least 2), built on the existing `workerRpc` and `packedMesh`:
   - Geometry is sent once per geometry key (the same keys `partMesh/sharedGeometry.ts` already uses) as transferable typed arrays, with its BVH built and serialized in the worker (`MeshBVH.serialize`). After that a request carries only part ids, geometry keys and matrices.
   - Moves here: `findInterferences` (`check_scene`), the range-of-motion sweeps (`verify`), `buildPrintReport` / `checkPrintability` (`get_bom`, `check_printability`), `measureParts` / `partTriangles`, `maskProfile` / `photoProfile`, wall-thickness rays.
   - Sweeps fan out: one joint per worker, angles computed from the joint frame with plain matrices, no scene graph.
2. **Fix the algorithm while moving it** (most of the 12.7 s is repeated setup, not the test):
   - Build each BVH once in the part's local frame and cache it by geometry key; test pairs with relative matrices (`bvh.intersectsGeometry(other, matrix)`, `bvh.shapecast`) instead of baking world-space copies per call and per sweep angle (`buildSolids` / `worldGeometry`).
   - Broad phase first: a sorted AABB sweep over moving vs static parts per angle, so only overlapping pairs reach the narrow phase.
   - Penetration depth only for pairs that actually intersect; today `penetration` raycasts sample points (`isInside`, several rays each) for every overlapping box pair.
   - Coarse to fine angles: test every 10°, refine only around a hit.
   - Cache what `verify` recomputes from scratch each run: `measureParts` (whole scene) and `servoOutput` (a `Vector3` per vertex), both keyed by part identity.
3. **Captures in their own worker** (`look`, `compare`, pose and sim tool images, silhouette masks), reusing `thumbnail.worker`'s OffscreenCanvas renderer and `renderPartGroups`, with the viewport's lighting and review settings. Render straight at the size the agent gets (768–1024 px; today it's the drawing buffer at up to 2× pixel ratio) and encode once with `convertToBlob` (WebP or JPEG), so the PNG `toDataURL` → decode → `downscaleDataUrl` round trip goes away. The live viewport keeps drawing while the agent looks.
4. **Autosave sends changes, not the scene:**
   - The renderer sends only parts whose identity changed since the last save (`sceneJson` already knows), serialized in a worker.
   - The backend keeps the scene as one file per part plus a small index (or an append-only patch log compacted when the scene closes), written with `fs.promises`, off the main process (step 5).
   - `design-spec.json` and `DESIGN_BRIEF.md` are written at most every few seconds, compact, and never on the main process. `buildAIHandoffPayload` (synchronous, O(parts²) relationship inference) moves to the same worker.
5. **Move the backend out of Electron's main process** into a `utilityProcess` (library, autosave, the agent bridge, ACP sessions, conversations), talking to the renderer over a MessagePort like VS Code does. Main keeps windows, menus and the dock. Replace the remaining sync `fs` calls in hot paths (`sceneLibrary.save`, `conversations`, `aiReference`) with async ones.
6. **Close the shader warm-up gap:** find the shadow-pass program that still compiles on first use and add its material variant to `warmShaders`.
7. **Renderer hygiene** (each small; together they stop slower machines from feeling the agent):
   - **CAD meshes as binary end to end.** `model_part` geometry travels as JSON number arrays: MCP → HTTP → `JSON.parse` on Electron main → structured clone → `cadMeshToScene` → `Float32Array.from`. Send base64 or binary bodies, forward `ArrayBuffer`s, and convert frames in the geometry worker.
   - **Never force a build onto the main thread.** `complete()` (`NEEDS_WHOLE_SCENE`) calls `buildAll`, which builds parts still waiting for the worker's `preparePart` on the main thread (creased normals, O(triangles)) and wastes the worker's copy. It should await the in-flight prepares instead; queries become async, which Phase 1 needs anyway.
   - **Batch ACP updates per animation frame.** Each chunk is its own IPC message and its own `setLanes` at the workspace root, re-rendering `SceneWorkspace` and all its hooks; `acpTranscript` copies the message and segment arrays and appends the text twice per chunk.
   - **Fix React Compiler bail-outs:** `useLaneControls.ts` (fails to compile, so `controls` and the `agent` object are new on every render and RightPanel, CanvasCard and SceneViewport re-render), plus `ConnectionBanner`, `ChecksSection`, `RobotsPanel`, `Slider` and `useTraining`. Add a check that fails `npm run check` when a component or hook doesn't compile.
   - **Transcript:** `PartLinksProvider` builds a new part index on every commit, which gives every `Markdown` segment new plugins, so each agent edit re-parses and regex-scans the whole transcript; key the index by part names, not part identity. Mount tool-step details (`CodeBlock`, one span per token, up to 40k characters per `model_part`) only when opened. Memoize markdown per block so only the streaming block re-parses. Drop the two forced layouts per update (`useFeedFollow` writes `scrollTop`, `ThoughtBlock` reads `scrollHeight` and sets state).
   - **Render loop:** `Viewport3D` calls `engine.update` after every React render with an unconditional `invalidate()` (a full render plus shadow pass even when nothing changed); the 1 s idle refresh redraws shadows forever; each `AgentCursor` runs its own rAF and reads `clientWidth` every frame. Invalidate only on real changes, drop the idle refresh once nothing depends on it, and move cursors into one per-frame update driven by `RenderLoop.afterRender`.

Expected result: no agent tool freezes the UI; tools get faster too (parallel sweeps, cached BVHs). `verify` should go from 12.7 s frozen to about 1–2 s in the background on Ribbit.

## Phase 2. WebAssembly where JS is the limit

Only after Phase 1 is measured. JS in workers fixes the freezes; WebAssembly makes the tools fast enough to run often (on every agent edit, live in the Build tab).

1. **Cross-origin isolation in Electron**, so workers can share memory: serve the app through a custom protocol (`protocol.handle`) with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` (Hugging Face thumbnails have no CORP header), and check `self.crossOriginIsolated` at startup. Pin an Electron release with the isolation fix (electron/electron#50242, fixed in 41-x and 42-x after Apr 30, 2026).
2. **Shared geometry store:** part geometry lives once in SharedArrayBuffer arenas, keyed like `sharedGeometry`; the viewport, analysis, capture, thumbnail and guide workers all read it without copies. This is the part of "the document in WASM memory" that matters here: one copy of the heavy data, no GC over it, no structured clones. It also enables `ParallelMeshBVHWorker` (2–4× faster BVH builds).
3. **Collision kernel in Rust → WASM** (SIMD + threads), replacing the narrow phase from Phase 1 behind the same worker API: BVH-vs-BVH triangle overlap, penetration depth for colliding pairs, and swept tests. [parry3d](https://parry.rs) is the starting point (TriMesh BVHs, intersection tests, contacts); a custom triangle-triangle SAT kernel if parry's mesh-mesh penetration is too coarse. Reads triangles straight from the shared store.
4. **Booleans:** `three-bvh-csg` (recesses, Union / Subtract / Intersect) moves to [manifold-3d](https://github.com/elalish/manifold) in the geometry worker. It's the kernel OpenSCAD already runs here with `--backend=manifold`, so results match.
5. **Printability rays** run on the same WASM BVH.

## Phase 3. The viewport on its own thread

Move the live `Viewport3D` engine into a render worker with `transferControlToOffscreen`, so the canvas keeps drawing whatever React or the main thread is doing. Phase 1 makes "nothing heavy on the UI thread" a rule; Phase 3 makes smooth drawing a property of the architecture, so a future slip costs a slow panel, not a frozen canvas.

What it doesn't change: input events always arrive on the main thread first, so a blocked main thread still can't orbit. Phase 1's rule stays mandatory.

1. **Render worker.** The engine (`src/three/viewport/`) already is plain TypeScript behind a thin component; it moves whole into a worker and reads part geometry from the shared store (Phase 2), so there's still one copy. `Viewport3DHandle` becomes an async RPC; the methods that return data (captures, measurements, picking, framing) already go through `complete()` and become awaits.
2. **Input proxy.** Pointer, wheel (trackpad pinch arrives as `ctrlKey` wheel), key and resize events are forwarded as small messages, with `preventDefault` decided on the main thread from state the worker publishes (gizmo hovered, tool active). OrbitControls, TransformControls, marquee and sculpt run in the worker against a proxy element.
3. **Overlays that never trail the canvas.** Pins, measurement and mark labels, scale figures' fields and agent cursors are HTML over the canvas today, positioned after each render. In the worker they'd lag a frame while orbiting. Labels and cursors that only need to be drawn become canvas sprites (marks already are); the ones that take input (comment cards, the label field) read their screen positions from a SharedArrayBuffer the worker writes every frame, applied in the same `requestAnimationFrame`.
4. **Picking is async.** Hover and click hit-tests run in the worker and answer within the frame; selection code awaits them. Drag and drop asks the worker for the drop point.
5. **Fallback.** Where OffscreenCanvas or shared memory is missing (tests, Node), the same engine runs on the main thread, like `workerRpc` does today.

## Order, and why

All three phases ship; the order is fixed because each builds what the next one needs.

1. **Phase 1 first:** its worker API (plain data in, plain data out, no live-scene mutation) is the seam the WASM collision kernel plugs into. Writing the kernel against today's API, which moves live objects to sweep, would mean writing it twice.
2. **Phase 2 next:** the shared geometry store is what the render worker reads. Without it, Phase 3 adds another full copy of every scene in memory (a 43 MB scene is already copied into the viewport and each worker).
3. **Phase 3 last:** it moves an engine whose queries Phase 1 has already made async.

The benchmark (Phase 0) decides the details of each phase (which narrow-phase tests go to WASM first, which overlays become sprites), not whether a phase happens.

Independent pieces run in parallel where they touch separate files:
- Electron backend: autosave deltas, the `utilityProcess` move, async writes and cross-origin isolation (Phase 1 steps 4–5, Phase 2 step 1). All in `electron/` plus `useAutosave` / `sceneJson`.
- The Rust collision kernel (Phase 2 step 3), built and tested on its own against the JS results before it's wired in.
- The viewport engine work (Phase 1 steps 1–3, then Phase 3), one owner at a time, since both change `src/three/viewport/`.

## Not planned

- **Rewriting the editor in C++** (document model, React UI and scene in WASM). Figma spent years on its engine for wins (GC-free memory, a retained renderer, loading less) that Phases 2–3 give us selectively: shared typed-array geometry, a render thread, native-speed kernels in workers.
- **Pausing or deferring the agent's work to keep frames smooth.** Work moves off the thread instead.

## Rules this adds to AGENTS.md §0f (when Phase 1 lands)

- Agent request handlers never do work that scales with triangles or pixels on the main thread. They snapshot plain data and await a worker.
- Computations never mutate the live scene to measure something; they use matrices on cached geometry.
- BVHs are built once per geometry key, in a worker, and reused.
- Captures render and encode in the capture worker; nothing calls `toDataURL` on the main thread.
- Autosave and library writes send only what changed and never block Electron's main process.
- `npm run perf:agent` passes before any change to agent tools, captures, autosave or the viewport ships.
