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
  - src/workspace/simCommands.tsx
  - src/components/simulate/ControlSection.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/components/simulate/RunResult.tsx
  - src/utils/engineeringSimModel.ts
---

You can start MuJoCo physics on the canvas to see whether the robot stays standing and which servos work hardest.

The **Simulate** tab appears in the right panel once the scene has a joint. To learn what the model holds, see [Simulation in Basecase](/help/simulation-in-basecase).

1. Click **Simulate** at the top of the right panel.
2. Click the **Simulate** button at the top of the tab. The robot drops onto the floor and the clock starts.
3. In **Control**, choose what drives the joints: **Hold pose**, one of the robot's animations, a trained policy, or **Limp**.
4. To shove the robot sideways with half its weight, click **Push**.
5. To lift or fling the robot, select one of its parts, press [[V]], then drag the Move gizmo.
6. Check **Results**. It shows **Standing** or the moment the robot fell, along with its tilt and how far it moved.
7. To select the parts a joint moves, click the joint under **Peak torque**.
8. When you're done, click **Stop simulation** to put the canvas back.

You can also find **Simulate** and **Stop Simulation** in [[⌘K]]. The bar at the top of the tab has **Pause**, **Reset** and three speeds: ¼×, ½× and 1×.

If you edit a part or a joint while the simulation runs, the simulation ends and the canvas goes back to the posed model.

**Note:** If you use **Drive with Camera** on a humanoid with no ready Walk, its base stays held in place, so **Push** can't move it. **Reset** keeps it held. To free it, click **Stop simulation**, then click **Simulate**.

## Reading Peak torque

Each joint shows the most torque it needed, as a share of its servo's limit. A share of 98% or more turns red. If a joint spent time at its limit, the row says how long, for example "0.4 s at limit".

**Limp** switches every servo off, leaving only joint friction. A robot that still stands on **Limp** is held up by its shape.

## When the model is estimated

**Build** ▸ **Checks** tells you when a joint's torque or servo response is estimated. **Torque estimates** names the joints with no servo from Parts. **Servo models** names the servos with no measured model.

![Checks with Torque estimates open on a joint without a servo](/help/run-a-simulation/checks.png)

To steer the robot yourself, see [Drive a robot in the simulation](/help/drive-a-robot-in-the-simulation).
