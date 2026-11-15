---
title: Simulate tab is missing or the simulation stops
date: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 12
keywords:
  - mujoco
  - sim
  - physics
  - real time
  - slow simulation
  - policy error
  - estimated torque
related:
  - export-a-robot-package
  - calibrate-an-emulated-robot
covers:
  - src/workspace/RightPanelTabs.tsx
  - src/components/simulate/SimControls.tsx
  - src/utils/engineeringSimModel.ts
  - src/sim/useSimulation.ts
  - src/sim/useSimWorker.ts
  - src/sim/sim.worker.ts
  - src/sim/engine.ts
---

The Simulate tab runs your robot in MuJoCo once the robot has at least one joint that turns or slides.

## There's no Simulate tab

The tab appears when the scene has parts, including parts without joints, so you can compare designs with [Study](/help/study-design-options). Running physics still needs a movable joint.

1. Add parts to the scene.
2. Check the tabs at the top of the right panel again.

When the fix works, **Simulate** appears beside **Inspect**.

If your parts are joined rigidly, add a joint that turns or slides between two parts before running physics, or ask the agent to define the robot's joints.

## “The simulator stopped.”

The simulation crashed in the background, but your scene is safe.

1. Click **Stop simulation** beside the speed buttons.
2. Click **Simulate** to start it again.

Any other red text under **Simulate** comes from MuJoCo and means it can't load the model. Stop the simulation, change the part the message names, and start the simulation again.

## “This policy was trained on joints this robot no longer has. Train it again.”

You changed the robot's joints after you trained this policy. A policy drives only the joints it learned on, so train it again on the robot as it is now.

## The time shows a figure like 0.6× real time

The figure compares the simulation's speed with the clock.

- At **1×**, a figure under 1 means your computer can't keep up with the model.
- At **½×** or **¼×**, the figure should match the speed you chose.

## Checks says the simulation guesses torque

In the **Build** tab, Checks may say “These joints have no servo, so the simulation guesses their torque from weight.” Assign a servo from **Parts** to each of those joints so the simulation can use the servo's datasheet limits.

If Checks says “These servos aren’t calibrated on this robot.”, those servos have no measured model. You can measure any Feetech or Dynamixel servo with [Calibrate an emulated robot](/help/calibrate-an-emulated-robot). Other servos keep their estimate.
