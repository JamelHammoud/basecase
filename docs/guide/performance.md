# Performance

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files. Section numbers (§) are shared across them.

## 0f. Performance (mandatory)

The app must feel instant. These rules came out of profiling real scenes (60+ CAD parts, 50+ MB saved files). Keep the shared requirements here.

- Keep parts immutable. Replace a part object to change it. Diff the viewport by identity, retain unchanged geometry and release removed resources.
- Heavy geometry, engineering checks, captures, thumbnails, printing and dataset preparation run in workers. Make renderer work cheap. Never pause, throttle or defer loading to hide its cost.
- Render on demand. Never add an always-on `requestAnimationFrame` loop. Hidden views and unchanged data do no work.
- Transfer binary buffers between workers. Keep IPC and HTTP payloads small, list summaries and load full records only when needed.
- Cache by immutable input identity or shape key. Bound temporary storage and clear operation-local indices after the operation.
- Keep boot independent of the agent connection and work the first frame does not need.

- **Heavy work never blocks a click.** Cache by input identity (a `WeakMap` on immutable parts, or shape keys) and spread uncached work across frames with `await` between small chunks (`components/build/useBuildReport.ts`). Profile anything over 16 ms.
- **React Compiler friendliness** (§0c) is a performance rule: one rule break makes the compiler skip the whole component, and everything under it re-renders on every change. One that isn't a Rules of React break: the compiler can't lower `try` without `catch`, so a handler in a component that resets a flag after an awaited call chains `.finally(...)` instead (`agent/ConnectionBanner.tsx`).
- **Measure in production:** `npm run build && npm run preview`, then time interactions with a `PerformanceObserver` for `longtask` entries. Dev mode adds 30–130 ms per interaction and misleads.

## Where performance facts belong

Read the owning area's guide before changing its implementation. Put implementation facts there and measurements in its existing subsystem note below. Keep the method, fixture sizes, hardware, before and after values, limitations and test links together. Operation counts are not timings, and local timings are not CI results.

Update the relevant section in those files. A refinement within an existing subsystem does not edit this guide, the root index or a registry. Reuse the subsystem note across pull requests. Add navigation here only when a new subsystem has no existing home. Cross-subsystem helpers have one evidence owner, with links from their consumers when needed.

| Subsystem | Implementation | Measurements and limits |
| --- | --- | --- |
| Case facts and world geometry | [Guide](cases.md#performance-case-facts-and-world-geometry) | [Evidence](../notes/performance-cases.md) |
| Image comparison | [Guide](agent.md#performance-image-comparison) | [Evidence](../notes/performance-image-comparison.md) |
| Vision inference | [Guide](cameras.md#performance-vision-inference) | [Evidence](../notes/performance-vision-inference.md) |
| Onshape imports | [Guide](joints-and-motion.md#performance-onshape-imports) | [Evidence](../notes/performance-onshape.md) |
| Vision training | [Guide](cases.md#performance-vision-training) | [Evidence](../notes/performance-vision-training.md) |
| Agent and CAD kernel | [Guide](agent.md#performance-agent-and-cad-kernel) | [Evidence](../notes/performance-agent-kernel.md) |
| Gesture recognition | [Guide](cameras.md#performance-gesture-recognition) | [Evidence](../notes/performance-gestures.md) |
| Camera mat tracking | [Guide](cameras.md#performance-camera-mat-tracking) | [Evidence](../notes/performance-camera-mat.md) |
| Strength and Lighten | [Guide](build.md#performance-strength-and-lighten) | [Evidence](../notes/performance-strength.md) |
| Dataset preparation | [Guide](cases.md#performance-dataset-preparation) | [Evidence](../notes/performance-datasets.md) |
| Calibration and body properties | [Guide](robot-runtime.md#performance-calibration-and-body-properties) | [Evidence](../notes/performance-calibration.md) |
| Mirror | [Guide](inspector-and-selection.md#performance-mirror) | [Evidence](../notes/performance-mirror.md) |
| Engineering calculations | [Guide](build.md#performance-engineering-calculations) | [Evidence](../notes/performance-engineering.md) |
| Print planning and labels | [Guide](printing.md#performance-print-planning-and-labels) | [Evidence](../notes/performance-printing.md) |
| Robot shells | [Guide](joints-and-motion.md#performance-robot-shells) | [Evidence](../notes/performance-wrap.md) |
| Joints and kinematics | [Guide](joints-and-motion.md#performance-joints-and-kinematics) | [Evidence](../notes/performance-joints.md) |
| Sketch | [Guide](inspector-and-selection.md#performance-sketch) | [Evidence](../notes/performance-sketch.md) |
| Motion fitting and retargeting | [Guide](joints-and-motion.md#performance-motion-fitting-and-retargeting) | [Evidence](../notes/performance-motion.md) |
| Assembly and repair planning | [Guide](build.md#performance-assembly-and-repair-planning) | [Evidence](../notes/performance-assembly.md) |
| Recorded signals and playback | [Guide](cases.md#performance-recorded-signals-and-playback) | [Evidence](../notes/performance-playback.md) |
| Simulation | [Guide](simulate.md#performance-simulation) | [Evidence](../notes/performance-simulation.md) |
| Mesh preparation | [Guide](canvas.md#performance-mesh-preparation) | [Evidence](../notes/performance-geometry.md) |
| Cable routing | [Guide](build.md#performance-cable-routing) | [Evidence](../notes/performance-wiring.md) |
| Sheet manufacturing | [Guide](build.md#performance-sheet-manufacturing) | [Evidence](../notes/performance-sheet.md) |
| Sensor layers and mapping | [Guide](canvas.md#performance-sensor-layers-and-mapping) | [Evidence](../notes/performance-mapping.md) |
| Collision analysis | [Guide](build.md#performance-collision-analysis) | [Evidence](../notes/performance-collision.md) |
| Skill feasibility and moves | [Guide](skills.md#performance-skill-feasibility-and-moves) | [Evidence](../notes/performance-skills.md) |
| Scene storage and startup | [Guide](scene-tabs.md#performance-scene-storage-and-startup) | [Evidence](../notes/performance-workspace.md) |
| Viewport rendering | [Guide](canvas.md#performance-viewport-rendering) | [Evidence](../notes/performance-viewport.md) |
| Annotation projection | [Guide](annotations.md#performance-annotation-projection) | [Evidence](../notes/performance-annotations.md) |
| Panels and Layers | [Guide](layout.md#performance-panels-and-layers) | [Evidence](../notes/performance-layout.md) |
| Selection | [Guide](inspector-and-selection.md#performance-selection) | [Evidence](../notes/performance-selection.md) |
| Trace plots | [Guide](design-system.md#performance-trace-plots) | [Evidence](../notes/performance-plots.md) |
