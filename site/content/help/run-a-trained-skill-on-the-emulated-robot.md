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

With the emulated robot in Test, you can play a trained skill or policy in the simulation, and the robot's servos follow along through the safety layer.

The policy runs in the app's simulation, and the robot copies what the simulation does. Basecase also sends the robot the scene's newest ready skill or up-to-date policy, which you need to climb to **Rehearse** and the rungs above it. On those rungs, the robot follows the simulation too.

1. Connect the emulated robot and climb to **Test**. For the steps, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Click **Simulate** at the top of the right panel.
3. Under **Train**, click **Try** on a ready skill. For **Walk**, click **Drive** instead.
4. As the simulated robot moves, watch the servo angles change in **Operate**.
5. To stop the motors, click **Stop** in **Operate**.

To run a trained policy, skip step 3 and choose the policy under **Control**. A Case try or a Routine run streams to the robot the same way.

## What the safety layer changes

In **Test**, the safety layer caps each joint at 30% torque and 0.5 rad/s. Each goal moves at most 0.02 rad every 20 ms and stays at most 0.25 rad ahead of the servo's measured position, so expect a fast skill to look slower on the servos than on the canvas.

The app sends the simulation's joint targets to the robot as often as every 25 ms. If targets stop or go missing:

- After a fault, the app sends no targets until you climb the **Ladder** again.
- A joint the simulation doesn't have holds where it is.
- After 100 ms with no targets from the app, the robot stops: an arm holds, and a legged robot stands still.

## Run it outside Basecase

To run the robot without Basecase, choose **Export** ▸ **Robot Package**. The package holds the MuJoCo model, a URDF, the joint map and the scene's policies, each with a `spec.json` that lists its inputs and outputs.

**Note:** The package leaves out skills you trained in **Train**.

See [Export a robot package](/help/export-a-robot-package).
