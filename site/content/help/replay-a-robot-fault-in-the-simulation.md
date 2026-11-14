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

When a servo faults, you can turn the 20 seconds before the fault into a Case and replay it in the simulation. The replay shows whether the fault came from your design or from the simulation.

**Replay in Sim** only works with a robot that has an arm.

1. Connect the emulated robot and climb the **Ladder** to **Test**. To learn how, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. In **Simulate**, click **Drive**.
3. Move the arm. The robot follows the simulation.
4. If a fault stops a motor, find its message in **Operate** under **Stopped by a fault**.
5. Click **Replay in Sim** under the message.

   ![Operate showing a stall on servo 2, with Replay in Sim under the message](/help/replay-a-robot-fault-in-the-simulation/fault.png)

6. Watch the replay. **Simulate** opens a Case named after the time of the fault and selects the link of the joint that faulted. The Case plays once as a try.
7. Check **Results**. **Peak torque** shows the highest torque each joint reached, as a share of its stall torque. The try shows either **Passed** or **Missed**.

   ![Results after the replay, with both joints at 100% and the try missed](/help/replay-a-robot-fault-in-the-simulation/results.png)

The Case starts from the first pose measured on the robot, then sends every command the robot's joints received, with the robot's timing. Starting 1.5 seconds in, the try passes as long as no joint reaches 98% of the most torque its servo can push.

If the try is missed, the design can't make that move with those servos. Switch to a stronger servo or make the arm lighter. Each time you make a change, Basecase reruns the Case's row in **Build** ▸ **Checks**, so you can tell when the fix works.

If the try passes but the robot still faulted, the simulation is wrong. To fit the joint, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

**Note:** After a fault, the simulation stops sending commands to the robot until you climb the **Ladder** again. A replay never moves the robot.

The 20 seconds come from the session's try, which you can find in **Library** ▸ **Tries** with the **Operate** badge. To learn more, see [Record a robot session as a try](/help/record-a-robot-session-as-a-try). **Replay in Sim** stays under the message for as long as the message is in **Operate**.
