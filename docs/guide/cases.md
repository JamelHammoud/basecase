# Cases

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8h. Cases

A Case is a world with a robot slot, controls and goals that any compatible robot can enter. It lives in `src/cases/`.

- **A Case is the test.** A Skill (§8i) is a solution to it.
- **Case objects never edit parts.** They render on their own layer, and stay out of the BOM, Build Check and picking.
- **Every Case says "Tried in simulation only"** until a real robot has earned otherwise (§0k).

### Format

`src/cases/schema.ts` holds the Case type and `parseCase`, a hand validator that fails closed. A file with another `formatVersion`, an unknown shape, too many objects or a non-finite number throws, in plain words. A Case holds:

- **Slot:** the capabilities it needs (`arm`, `wheels`, `legs`), the bindings it was authored with (end effector, wheels, base), and the reach and anchor its world was authored at. `src/cases/robotFit.ts` works out what a robot has; `slotRefusal` says plainly why one doesn't fit. A bound end effector only counts on a robot where that part ends a chain, otherwise the fit finds its own.
- **World:** `ScenePart`-shaped objects (`worldItem`), each `static`, `dynamic` or `marker` (no collision). `src/cases/scale.ts` scales the whole world and the reference about the anchor to the entering robot's reach, so one Case runs on arms of different sizes.
- **Controls:** typed inputs (`move`, `turn`, `lift`, `grip`).
- **Reference:** a command timeline. An empty one must not pass, and the Stage 2 gate's canary checks that.
- **Task:** seconds, probes (distances that become trace signals) and a task contract.

`src/cases/contract.ts` mirrors the contract shape in §8i with a small local evaluator behind `ContractEvaluator`, so `src/skills/contract.ts` can replace it without changing a Case. `runCase` (`src/cases/runCase.ts`) runs a Case headless in Node or a worker: it checks the fit, scales the world, builds the model, drives it and evaluates the trace.

### World layer

World items go into `MjcfInput.world`, written by `src/sim/mjcfWorld.ts`. They are bodies in `SimModel.bodies` with `parts: []` and `world: [id]`, so `simDeltas` never sees them and `worldDeltas` gives their poses. They never join `parts`, so they skip the BOM, checks and stop-on-edit.

On the canvas they live in a second `PartLayer` on `stage.worldRoot` (`ViewportProps.worldParts`). Picking, USDZ export, interference, measures and framing all read `ctx.layer` and `partsRoot`, so they never see the world. Silhouette, label and `onlyIds` captures hide it. `setPose(deltas, worldDeltas)` routes poses to both layers.
