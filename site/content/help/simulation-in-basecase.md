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

A simulation runs the robot in your scene under MuJoCo physics. Use it to check that your robot stands, walks and holds its weight before you print a part.

Much of robotics research uses MuJoCo as its physics engine. Basecase runs Google DeepMind's own build of it, version 4.0.0, inside the app. Your runs, the skills you train and your Cases all use that same physics.

## The scene is the model

Each time you start a simulation, Basecase writes a MuJoCo model (MJCF, MuJoCo's XML format) from your scene as it is at that moment. You never write or edit a model file yourself.

- **Bodies.** Each joint gets one body, which holds the parts that joint moves. A robot that walks or rolls floats free. An arm stays fixed to the floor.
- **Mass.** Each part weighs what the Weight check in the Build tab says it weighs.
- **Shape.** Each part collides as the convex hull of its mesh, the shape a sheet of plastic wrap would take around it.
- **Start.** The robot starts in the pose on the canvas, and Basecase lifts it until it clears the floor.

If the robot misbehaves, change the design. Your changes go into the model the next time you run the simulation.

## Servos, measured or estimated

If a joint is driven by a catalog servo with a published model, the joint moves the way that servo model moved in a bench test. Basecase models the STS3215 at 7.4 V and the XL330 at 5 V. [Explore](/help/explore-servo-versions-on-a-case) models each servo at the supply voltage it's trying. Each model covers the servo's gain and delay, back-EMF damping, and friction that grows with load.

Other joints get an estimated servo, with torque based on the servo's stall torque. A joint with no servo gets its torque from the weight it holds. **Build** ▸ **Checks** lists these joints under **Torque estimates**, and lists each servo that isn't **Measured** under **Servo models**.

When you calibrate a connected robot, Basecase replaces the model of each Feetech or Dynamixel servo, published or estimated, with one fitted to that servo. The Pose tab marks the joint **Measured**. For the steps, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

## What a run tells you

For each robot that can fall over, a run reports **Standing** or the moment the robot fell. A robot counts as fallen once it tilts past 60° or its base drops below 45% of its starting height. **Peak torque** lists the hardest-working joints as a percentage of what their servo can deliver.

Running a simulation doesn't change your parts. The canvas shows the simulated pose during the run, then returns to how it was when you end the simulation.

## Where the same physics runs

- **Drive** lets you steer the robot in real time with the keyboard, a gamepad, a phone, or your arms in front of the camera. If you drive a humanoid with the camera, Basecase holds its base in place unless the humanoid has a ready Walk skill.
- **Cases** record tries and mark each one pass or miss. A running Case's code can move, recolor or hide the Case's movable objects, and each change is recorded in the try.
- **Training** teaches skills on Forge, Basecase's own trainer, which is built on the same MuJoCo formulation. During training, the canvas runs the skill's newest snapshot. A trained skill counts only after Arena replays it on MuJoCo itself.
- **Routines** run step by step on the live simulation.
- **Falls**, in the Build tab, tips a legged robot over from 12 directions to find the servos a fall would strip.
- **The emulated robot** follows the simulation once it reaches Test.

## Limits

In the simulation, parts of the same robot don't collide with each other, so one leg can pass through another. The model leaves out the STS3215's speed limit, current limits, supply sag and backlash.
