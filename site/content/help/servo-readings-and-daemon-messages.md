---
title: Servo readings and daemon messages
date: 2026-11-13
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
  - src/components/operate/RobotHeader.tsx
  - src/components/operate/RobotJoints.tsx
  - src/components/operate/RobotMessages.tsx
  - src/robot/intentMirror.ts
  - src/components/operate/JointRow.tsx
  - src/robot/jointRows.ts
  - src/robot/robotState.ts
  - hw/crates/robot-daemon/src/fault.rs
  - hw/crates/robot-daemon/src/ladder/mod.rs
---

What each line in Operate means: the rung, the motor state, each servo's angle and temperature, and every message the robot daemon sends.

The daemon reports every servo 10 times a second, and the app shows the newest reading.

![Operate in Test with motors running, the ladder, and a row for each joint](/help/calibrate-an-emulated-robot/test.png)

## Fleet rows

Operate lists each connected unit by name above the controls. Each row shows its rung and policy version. After Roll Out, it also shows the twin's pass count or failing contract line. A fault marks only that unit's row.

Click a row to select the unit. The header, Ladder, servo readings, messages and measured canvas robot then follow that unit. **Stop**, **Disconnect** and commands from the simulation apply to the selected unit.

![Operate with three units, each in Test, and the selected unit's controls below](/help/roll-out-a-skill-to-a-fleet/connected.png)

Hover a unit's row to find **Roll Back** when it has a previous policy. This restores the policy version. A joint's **Roll Back** instead restores its servo calibration. **Roll Back** beside **Body v1**, or a later body version, restores the [body fit](/help/fit-a-robots-body-from-a-recorded-run).

## The header

Below the fleet rows, the header names the servos, such as "2 emulated Feetech servos", then the motor state. A network connection shows the robot's announced name in its fleet row. **Disconnect** sits at its end. The **Ladder** below it marks the rung the robot is on, from **Look** to **Longer Runs**.

| Motor state | What it means |
|---|---|
| Motors off | No motor is powered |
| Starting motors… | Torque is ramping up from 5% over 1 second |
| Motors running | Motors follow the app's commands |
| Rehearsing, motors off | A policy runs with no motor writes |
| Stopping… | The robot is coming to rest |
| Stopped | The robot has stopped, and takes no more commands until you go back to **Look** |

**Stop** shows while motors run. **Clear Fault** shows in **Look** while a fault is active.

## Servo rows

Under **Emulated servos**, each joint has one row with its name and bus ID. IDs run from 1 upward in the order of the scene's moving joints. A calibrated joint shows its verdict under its name.

| Reading | What it means |
|---|---|
| An angle, such as 12.5° | The joint's position. 0° is its zero, count 2048 of 4096 until **Calibrate Servos** finds it |
| A temperature, such as 30 °C | The servo's temperature. It's switched off at 50 °C |
| No reply | The servo didn't answer this reading, or its motor isn't a Feetech or Dynamixel servo, such as the DS3218, so the daemon can't read it |
| Garbled reply | The servo's answer was corrupted |
| Wrong ID answered | Another servo answered for this one |

## Messages from the daemon

Operate shows the newest six messages. A new connection clears them.

When the daemon refuses a rung:

| Message | Why |
|---|---|
| "Climb the ladder one step at a time." | The rung isn't the next one |
| "A fault is still active. Go back to Look and clear it first." | A fault is latched |
| "Check the servos first: every servo must answer with the right model." | **Set Up** hasn't passed |
| "Calibrate the robot first." | There's no calibration |
| "Load a policy first." | The unit has no loaded policy |
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

On an arm, a fault that stops the robot has **Replay in Sim** under it, which plays the 20 seconds before it in the simulation: [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation). From a fault until you climb the **Ladder** again, the simulation sends the robot no commands.

When the daemon exits or the network connection drops, Operate shows its lost-contact message. For Feetech, it reads "Lost contact with the robot. Feetech servos keep holding their last position, so switch off their power."

A lost network connection leaves the daemon running on the robot computer. Its watchdog starts the stop plan after 100 ms without a heartbeat. Reconnect through the robot list and climb from **Look** again, as shown in [Connect a robot computer](/help/connect-a-robot-computer).

To clear a fault, see [Emulated robot refuses a rung or stops](/help/troubleshoot-emulated-robot).
