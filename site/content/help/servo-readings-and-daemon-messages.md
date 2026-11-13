---
title: Servo readings and daemon messages
date: 2026-11-13
updated: 2026-11-13
collection: operate
type: reference
order: 1
keywords:
  - telemetry
  - joint angles
  - temperature
  - status
  - fault
  - error
  - no reply
  - refused
  - daemon lost
related:
  - connect-an-emulated-robot
  - the-motor-lock-and-safety-ladder
covers:
  - src/components/operate/OperatePanel.tsx
  - src/components/operate/RobotJoints.tsx
  - src/components/operate/RobotMessages.tsx
  - src/components/operate/JointRow.tsx
  - src/robot/jointRows.ts
  - src/robot/robotState.ts
  - hw/crates/robot-daemon/src/fault.rs
  - hw/crates/robot-daemon/src/ladder/mod.rs
---

What each line in Operate means: the rung, the motor state, each servo's angle and temperature, and every message the robot daemon sends.

The daemon reports every servo 10 times a second, and the app shows the newest reading.

![Operate in Test with motors running, the ladder, and a row for each joint](/help/calibrate-an-emulated-robot/test.png)

## The header

The first line names the servos, such as "2 emulated Feetech servos", then the motor state, with **Disconnect** at its end. The **Ladder** below it marks the rung the robot is on, from **Look** to **Longer Runs**.

| Motor state | What it means |
|---|---|
| Motors off | No motor is powered |
| Starting motors | Torque is ramping up from 5% over 1 second |
| Motors running | Motors follow the app's commands |
| Rehearsing, motors off | A policy runs with no motor writes |
| Stopping | The robot is coming to rest |
| Stopped | The robot has stopped, and takes no more commands until you go back to **Look** |

**Stop** shows while motors run. **Clear Fault** shows in **Look** while a fault is active.

## Servo rows

Under **Emulated servos**, each joint has one row with its name and bus ID. IDs run from 1 upward in the order of the scene's moving joints. A calibrated joint shows its verdict under its name.

| Reading | What it means |
|---|---|
| An angle, such as 12.5° | The servo's position; 0° is its centre, count 2048 of 4096 |
| A temperature, such as 30 °C | The servo's temperature; it's switched off at 50 °C |
| No reply | The servo didn't answer this reading |
| Garbled reply | The servo's answer was corrupted |
| Wrong ID answered | Another servo answered for this one |

## Messages from the daemon

The newest six messages show under the first line, each labelled by kind: **Stopped by a fault**, **Refused**, **Stopped** or **Daemon lost**. A new connection clears them.

When the daemon refuses a rung:

| Message | Why |
|---|---|
| "Climb the ladder one step at a time." | The rung isn't the next one |
| "A fault is still active. Go back to Look and clear it first." | A fault is latched |
| "Check the servos first: every servo must answer with the right model." | **Set Up** hasn't passed |
| "Calibrate the robot first." | There's no calibration |
| "Load a policy first." | The daemon has no policy; Basecase doesn't load one |
| "Test every joint with the current calibration first." | **Test** hasn't finished with this calibration |
| "Rehearse the current policy first." | **Rehearse** hasn't finished with this policy |

When a fault stops the robot, the message names the servo or joint, such as:

| Message | What stopped |
|---|---|
| "Servo 3 stopped answering, so the robot is holding still. Check its cable, then start again." | Every write |
| "Servo 2 reached 51 °C, so it was switched off to cool down. Let it rest for 10 minutes." | That motor |
| "The servo supply is at 5.8 V, outside the safe range, so all motors were switched off. Check the battery or power supply." | Every motor |
| "The servo 2 joint moved the wrong way, so its motor was switched off. Check its direction in calibration." | That motor |
| "The servo 2 joint is outside its calibrated range, so the motors stay off. Move it back by hand, then start again." | Every motor |
| "The app stopped talking to the robot, so the robot is holding still." | The robot holds |
| "Commands stopped arriving, so the robot is holding still." | The robot holds |

When the daemon itself exits without being asked, **Daemon lost** shows "Lost contact with the robot. Feetech servos keep holding their last position, so switch off their power."

To clear a fault, see [Emulated robot refuses a rung or stops](/help/troubleshoot-emulated-robot).
