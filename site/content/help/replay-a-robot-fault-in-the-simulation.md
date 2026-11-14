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
  - electron/robot/takeTap.mjs
  - src/robot/robotStore.ts
  - src/robot/intentMirror.ts
  - src/components/operate/RobotMessages.tsx
  - src/workspace/robotReplay.ts
  - src/cases/replayCase.ts
  - src/sim/torqueShare.ts
---

When a servo faults, you can turn the 20 seconds before the fault into a Case and replay it in the simulation. The replay tells you whether the design was wrong or the simulation was.

**Replay in Sim** is available only for robots with an arm. It plays back the commands that the robot's joints received.

1. Connect the emulated robot and climb the **Ladder** to **Test**. See [Connect an emulated robot](/help/connect-an-emulated-robot).
2. In **Simulate**, click **Drive**.
3. Move the arm. The robot follows the simulation.
4. When a fault stops a motor, find its message in **Operate** under **Stopped by a fault**.
5. Under the message, click **Replay in Sim**.

   ![Operate showing a stall on servo 2, with Replay in Sim under the message](/help/replay-a-robot-fault-in-the-simulation/fault.png)

6. Watch the replay. A Case named after the time of the fault opens in **Simulate** with the link of the faulting joint selected, then plays once as a try.
7. Read **Results**. **Peak torque** shows the highest torque each joint reached, as a share of its stall torque. The try shows **Passed** or **Missed**.

   ![Results after the replay, with both joints at 100% and the try missed](/help/replay-a-robot-fault-in-the-simulation/results.png)

The Case starts from the first pose measured on the robot, then sends every command the robot received, at the same times. The try passes if no joint reaches 98% of the most torque its servo can push, counting from 1.5 seconds in.

If the try is missed, the design can't make that move with those servos. Use a stronger servo or a lighter arm. The Case's row in **Build** ▸ **Checks** reruns after every change, so it shows when the fix works.

If the try passes but the robot faulted, the simulation is off. To fit the joint, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

**Note:** After a fault, the simulation stops sending commands to the robot until you climb the **Ladder** again. A replay never moves the robot.

The 20 seconds come from the session's try, which stays in **Library** ▸ **Tries** along with the fault. See [Record a robot session as a try](/help/record-a-robot-session-as-a-try). **Replay in Sim** shows until the message leaves **Operate**.
