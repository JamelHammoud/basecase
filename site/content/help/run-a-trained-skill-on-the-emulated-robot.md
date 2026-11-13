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
  - src/components/simulate/EmulatedRobotSection.tsx
  - src/components/simulate/SkillsList.tsx
  - src/components/simulate/ControlSection.tsx
  - src/components/operate/OperatePanel.tsx
  - src/robot/intentMirror.ts
  - electron/robot/intentPacer.mjs
---

Play a trained skill or policy in the simulation while the emulated robot is in Test, and watch its servos follow through the safety layer.

The robot follows the app's simulation; it doesn't run the policy itself. The rungs that would, **Rehearse** and up, need a policy loaded into the daemon, and Basecase doesn't load one. Clicking **Rehearse** answers "Load a policy first."

1. Connect the emulated robot and climb to **Test**. Steps are in [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Click **Simulate** at the top of the right panel.
3. Check that **Emulated robot** reads "Follows this simulation".
4. Under **Train**, click **Try** on a ready skill. For **Walk**, click **Drive** instead.
5. Watch the servo angles under **Emulated robot** change as the simulated robot moves.
6. Click **Stop** in **Operate** to stop the motors.

To run a policy from the **Policies** list, choose it under **Control** instead of step 4. A Case try or a Routine run streams to the robot the same way.

## What the safety layer changes

In **Test**, each joint is held to 30% torque and 0.5 rad/s. A goal moves at most 0.02 rad every 20 ms, and never leads the servo's measured position by more than 0.25 rad. A fast skill shows up on the servos slower than on the canvas.

The app sends the robot the simulation's joint targets up to every 25 ms. A joint the simulation doesn't have holds where it is. If the app stops sending for 100 ms, the robot stops: an arm holds, and a legged robot stands still.

## Run it outside Basecase

**Export** ▸ **Robot Package** holds the MuJoCo model, a URDF, the joint map and the scene's policies. Each policy comes with a `spec.json` of its inputs and outputs. Skills trained in **Train** aren't in the package. See [Export a robot package](/help/export-a-robot-package).
