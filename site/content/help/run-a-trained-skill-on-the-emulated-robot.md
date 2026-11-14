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

While the emulated robot is in Test, you can play a trained skill or policy in the simulation and watch the robot's servos follow along through the safety layer.

The robot follows the app's simulation and doesn't run a policy of its own. Basecase still sends the robot the scene's newest ready skill or up-to-date policy. That opens **Rehearse** and the rungs above it, and on those rungs the robot also follows the simulation.

1. Connect the emulated robot and climb to **Test**. For the steps, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Click **Simulate** at the top of the right panel.
3. Under **Train**, click **Try** on a ready skill. For **Walk**, click **Drive** instead.
4. Watch the servo angles in **Operate** change as the simulated robot moves.
5. To stop the motors, click **Stop** in **Operate**.

To play a trained policy, choose it under **Control** in step 3 instead. When you try a Case or run a Routine, the app streams it to the robot the same way.

## What the safety layer changes

In **Test**, the safety layer limits each joint to 30% torque and 0.5 rad/s. It moves each goal at most 0.02 rad every 20 ms and keeps the goal within 0.25 rad of the servo's measured position. With these limits, a fast skill can look slower on the servos than it does on the canvas.

The app sends the simulation's joint targets to the robot as often as every 25 ms, with these exceptions:

- After a fault, the app sends no targets until you climb the **Ladder** again.
- A joint that's missing from the simulation holds where it is.
- If the app stops sending for 100 ms, the robot stops. An arm holds its position, and a legged robot stands still.

## Run it outside Basecase

To run the robot without Basecase, choose **Export** ▸ **Robot Package**. The package holds the MuJoCo model, a URDF, the joint map and the scene's policies, each with a `spec.json` file listing its inputs and outputs.

**Note:** The package leaves out skills you trained in **Train**.

For more, see [Export a robot package](/help/export-a-robot-package).
