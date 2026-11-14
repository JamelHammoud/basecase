---
title: Emulated robot refuses a rung or stops
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 2
keywords:
  - operate not working
  - connect missing
  - fault
  - clear fault
  - load a policy first
  - daemon lost
  - calibrate missing
  - refused
related:
  - connect-an-emulated-robot
  - servo-readings-and-daemon-messages
covers:
  - src/components/operate/OperatePanel.tsx
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/RobotMessages.tsx
  - src/robot/sceneRobot.ts
  - src/robot/robotPolicy.ts
  - hw/crates/robot-daemon/src/ladder/mod.rs
  - hw/crates/robot-daemon/src/fault.rs
  - electron/robot/robotLink.mjs
---

Fixes for Operate when Connect is missing, a rung is refused, a fault stops the motors, or Calibrate Servos doesn't show.

## Connect Emulated Robot is missing

Operate shows "No robot" when the scene has no joint that moves. With more than 32 moving joints, it shows nothing to connect. Operate isn't in the browser version of Basecase.

1. Click **Show Robots** under "No robot".
2. Click a robot in **Parts** to insert it.
3. Click **Operate** again.

## "This copy of Basecase can’t run robots"

Your copy of Basecase lacks the robot daemon, the program that drives the emulated servos. Connect can't start without it.

1. Quit Basecase.
2. Download Basecase again from [Install Basecase](/help/install-basecase), and replace the copy you have.
3. Open Basecase and click **Connect Emulated Robot** again.

## "Load a policy first"

**Rehearse** and every rung above it need a trained policy, and the scene in front has none the robot can take. Basecase hands over the newest ready skill or up-to-date policy. A policy marked **Out of date** doesn't count; [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy) fixes it. A skill that replays an animation has no policy to hand over.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, click **Train** on a skill, and wait until it's ready.
3. Click **Rehearse** in **Operate** again. You don't need to reconnect.

## "A fault is still active"

The daemon says "A fault is still active. Go back to Look and clear it first." A fault stopped the motors, and it stays until you clear it.

1. Read the fault under the servo count, and fix what it names.
2. Click **Look** under **Ladder**.
3. Click **Clear Fault**.
4. Click **Set Up**.
5. Click **Test**.

From the fault until you climb again, the simulation sends the robot no commands. On an arm, **Replay in Sim** under the fault plays the 20 seconds before it in the simulation. Steps are in [Replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).

## "The app stopped talking to the robot"

The full message is "The app stopped talking to the robot, so the robot is holding still." The app missed its 100 ms check-in with the robot daemon. That happens when the computer is heavily loaded or goes to sleep.

1. Click **Look** under **Ladder**.
2. Click **Clear Fault**, if it shows.
3. Click **Set Up**.
4. Click **Test**.

## Calibrate Servos is missing

**Calibrate Servos** shows only in **Test** with "Motors running", in the scene the robot was connected from.

1. Switch to the scene's tab you connected from.
2. Climb to **Test**, and wait for "Motors running".

## "Lost contact with the robot"

**Daemon lost** shows "Lost contact with the robot. Feetech servos keep holding their last position, so switch off their power." The robot daemon closed without being asked, and nothing moves until you connect again.

1. Click **Connect Emulated Robot**.
2. Climb the ladder again from **Set Up**.

Every message the daemon sends is listed in [Servo readings and daemon messages](/help/servo-readings-and-daemon-messages).
