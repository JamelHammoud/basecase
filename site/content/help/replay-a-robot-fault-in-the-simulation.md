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
  - keep-a-robot-session-as-a-try
covers:
  - src/robot/runBuffer.ts
  - src/robot/operateLog.ts
  - src/robot/robotStore.ts
  - src/robot/intentMirror.ts
  - src/components/operate/RobotMessages.tsx
  - src/workspace/robotReplay.ts
  - src/cases/replayCase.ts
  - src/sim/torqueShare.ts
---

When a servo faults, you can turn the 20 seconds before the fault into a Case. Replay the Case in the simulation to find out whether the design or the simulation was wrong.

**Replay in Sim** is available only for a robot with an arm. It plays back the commands the robot's joints received.

1. Connect the emulated robot and climb the **Ladder** to **Test**. See [Connect an emulated robot](/help/connect-an-emulated-robot).
2. In **Simulate**, click **Drive**.
3. Move the arm. The robot follows the simulation.
4. When a fault stops a motor, click that robot's named row in **Operate**.
5. Find its fault message under the servo count.
6. Under the message, click **Replay in Sim**.

   ![Operate showing a stall on servo 2, with Replay in Sim under the message](/help/replay-a-robot-fault-in-the-simulation/fault.png)

7. Watch the replay. A Case named after the time of the fault opens in **Simulate**, with the link of the faulting joint selected. The Case plays once, as a try.
8. Read **Results**. **Peak torque** shows the highest torque each joint reached, as a share of its stall torque. The try shows **Passed** or **Missed**.

   ![Results after the replay, with both joints at 100% and the try missed](/help/replay-a-robot-fault-in-the-simulation/results.png)

The Case starts from the first pose measured on the robot, then sends every command the robot received, at the same times. Counting from 1.5 seconds in, the try passes if no joint reaches 98% of the most torque its servo can push.

If the try is missed, the design can't make that move with those servos. Use a stronger servo or a lighter arm. The Case's row in **Build** ▸ **Checks** reruns after every change, so you can see when the fix works.

If the try passes but the robot faulted, the simulation is off. To fit the joint, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

A fault and its recording belong to one unit. Other connected units keep their own modes and recordings.

**Note:** After a fault, the simulation stops sending commands to the robot until you climb the **Ladder** again. A replay never moves the robot.

The 20 seconds come from the session's try, which ends at the fault. See [Keep a robot session as a try](/help/keep-a-robot-session-as-a-try). A session that lasts 2 seconds or less, or in which no joint moves, isn't kept, so its fault has no **Replay in Sim**.
