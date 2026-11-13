---
title: Run a simulation
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 1
keywords:
  - play
  - start sim
  - physics
  - push
  - fall over
  - torque
  - limp
related:
  - simulation-in-basecase
  - drive-a-robot-in-the-simulation
covers:
  - src/workspace/RightPanelTabs.tsx
  - src/components/SimulatePanel.tsx
  - src/components/simulate/SimControls.tsx
  - src/components/simulate/ControlSection.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/components/simulate/RunResult.tsx
  - src/utils/engineeringSimModel.ts
---

Start MuJoCo physics on the canvas, choose what drives the joints, and see whether the robot stays up and which servos work hardest.

The **Simulate** tab appears in the right panel once the scene has a joint. [Simulation in Basecase](/help/simulation-in-basecase) explains what the model holds.

1. Click **Simulate** at the top of the right panel.
2. Click the **Simulate** button at the top of the tab. The robot drops onto the floor and the clock starts.
3. In **Control**, choose what drives the joints: **Hold pose**, one of the robot's animations, a trained policy, or **Limp**.
4. To shove the robot sideways with half its weight, click **Push**.
5. To lift or fling the robot, select one of its parts, press V and drag the Move gizmo.
6. Read **Results**: **Standing**, or the moment the robot fell, with its tilt and how far it moved.
7. Click a joint under **Peak torque** to select the parts it moves.
8. Click **End simulation** (×) to stop and put the canvas back.

The bar at the top of the tab also has **Pause**, **Reset** and three speeds: ¼×, ½× and 1×.

After **Drive with Camera** on a humanoid with no ready Walk, its base stays held in place, so **Push** can't move it. **Reset** keeps it held; click **End simulation**, then **Simulate**, to free it.

## Reading Peak torque

Each joint shows the most torque it needed as a share of its servo's limit. A share of 98% or more turns red. When a joint spent time at its limit, the row says how long, such as "0.4 s at limit".

**Limp** switches every servo off, leaving only joint friction. A robot that still stands on **Limp** is held up by its shape, not its servos.

## When the model is estimated

**Build** ▸ **Checks** says when a joint's torque or servo response is estimated. **Torque estimates** names the joints with no servo from Parts. **Servo models** names the servos with no measured model.

Editing a part or a joint while the simulation runs ends it, and the canvas goes back to the posed model. Next, steer the robot yourself in [Drive a robot in the simulation](/help/drive-a-robot-in-the-simulation).
