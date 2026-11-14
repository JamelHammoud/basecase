---
title: Run a trained skill on the emulated robot
date: 2026-11-13
updated: 2026-11-14
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

The policy runs in the app's simulation, and the selected robot copies what the simulation does. Until a unit is pinned by Roll Out, Basecase sends it the scene's newest ready skill or up-to-date policy. That opens **Rehearse** and the rungs above it, where the robot follows the simulation too.

[Roll out a skill to a fleet of emulated robots](/help/roll-out-a-skill-to-a-fleet) proves each unit's twin first and pins its policy version.

1. Connect the emulated robot and climb to **Test**. See [Connect an emulated robot](/help/connect-an-emulated-robot) for the steps.
2. In **Operate**, click the robot's named row.
3. Click **Simulate** at the top of the right panel.
4. Under **Train**, click **Try** on a ready skill. For **Walk**, click **Drive** instead.
5. Watch the servo angles in **Operate** change as the simulated robot moves.
6. To stop the motors, click **Stop** in **Operate**.

To run a trained policy, skip step 4 and choose the policy under **Control**. When you try a Case or run a Routine, the app streams it to the robot the same way.

## What the safety layer changes

In **Test**, the safety layer limits each joint to 30% torque and 0.5 rad/s. A goal moves at most 0.02 rad every 20 ms and stays no more than 0.25 rad ahead of the servo's measured position, so a fast skill looks slower on the servos than on the canvas.

The app sends the simulation's joint targets to the robot as often as every 25 ms. A joint that isn't in the simulation holds its position.

If something goes wrong:

- After a fault, the app stops sending targets until you climb the **Ladder** again.
- If the simulation pauses, the robot keeps its last target.
- If Basecase stops responding for about a second, the robot stops. An arm holds its position, and a legged robot stands still.

## Run it outside Basecase

To run the robot without Basecase, choose **Export** ▸ **Robot Package**. The package holds the MuJoCo model, a URDF, the joint map and the scene's policies, each with a `spec.json` file that lists its inputs and outputs.

**Note:** The package leaves out skills you trained in **Train**.

See [Export a robot package](/help/export-a-robot-package) for more.
