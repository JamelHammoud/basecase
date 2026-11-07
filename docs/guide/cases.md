# Cases

Part of the Basecase guide. [AGENTS.md](../../AGENTS.md) holds the rules every change follows and the index of these files; section numbers (§) are shared across them.

## 8h. Cases

A Case is a world with a robot slot, controls and goals that any compatible robot can enter. It lives in `src/cases/`.

- **A Case is the test.** A Skill (§8i) is a solution to it.
- **Case objects never edit parts.** They render on their own layer, and stay out of the BOM, Build Check and picking.

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

### Live drive

Drive works in the live sim, never as a physics-off puppet. A command is `{type: 'command', v: [vx, vy, wz], target?, aux?}` in `SimRequest`: forward, left and counter-clockwise turn, each −1 to 1 (ROS order), an optional end-effector target in scene mm, and `aux` (arm lift, grip). `src/sim/drive.ts` turns it into actuator targets by class, chosen by `driveAccess` (`src/sim/driveAccess.ts`) from the robot's morphology:

- **Arm:** a warm-started `solveIK` at 50 Hz in the worker, on a `Rig` cloned without `rig.parts` (`rigForWorker`). The aim moves at 0.9 × reach per second and stays inside the reach sphere.
- **Rover:** a differential mix over the `<velocity>` wheel actuators. Each wheel's spin sign is `(axis × up) · forward`, so reversed axes still roll forward; its lateral offset is from the wheels' centre along the robot's left.
- **Legs (four or more):** `src/sim/driveLegs.ts` bakes stand, forward, strafe and turn cycles with `buildGait` (per-foot directions, true alternating phases for six feet, point feet), then blends them by command each tick, ramping in from the pose over 0.5 s. Drive unlocks only after a 5 s headless fall check (`fallCheckPassed`: no fall, tilt under 35°, at least 3 cm forward, height above 60%). The fixture hexapod and all three quadrupeds pass; the weak quadruped is refused.
- **Two legs:** “Two-legged robots can't balance on a scripted walk. Drive needs a trained policy.” Wheels on legs get the same kind of refusal. Stand, Push and Grab stay.

`useDrive` (`src/sim/useDrive.ts`) owns the drive state and the fall check; `useDriveKeys` (`src/workspace/useDriveKeys.ts`) reads W A S D or the arrows, Q E, Space, R (start over: `engine.respawn` puts the robot back without touching the world) and Esc (stop). While driving, `useWorkspaceKeys` runs no plain or ⌘ key, so S, F, Backspace and undo never edit parts (any parts edit still stops the sim). Keys zero on window blur and when the page hides; with a text field focused the canvas says “Click the canvas to drive”, and a click on the canvas takes focus back. Gamepads are read in the sim's frame handler (`frameHookRef`), with no extra animation frame; a stick inside its deadzone never overrides the keys.

The canvas overlay (`DriveOverlay`) shows “Fell. Press R.”, speed in m/s for robots that move around, and Esc to exit. The camera follows the robot's base (`followPart`, `FollowCamera`), and the key light keeps fitting while it follows.

### Tries

A try records at 50 Hz in the worker (`src/sim/recorder.ts`, hung on `SimEngine.stepHook`, the second step slot): time, actions, qpos, qvel and every body's pose (kinematics refreshed first, so poses match qpos). It ends when the Case's time runs out, on End Try, or when driving stops. `scoreTry` runs the Case's probes and contract over it; `tryManifest` stores the Case and model hashes, seed, frame count and step. Recordings live in IndexedDB (`basecase-tries`, `src/cases/tryStore.ts`); `project.tries` holds only the records and `sharedScene` strips them from `.basecase` files, like policies. Replay sets the recorded qpos frame by frame in the worker.

The filmstrip (`src/cases/filmstrip.ts`, drawn by `filmstrip.worker.ts` on an `OffscreenCanvas`) projects each part's box and the world's objects at four moments of a try, in the same three-quarter view as captures. Results list tries worst first.

### In the app

- **Cases view** in the rail (§5).
- **Simulate tab** with a Case open: **Brief** (name, brief, Close), **Robot fit** (Check Fit: fits this Case, compiles, settles 1.5 s, body class, fall check; never restates Ready to build), **Try** (Try It, a clock, End Try, the keys), **Emulated robot** while one is connected (§8k: its rung, the newest daemon message and the servos; from Test up it follows the live sim), **Control**, **Train** (a fixed robot gets “Stand and Walk train robots that move around. This one is fixed in place.” instead of a Train button), **Results**, then the Result, Model and Policies sections as before. Without a Case, Control has Drive.
- ⌘K: Show Cases, Drive or Stop Driving, Start Over, Try ⟨Case⟩.
- `e2e/drive.e2e.test.ts` drives the rover, arm and hexapod in the real app, checks the biped refusal, key gating and the composer prompt, and records a try. The e2e harness allows the real `node_modules` path, so the MuJoCo WASM loads from a worktree whose `node_modules` is a link.

### Web gallery

`app.basecase.so/c/<slug>` opens one Case in the browser. `src/webMain.ts` reads the slug (`gallerySlug`: letters, digits and dashes only) before anything heavy loads; phones keep the landing page. The gallery page (`src/gallery/`) is its own small app: the canvas, the Case card (name, brief, Drive, See Inside) and the drive overlay. It starts the simulator as soon as the canvas is up, so MuJoCo's WASM is fetched while the visitor reads. Nothing autosaves; See Inside saves the scene once into the web app's IndexedDB, opens it as the first tab and goes to the studio.

- **Bundles** (`public/gallery/<slug>.json`, `index.json`) carry everything they need: the robot's parts and joints and the Case, validated by `parseGalleryBundle` on read. `npm run gallery` (`tools/gallery/build.mjs`, entries in `src/gallery/galleryEntries.ts`) writes them; a unit test fails when they drift from the code. A Case with meshes or a trained policy must inline them in its bundle, because `webBackend.ts` serves no policies.
- **Budgets** (`npm run perf:gallery`, `tools/perf/galleryBench.mjs`, production web build in headless Chrome): at most 8 MB compressed before driving, Drive working within 6 s of opening the link, and the live sim at real time (0.97× or better on its smoothed meter). Last run: rover 3.5 MB, 0.8 s, 1.00×; hexapod 6.7 MB (the fall check's worker fetches the WASM a second time), 1.0 s, 1.00×; arm 3.8 MB, 0.6 s, 1.00×.
- `e2e/gallery.e2e.test.ts` runs the web build mode (`IS_WEB_DEMO`): drives the rover, checks real time, See Inside, the phone landing and a wrong link.
