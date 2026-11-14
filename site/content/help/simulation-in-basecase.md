---
title: Simulation in Basecase
date: 2026-11-13
updated: 2026-11-14
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

Run the robot in your scene under MuJoCo physics to find out whether it stands, walks and holds its weight before you print a part.

MuJoCo is the physics engine behind much of robotics research. Basecase runs Google DeepMind's own build of MuJoCo, version 4.0.0, inside the app. Your simulation runs, trained skills and Case checks all use that same physics.

## The scene is the model

You don't write a model file. Each time you start a simulation, Basecase writes a MuJoCo model (MJCF, MuJoCo's XML format) from your scene as it is at that moment. The model is built from four things:

- **Bodies.** Each joint gets one body, which holds the parts that joint moves. A robot that walks or rolls floats free, while an arm stays bolted to the floor.
- **Mass.** Each part weighs what the Weight check in the Build tab says it weighs.
- **Shape.** Each part collides as the convex hull of its mesh, the shape you'd get by stretching plastic wrap around the part.
- **Start.** The robot starts in the pose shown on the canvas, raised until it clears the floor.

If the robot misbehaves in the simulation, fix the design. Basecase writes your changes into the model on your next run.

## Servos, measured or estimated

If a catalog servo with a published model drives a joint, the joint moves the way a bench test of that servo model says it does. Basecase models the STS3215 at 7.4 V and the XL330 at 5 V. [Explore](/help/explore-servo-versions-on-a-case) instead models each servo at the supply voltage it's trying. Each model covers the servo's gain and delay, back-EMF damping, and friction that grows with load.

Every other joint gets an estimated servo. If the joint has a servo, Basecase sets its torque from that servo's stall torque. If it has none, Basecase sets the torque from the weight the joint holds.

To see which joints use estimates, open **Build** ▸ **Checks**:

- **Torque estimates** lists those joints.
- **Servo models** lists each servo that isn't **Measured** yet.

When you calibrate a connected robot, Basecase replaces the model of each Feetech or Dynamixel servo, published or estimated, with one fitted to that servo. The Pose tab then marks each of those joints **Measured**. For the steps, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

## What a run tells you

For each robot that can fall over, a run reports either **Standing** or the moment the robot fell. Basecase counts a robot as fallen once it tilts past 60° or its base drops below 45% of its starting height.

**Peak torque** lists the joints that worked hardest, as a share of what their servo can give.

A run doesn't change your parts. The canvas shows the simulated pose until you end the simulation, then goes back to where it was.

## Where the same physics runs

- **Drive** lets you steer the robot live with the keyboard, a gamepad, a phone, or your arms in front of the camera. If you drive a humanoid with the camera, Basecase holds its base in place unless the humanoid has a ready Walk skill.
- **Cases** record tries and mark each one as a pass or a miss. A running Case's code can move, recolor or hide the Case's movable objects, and the try records each change. To see each value as it was at any moment, play back a try from the Case's cards.
- **Training** teaches skills on Forge, Basecase's own trainer, which is built on the same MuJoCo formulation. While training runs, the canvas shows the newest snapshot. A trained skill counts only after Arena replays it on MuJoCo itself.
- **Routines** run step by step on the live simulation.
- **Falls**, in the Build tab, tips a legged robot over from 12 directions to find the servos a fall would strip.
- **The emulated robot** follows the simulation once it reaches Test.

## Limits

Parts of the same robot don't collide with each other in the simulation, so one leg can pass through another. The model also leaves out the STS3215's speed limit, current limits, supply sag and backlash.
