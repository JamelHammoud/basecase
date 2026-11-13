---
title: Replay a robot fault in the simulation
date: 2026-11-13
collection: operate
type: task
order: 4
keywords:
  - fault
  - stall
  - overload
  - replay
  - torque
  - case
related:
  - compare-the-robot-with-the-simulation
  - calibrate-an-emulated-robot
covers:
  - src/robot/runBuffer.ts
  - src/robot/robotStore.ts
  - src/robot/intentMirror.ts
  - src/components/operate/RobotMessages.tsx
  - src/workspace/robotReplay.ts
  - src/cases/replayCase.ts
  - src/sim/torqueShare.ts
---

Turn the 20 seconds before a servo fault into a Case, and see in the simulation whether the design or the simulation was wrong.

Replay in Sim is offered only for a robot with an arm. It plays back the commands the robot's joints got.

1. Connect the emulated robot and climb the **Ladder** to **Test**, as in [Connect an emulated robot](/help/connect-an-emulated-robot).
2. In **Simulate**, click **Drive** and move the arm. The robot follows the simulation.
3. When a fault stops a motor, find its message in **Operate** under **Stopped by a fault**.
4. Click **Replay in Sim** under the message.

   ![Operate showing a stall on servo 2, with Replay in Sim under the message](/help/replay-a-robot-fault-in-the-simulation/fault.png)

5. Watch the replay. A Case named after the fault's time opens in **Simulate**, with the faulting joint's link selected, and plays once as a try.
6. Read **Results**. **Peak torque** shows each joint's highest torque as a share of its stall torque, and the try shows **Passed** or **Missed**.

   ![Results after the replay, with both joints at 100% and the try missed](/help/replay-a-robot-fault-in-the-simulation/results.png)

The Case starts from the robot's first measured pose, then sends every command the robot got, at the same times. It passes when no joint reaches 98% of the most its servo can push, counted from 1.5 seconds in.

A miss means the design can't make that move with those servos. A stronger servo or a lighter arm fixes it, and the Case's row in **Build** ▸ **Checks** reruns after every change. A pass while the robot faulted means the simulation is off; [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) fits the joint.

After a fault, the simulation stops sending commands to the robot until you climb the **Ladder** again. A replay never moves the robot. The 20 seconds live in memory, and go when the message leaves **Operate**.
