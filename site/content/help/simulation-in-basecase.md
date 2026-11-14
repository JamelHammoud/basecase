---
title: Simulation in Basecase
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: concept
order: 1
keywords:
  - physics engine
  - mjcf
  - deepmind
  - sim to real
  - digital twin
related:
  - run-a-simulation
  - cases
covers:
  - src/sim/mjcf.ts
  - src/sim/engine.ts
  - src/sim/servoModel.ts
  - src/sim/mjcfServo.ts
  - src/sim/sim.worker.ts
  - src/sim/worldMoves.ts
  - src/utils/engineeringSimModel.ts
  - src/reality/measuredJoints.ts
---

Run the robot in your scene under MuJoCo physics to see whether it stands, walks and holds its weight before you print a part.

MuJoCo is the physics engine much of robotics research uses. Basecase runs Google DeepMind's own build of it, version 4.0.0, inside the app. The same physics judges every run, trains every skill and checks every Case.

## The scene is the model

You never write or edit a model file. Each time a simulation starts, Basecase writes a MuJoCo model (MJCF, MuJoCo's XML format) from the scene as it is.

- **Bodies.** Each joint gets one body, holding the parts that joint moves. A robot that walks or rolls floats free; an arm stays bolted to the floor.
- **Mass.** Each part weighs what the Weight check in the Build tab says it weighs.
- **Shape.** Each part collides as the convex hull of its mesh, the shape a sheet of plastic wrap would make around it.
- **Start.** The robot starts in the pose on the canvas, lifted until it clears the floor.

When the robot does something wrong, fix the design. The model follows on the next run.

## Servos, measured or estimated

A joint driven by a catalog servo with a published model moves the way a bench test of that servo model says it does. The STS3215 is modeled at 7.4 V and the XL330 at 5 V. [Explore](/help/explore-servo-versions-on-a-case) models each servo at the supply voltage it tries instead. Each model includes the servo's gain, its delay, back-EMF damping and friction that grows with load.

Any other joint gets an estimated servo. Its torque comes from the servo's stall torque, or from the weight the joint holds when it has no servo. **Build** ▸ **Checks** names these joints under **Torque estimates**, and every servo not yet **Measured** under **Servo models**.

Calibrating a connected robot replaces each Feetech or Dynamixel servo's model, published or estimated, with one fitted to it. It marks the joint **Measured** in the Pose tab. Steps are in [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

## What a run tells you

A run reports, for each robot that can fall over, **Standing** or the moment it fell. A robot has fallen when it tilts past 60° or its base drops below 45% of its starting height. **Peak torque** lists the joints that worked hardest, as a share of what their servo can give.

Simulating never changes your parts. The canvas shows the simulated pose, and ending the simulation puts the canvas back where it was.

## Where the same physics runs

- **Drive** steers the robot live with the keyboard, a gamepad, a phone or your arms in front of the camera. A humanoid driven by the camera has its base held in place, unless it has a ready Walk skill.
- **Cases** record tries and judge each one pass or miss. A Case's code can move, recolor or hide the Case's movable objects while it runs, and the try records each change.
- **Training** teaches skills on Forge, Basecase's own trainer, built on the same MuJoCo formulation. While it trains, the canvas runs its newest snapshot. A trained skill counts only after Arena replays it on MuJoCo itself.
- **Stress** searches friction, weight, servo strength and latency past Arena's ranges for where a ready skill fails. Clicking a finding replays its worst try live.
- **Routines** run step by step on the live simulation.
- **Falls**, in the Build tab, tips a legged robot over from 12 directions to find the servos a fall would strip.
- **The emulated robot** follows the simulation once it reaches Test.

## Limits

Parts of the same robot don't collide with each other in the simulation, so a leg can pass through another leg. The model also leaves out the STS3215's speed limit, current limits, supply sag and backlash.
