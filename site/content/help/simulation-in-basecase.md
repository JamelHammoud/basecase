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

MuJoCo is the physics engine that much of robotics research uses. Basecase runs Google DeepMind's own build of it, version 4.0.0, inside the app. Simulation runs, skill training and Case checks all use this same physics.

## The scene is the model

You don't write or edit a model file. Each time you start a simulation, Basecase writes a MuJoCo model (MJCF, MuJoCo's XML format) from the scene as it is at that moment.

- **Bodies.** Each joint gets one body, which holds the parts that joint moves. A robot that walks or rolls floats free, and an arm stays fixed to the floor.
- **Mass.** Each part weighs what the Weight check in the Build tab says it weighs.
- **Shape.** Each part collides as the convex hull of its mesh, the shape a sheet of plastic wrap would make around it.
- **Start.** The robot starts in the pose shown on the canvas, raised until it clears the floor.

If the robot does something wrong, fix the design. The next run builds the model from your changes.

## Servos, measured or estimated

A joint driven by a catalog servo with a published model moves the way a bench test of that servo model says it does. Basecase models the STS3215 at 7.4 V and the XL330 at 5 V. [Explore](/help/explore-servo-versions-on-a-case) instead models each servo at the supply voltage it tries. Each model includes the servo's gain, its delay, back-EMF damping and friction that grows with load.

Every other joint gets an estimated servo. Its torque comes from the servo's stall torque, or from the weight the joint holds if the joint has no servo. In **Build** ▸ **Checks**, **Torque estimates** names these joints, and **Servo models** lists every servo that isn't **Measured**.

When you calibrate a connected robot, Basecase replaces the model for each Feetech or Dynamixel servo, published or estimated, with one fitted to that servo. The Pose tab then marks the joint **Measured**. For steps, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

## What a run tells you

For each robot that can fall over, a run reports **Standing** or the moment the robot fell. A robot counts as fallen when it tilts past 60° or its base drops below 45% of its starting height. **Peak torque** lists the joints that worked hardest, as a share of what their servo can give.

Simulating never changes your parts. The canvas shows the simulated pose while the simulation runs, then goes back to how it was when you end the simulation.

## Where the same physics runs

- **Drive** lets you steer the robot live with the keyboard, a gamepad, a phone or your arms in front of the camera. If you drive a humanoid with the camera, Basecase holds its base in place unless it has a ready Walk skill.
- **Cases** record tries and mark each one pass or miss. A Case's code can move, recolor or hide the Case's movable objects as it runs, and the try records each change.
- **Training** teaches skills on Forge, Basecase's own trainer, built on the same MuJoCo formulation. While a skill trains, the canvas runs its newest snapshot. A trained skill only counts after Arena replays it on MuJoCo itself.
- **Routines** run step by step on the live simulation.
- **Falls**, in the Build tab, tips a legged robot over from 12 directions to find the servos a fall would strip.
- **The emulated robot** follows the simulation once it reaches Test.

## Limits

Parts of the same robot don't collide with each other in the simulation, so one leg can pass through another. The model also doesn't include the STS3215's speed limit, current limits, supply sag or backlash.
