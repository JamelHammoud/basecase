---
title: Run a simulation
date: 2026-11-13
updated: 2026-11-14
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

You can run MuJoCo physics on the canvas to find out whether your robot stays standing and which servos work hardest.

The **Simulate** tab appears in the right panel once your scene has a joint. To learn what the model includes, see [Simulation in Basecase](/help/simulation-in-basecase).

1. Click **Simulate** at the top of the right panel.
2. Click the **Simulate** button at the top of the tab. The robot drops onto the floor and the clock starts.
3. In **Control**, choose what drives the joints: **Hold pose**, one of the robot's animations, a trained policy, or **Limp**. While you're driving the robot, **Control** shows **Drive**. To stop driving, choose another option.
4. To push the robot in a random direction, click **Push**. It pushes with half the robot's weight, or twice its weight if the robot rolls on wheels.
5. To lift or fling the robot, select one of its parts, press [[V]], then drag the Move gizmo.
6. Check **Results**. It shows **Standing** or the moment the robot fell, along with the robot's tilt and how far it moved.
7. To select the parts a joint moves, click that joint under **Peak torque**.
8. When you're done, click **Stop simulation** to restore the canvas.

**Simulate** and **Stop Simulation** are also in [[⌘K]]. The bar at the top of the tab has **Pause**, **Reset**, and three speeds: ¼×, ½×, and 1×.

If you edit a part or a joint while the simulation is running, the simulation ends and the canvas goes back to the posed model.

**Note:** If you use **Drive with Camera** on a humanoid that doesn't have a ready Walk, the simulation holds its base in place, so **Push** can't move it. **Reset** doesn't release it. To free the base, click **Stop simulation**, then click **Simulate**.

## Reading Peak torque

Each joint shows the most torque it needed, as a percentage of its servo's limit. Rows at 98% or more turn red. If a joint spent time at its limit, the row says for how long, for example "0.4 s at limit".

**Limp** turns off every servo, leaving only joint friction. If a robot still stands on **Limp**, its shape is holding it up.

## When the model is estimated

**Build** ▸ **Checks** tells you when a joint's torque or servo response is estimated. **Torque estimates** lists the joints that don't have a servo from Parts. **Servo models** lists the servos that don't have a measured model.

![Checks with Torque estimates open on a joint without a servo](/help/run-a-simulation/checks.png)

To steer the robot yourself, see [Drive a robot in the simulation](/help/drive-a-robot-in-the-simulation).
