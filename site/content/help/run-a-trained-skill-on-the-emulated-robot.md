---
title: Run a trained skill on the emulated robot
date: 2026-11-13
updated: 2026-11-13
collection: operate
type: task
order: 3
keywords:
  - deploy
  - policy
  - run policy
  - sim to real
  - follow simulation
  - mirror
  - rehearse
related:
  - connect-an-emulated-robot
  - export-a-robot-package
covers:
  - src/sim/useSimWorker.ts
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/ControlSection.tsx
  - src/components/operate/OperatePanel.tsx
  - src/robot/intentMirror.ts
  - src/robot/robotPolicy.ts
  - electron/robot/intentPacer.mjs
---

You can play a trained skill or policy in the simulation while the emulated robot is in Test. The robot's servos follow along through the safety layer.

The robot copies the simulation in the app and doesn't run the policy itself. Basecase still sends the robot the scene's newest ready skill or up-to-date policy, which opens **Rehearse** and the rungs above it. On those rungs, the robot also follows the simulation.

To try a skill on the robot:

1. Connect the emulated robot and climb to **Test**. For the steps, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Click **Simulate** at the top of the right panel.
3. Under **Train**, click **Try** on a ready skill. For **Walk**, click **Drive** instead.
4. Watch the servo angles in **Operate**. They change as the simulated robot moves.
5. To stop the motors, click **Stop** in **Operate**.

To run a trained policy, choose it under **Control** in place of step 3. A Case try or a Routine run streams to the robot the same way.

## What the safety layer changes

In **Test**, the safety layer holds each joint to 30% torque and 0.5 rad/s. Each goal moves at most 0.02 rad every 20 ms and stays no more than 0.25 rad ahead of the servo's measured position. Expect a fast skill to look slower on the servos than on the canvas.

The app sends the simulation's joint targets to the robot as often as every 25 ms. After a fault, it stops sending targets until you climb the **Ladder** again. If the simulation doesn't have a joint, that joint holds where it is. If the app stops sending for 100 ms, the robot stops: an arm holds, and a legged robot stands still.

## Run it outside Basecase

To run the robot without Basecase, choose **Export** ▸ **Robot Package**. The package includes the MuJoCo model, a URDF, the joint map and the scene's policies. Each policy comes with a `spec.json` file that lists its inputs and outputs.

**Note:** The package doesn't include skills you trained in **Train**.

Learn more in [Export a robot package](/help/export-a-robot-package).
