# The robotics loop

Goal: take a robot from idea to a working machine without leaving Basecase. Codex did this for code by building on VS Code. We do it for robots by building MuJoCo, the physics engine robotics research runs on, into the studio.

## The six stages

| # | Stage | What you do | In Basecase |
|---|---|---|---|
| 1 | **Design** | Describe or sketch the robot; Claude models it with real parts | Done: Agent, Parts, CAD kernel, Library |
| 2 | **Engineer** | Declare joints, pose it, check torque, range, stability, printability and budget | Done: Pose tab, Build tab |
| 3 | **Simulate** | Run it under physics: does it stand, do the servos hold, does the walk cycle walk | **Now** |
| 4 | **Train** | Teach it a skill in sim (stand, walk, reach), randomized so it works on the real robot | **Now** |
| 5 | **Build** | Print the plates, buy the parts, assemble | Partly: BOM, budget and print estimates. Missing: slicer handoff, assembly steps |
| 6 | **Operate** | Drive it by hand (teleop), run the trained policy, record every run | Later |

Two loops tie the stages together:

- **Fix loop (stages 1–4):** a failed check, a fall in sim or a policy that won't learn sends you back to Design. Repeat until stages 2–4 pass. Fixing isn't a stage of its own; it's this loop.
- **Reality loop (stages 3–6):** runs on the real robot are recorded, then used to calibrate the sim (mass, friction, servo response) and retrain. Collecting data isn't the end of the line; it starts the next round.

```
Design → Engineer → Simulate → Train → Build → Operate
  ↑__________fix__________|________|            |
                 ↑______calibrate + retrain_____|
```

## Stage 3: Simulate

Turn the scene into a MuJoCo model and run it on the canvas.

### S1. Physics model from the scene
- `utils/mjcf.ts` writes MJCF from what the scene already knows:
  - one body per link (`buildRig` → `ownerOf`)
  - mesh geoms from each part's triangles (`partTriangles`)
  - masses from `partMasses` (catalog weights, printed grams, published link masses)
  - hinge and slide joints with their ranges
  - position actuators with force limits from the servo's stall torque (`actuatorOf`), or the published `effortNm`
  - a floor and a free joint at the base
- **Export ▸ MuJoCo Model:** the MJCF and its meshes, ready for any MuJoCo tool.
- **Done when:** every `ROBOT_PRESET` and the `build-humanoid` bench scene load with no errors, and the model's total mass matches the Weight check.

### S2. Live sim on the canvas
- `@mujoco/mujoco` (DeepMind's official WebAssembly bindings, single-threaded build, so no special headers) runs in a Web Worker.
- The worker streams body poses into `Viewport3D.setPose`, the path animation playback already uses. The sim never edits parts.
- Controls: Play, Pause, Reset. Servos hold the current pose or follow an animation. Drag a part to push the robot.
- Stopping returns the canvas to the pose it had before.
- **UI placement is decided here.** The 328px right panel has no room for a fifth tab, so the options are a toolbar Play control or a Motion tab that holds Pose and Simulate.
- **Done when:** a preset humanoid stands on the canvas at real time, and pushing it makes it fall believably.

### S3. Sim checks
New rows in Build → Checks, with the same Pass / Warn / Fail rows that select their parts:
- **Stands:** holds the modeled pose for 5 s (base tilt, height drop).
- **Walks:** the walk cycle under physics (distance covered, falls).
- **Torque in motion:** peak actuator force against stall over the run.
- **Joint limits:** which joints hit their stops.

**Done when:** the checks agree with the static Servo torque and Standing stability checks on a robot that passes both, and catch a robot that only fails under motion.

### S4. Agent in the loop
- A `simulate` tool (stand, drop, or an animation id) returns the check rows and a few frames, so Claude can fix a design from what the sim shows.
- **Done when:** a bench run uses `simulate` and changes the design because of what it found.

### S5. Objects to work with (SimReady)
- The Objects view and `find_objects` / `insert_object` bring in real props from NVIDIA SimReady Central with the maker's mass, friction and colliders; the Robots view adds makers' arms and grippers with their joints (AGENTS.md §8e).
- In the sim, objects are free bodies: they fall, slide and can be pushed or grasped.
- **Next:** Reach and Pick training tasks aimed at an object in the scene (T1), with the object's pose randomized.

## Stage 4: Train

### T1. Tasks, not reward code
- Pick **Stand**, **Walk** (follow a speed and heading) or **Reach** (move a hand to a point).
- Rewards are built from the rig: feet (`detectFeet`), the base body, limbs. Nobody writes a reward by hand.

### T2. Trainer
- PPO (the standard reinforcement-learning algorithm for locomotion) on the S1 model.
- **Randomization is on by default:** mass, friction, servo strength, latency, backlash and pushes. That's what makes a policy work outside the sim.
- Training runs outside the renderer and never blocks the canvas. Progress (reward, episode length) streams to the UI.

### T3. Policies
- Saved per scene in `library/policies/<id>/`: the ONNX network, its observation and action spec, and the training settings.
- A policy plays on the canvas in the live sim (S2).

### T4. Handoff to Operate
- Export the policy, the MJCF and a joint map (servo ids, zero offsets, directions): everything stage 6 needs to run it on the real robot.

**Done when:** a preset quadruped (Go2) trains to walk, and the policy walks in the live sim with randomization on.

## Open decision: where training runs

S1–S3 don't depend on this; T2 does.

| Option | Setup | Speed | Notes |
|---|---|---|---|
| **In the app** | MuJoCo WASM in worker threads + PPO in JS | Slowest | No install; fine for Stand, slow for Walk |
| **On the Mac, native** | Python sidecar (`mujoco` + PyTorch), started like the CAD kernel's child process | Several times faster | One-time install; the standard robotics ecosystem |
| **Cloud GPU** | MuJoCo Playground / MJX | Minutes for walking | Costs money and needs an account |

The same MJCF works for all three, so starting with one doesn't block the others.

## Rules for this work

These rules are also in AGENTS.md §8d.

- **One engine, one model.** MuJoCo runs the live sim, the checks, training and export, all from the same generated MJCF. What you train is what you saw.
- **The scene is the source of truth.** MJCF is generated, never edited by hand. Fix the design, not the model file.
- **Simulating never edits parts.** Like posing, it only changes what the canvas shows.
- **Numbers come from the scene's data** (§8b masses, actuator specs, published limits), and estimates are labelled.
- **MuJoCo collides convex hulls.** Exact self-collision stays with the mesh sweeps in `three/interference.ts`.

Grounding: [design_verification_simulation.md](research/LLM%20robot%20design%20and%20BOM/design_verification_simulation.md) §1–2 (MJCF writer, `@mujoco/mujoco`, collision filtering, why a direct writer beats a CAD round-trip).
