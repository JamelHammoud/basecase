---
title: Simulate tab is missing or the simulation stops
date: 2026-11-13
updated: 2026-11-13
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

The Simulate tab runs your robot in MuJoCo, and it needs a robot with at least one joint that turns or slides.

## There's no Simulate tab

The scene has no movable joint yet. Parts joined only rigidly have nothing to simulate.

1. Add a joint that turns or slides between two parts, or ask the agent to define the robot's joints.
2. Look at the tabs at the top of the right panel again.

It worked when **Simulate** appears beside **Inspect**.

## “The simulator stopped.”

The simulation crashed in the background. Your scene is safe; only the running simulation stopped.

1. Click × beside the speed buttons to end the simulation.
2. Click **Simulate** to start it again.

Any other red text under **Simulate** is MuJoCo's own message about a model it couldn't load. End the simulation, change the part it names, and start again.

## “This policy was trained on joints this robot no longer has. Train it again.”

You changed the robot's joints after training. A policy only drives the joints it learned on, so train it again on the robot as it is now.

## The time shows a figure like 0.6× real time

The figure shows how fast the simulation runs against the clock. At **1×**, a figure under 1 means your computer can't keep up with the model. At **½×** or **¼×**, it shows the speed you chose, and nothing is wrong.

## Checks says torque is estimated

**Torque estimates** in **Build** ▸ **Checks** lists joints with no servo, so the simulation guesses their torque from weight. Assign a servo from **Parts** to each of those joints, and the simulation uses the servo's datasheet limits. When **Servo models** warns, those servos have no measured model yet. [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) measures one.
