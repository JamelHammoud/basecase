# The robotics loop

Goal: take a robot from idea to a working machine without leaving Basecase. Codex did this for code by building on VS Code. We do it for robots by building MuJoCo, the physics engine robotics research runs on, into the studio.

## The six stages

| # | Stage | What you do | In Basecase |
|---|---|---|---|
| 1 | **Design** | Describe or sketch the robot; Claude models it with real parts | Done: Agent, Parts, CAD kernel, Library |
| 2 | **Engineer** | Declare joints, pose it, check torque, range, stability, printability and budget | Done: Pose tab, Build tab |
| 3 | **Simulate** | Run it under physics: does it stand, do the servos hold, does the walk cycle walk | **Now.** Live sim, checks, measured servo models for the STS3215 and XL330 ([Simulate](guide/simulate.md) §8d), Cases with live drive and the web gallery ([Cases](guide/cases.md) §8h): one Case file runs on any fitting arm, and every Case the app offers has a reference that passes on the arms, rovers, hexapod and stable quadrupeds (`s2-cases-play`) |
| 4 | **Train** | Teach it any skill in sim, randomized so it works on the real robot | **Now.** Forge native trainer, task contracts and Arena, the Motor Kit (Stand, Velocity tracking, Get up, Settle to neutral, trained through Forge; on the web demo it trains in the tab on the visitor's GPU) and the solver race (IK plans, motion tracking, reward search) and moves, Pose-tab animations a legged robot learns to perform under physics ([Forge](guide/forge.md) §8g, [Skills](guide/skills.md) §8i). Passed Case tries export as LeRobot datasets with camera video, for fine-tuning GR00T and other vision-language-action models off the Mac, and Train from Tries clones a policy from them in Forge and keeps it as the Case's skill only when it passes 29 of 32 randomized runs ([Cases](guide/cases.md) §8h) |
| 5 | **Build** | Print the plates, buy the parts, assemble | Mostly: BOM, budget, build guide, printers, plates, slicing and sending ([Print plan.md](Print%20plan.md)). Sending still to confirm on real printers |
| 6 | **Operate** | Drive it, run trained skills and Routines, record every run | In sim, against emulated servos and against an emulated Unitree G1 whose arms and waist Operate drives through `rt/arm_sdk` while its own controller balances it, and against any scene robot as an emulated ros2_control robot (`/joint_states` in, a forward position or joint trajectory controller or `/cmd_vel` out, joints matched by name): Cases with recorded tries, the daemon and its fault matrix ([Robot runtime](guide/robot-runtime.md) §8k), the scene's ready policy handed to the daemon so the Ladder climbs past Test, while the robot still follows the app's intents there, the Routines core ([Routines](guide/routines.md) §8j). Real motors stay locked until the Stage 8 session |

Gate status for this build lives in `verify/status.json`, written only by Gatekeeper ([Proof](guide/proof.md) §0k).

Two loops tie the stages together:

- **Fix loop (stages 1–4):** a failed check, a fall in sim or a policy that won't learn sends you back to Design. Repeat until stages 2–4 pass. Fixing isn't a stage of its own; it's this loop.
- **Reality loop (stages 3–6):** runs on the real robot are recorded, then used to calibrate the sim (mass, friction, servo response) and retrain. Collecting data isn't the end of the line; it starts the next round.
  - **Servo calibration (build Stage 6):** done against the hidden twin (`s6-hidden-twin` passes). `src/reality/` fits each servo's model from bench logs, says Measured, Consistent with preset or Can't tell, keeps versions with rollback, and the Simulate tab trains on the active calibration ([Robot runtime](guide/robot-runtime.md) §8k). Operate's Calibrate view runs the bench through the daemon on every joint of the emulated robot in Test and records each fit (every emulated STS3215 reads Measured), or one joint alone. Each joint is fitted against its own catalog servo and variant: the catalog's measured model for the STS3215 C001 and XL330, an estimate scaled from the catalog's stall torque, speed and volts for every other Feetech and Dynamixel servo, and each emulated servo stands in for its part. PWM servos and other motors off the Feetech and Dynamixel buses are skipped. Clicking a joint replays its bench log through the preset and the calibration side by side, with each one's median error, and any older version can be drawn before rolling back. While the robot follows the sim, the canvas draws it as measured beside the sim robot, each Operate row shows its joint's gap in degrees, and a joint that lags for 2 s offers Calibrate for that joint alone. The Pose tab's and Operate's joint rows mark each joint the sim runs on a Measured calibration, and Checks' Servo models row passes once every servo's joint is Measured; while any isn't, its Fix calibrates those joints, and a rollback brings the joint back to the row. A policy trained before a calibration shows Out of date in Simulate's Train section (its model fingerprint no longer matches) and retrains from its row; a rollback to the calibration it trained on makes it fresh again. Not yet: real logs (the NAD gate is parked with no public data pinned) and the later rungs (stand, tethered gait, policy tier, A/B).
  - **Real tries:** Export Case Mat prints a ground Case at true size with AprilTags, and Try on Real Robot tracks the real robot's base from a camera and judges it with the Case's own contract, listed beside the sim tries with a Real mark ([Cases](guide/cases.md) §8h, [Cameras](guide/cameras.md) §8l). Real motors stay locked: something else drives the robot and Basecase watches. Not yet: arms (an end-effector tag) and the tracked path feeding calibration ([Robot runtime](guide/robot-runtime.md) §8k).

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
- **Closed loops** (planned): a linkage's coupler and rocker joints are welded today. Write them as hinges and connect the coupler body to the rocker body at pivot C with an MJCF `<equality><connect>`, which MuJoCo solves as a soft constraint; Forge (§8g) needs the same constraint before a linkage trains.
- **Export ▸ Robot Package** (done, with T4): the MJCF the sim runs, a URDF with its STL meshes, the joint map and the scene's policies in one zip, laid out as a ROS 2 description package that builds with colcon and opens in RViz ([Simulate](guide/simulate.md) §8d).
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
- The Objects view and `find_objects` / `insert_object` bring in real props from NVIDIA SimReady Central with the maker's mass, friction and colliders; the Robots view adds makers' arms and grippers with their joints (docs/guide/simready.md §8e).
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
- **Status:** done as Export ▸ Robot Package: `joint_map.json` gives servo ids as Operate assigns them, Operate's zero (2048 counts) and direction (1), limits and the active calibration, in the daemon's `calibration.json` keys. The same zip is a ROS 2 description package (`package.xml`, `CMakeLists.txt`, `launch/display.launch.py`, an RViz config, `package://` meshes and a `ros2_control` joint per movable joint), checked with `colcon build` and `check_urdf` in `ros:jazzy` by Check's `ros` job. Connecting in Operate hands the emulated daemon the scene's newest trained network (a ready skill or an up-to-date policy) as `policy.onnx` and keeps it current, so Rehearse and the rungs above it unlock with no export (§8k). Not yet: zero offsets and directions measured on a real robot (calibration capture, §8k), `policy.onnx` in the zip, and a daemon build that runs the ONNX itself.

**Done when:** a preset quadruped (Go2) trains to walk, and the policy walks in the live sim with randomization on.

## Where training runs

Decided: **Forge**, our native Rust trainer on C MuJoCo's batch API, bundled with the app, so training needs no Python, uv or terminal ([Forge](guide/forge.md) §8g). The Python sidecar stays as a dev-only oracle (`BASECASE_TRAINER=python`). Forge's own SIMD, Metal and WebGPU engines (F3–F6) follow, with C MuJoCo as the oracle every result replays in. F5 (the GPU loop): with `backend: "metal"`, physics, observations, rewards, resets, the policy and the PPO update run on the Mac's GPU in one buffer, the device qualifies itself against C MuJoCo before a job trusts it, and every gate replays the policy in C MuJoCo (and the acceptance test in WASM too). F7 (gradients): built and tested are exact-forward gradients through a smoothed surrogate (within 1% of finite differences off contact and 10% on contact, on the fixture robots), batched Jacobian sysid (576 planted servo parameters on 16 worlds recovered within 2.4%) and design sweeps of mass and gear per world on SIMD, Metal and WGSL; the SHAC learner on them trains and replays in C MuJoCo but doesn't reach the walk skill, so its time-to-skill check fails and it stays opt-in (`algo: "shac"`), with PPO the default. Rented machines run long trainings and the Windows GPU checks once an account is set up.

## Rules for this work

These rules are also in docs/guide/simulate.md §8d.

- **One formulation, one model, one oracle.** Every engine (the WASM live sim, Forge, its SIMD and GPU backends) runs the same generated MJCF, and C MuJoCo is the oracle every result replays in. What you train is what you saw.
- **The scene is the source of truth.** MJCF is generated, never edited by hand. Fix the design, not the model file.
- **Simulating never edits parts.** Like posing, it only changes what the canvas shows.
- **Numbers come from the scene's data** (§8b masses, actuator specs, published limits), and estimates are labelled.
- **MuJoCo collides convex hulls.** Exact self-collision stays with the mesh sweeps in `three/interference.ts`.

Grounding: [design_verification_simulation.md](research/LLM%20robot%20design%20and%20BOM/design_verification_simulation.md) §1–2 (MJCF writer, `@mujoco/mujoco`, collision filtering, why a direct writer beats a CAD round-trip).
