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

If Operate won't let you climb a rung, or the emulated robot stops, look for the message or missing button below.

## Connect Emulated Robot is missing

Operate needs a joint that moves. In a scene without one, Operate shows "No robot." In a scene with more than 32 moving joints, it doesn't show anything to connect.

**Note:** Operate isn't available in the browser version of Basecase.

To add a robot to the scene:

1. Click **Show Robots** under "No robot".
2. Click a robot in **Parts** to insert it.
3. Click **Operate** again.

## "This copy of Basecase can’t run robots"

Your copy of Basecase is missing the part that runs robots, so Connect can't start.

1. Quit Basecase.
2. Download Basecase again from [Install Basecase](/help/install-basecase), and replace the copy you have.
3. Open Basecase and click **Connect Emulated Robot** again.

## "Load a policy first"

**Rehearse** and every rung above it need a trained policy. You see this message when the scene in front doesn't have a policy the robot can take.

Basecase gives the robot the newest skill that's ready, or the newest policy that's up to date. It skips:

- Policies marked **Out of date**. To fix one, see [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy).
- Skills that replay an animation. These don't have a policy to give the robot.

To train a policy:

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, click **Train** on a skill, then wait until it's ready.
3. Click **Rehearse** in **Operate** again. You don't need to reconnect.

## "A fault is still active"

When a fault stops the motors, it stays active until you clear it. If you try to climb the ladder before then, the daemon shows "A fault is still active. Go back to Look and clear it first."

1. Read the fault shown under the servo count, and fix the problem it names.
2. Click **Look** under **Ladder**.
3. Click **Clear Fault**.
4. Click **Set Up**.
5. Click **Test**.

From the moment of the fault until you climb the ladder again, the simulation doesn't send the robot any commands.

If the robot is an arm, you can click **Replay in Sim** under the fault to play the 20 seconds before it in the simulation. The replay uses the session's Operate try, which you can find in **Library** under **Tries**. Learn how to [replay a robot fault in the simulation](/help/replay-a-robot-fault-in-the-simulation).

## "The app stopped talking to the robot"

The full message is "The app stopped talking to the robot, so the robot is holding still." The app checks in with the robot daemon every 100 ms, and this message appears when it misses a check-in. That can happen when your computer is under heavy load or goes to sleep.

1. Click **Look** under **Ladder**.
2. If you see **Clear Fault**, click it.
3. Click **Set Up**.
4. Click **Test**.

## Calibrate Servos is missing

**Calibrate Servos** appears in **Test** once "Motors running" shows, and only in the scene you connected the robot from.

1. Switch to the tab of the scene you connected from.
2. Climb to **Test**, then wait for "Motors running".

## "Lost contact with the robot"

When the robot daemon closes on its own, Operate shows **Daemon lost** with the message "Lost contact with the robot. Feetech servos keep holding their last position, so switch off their power." Nothing moves until you connect again.

1. Click **Connect Emulated Robot**.
2. Climb the ladder again from **Set Up**.

## Learn more

- [Servo readings and daemon messages](/help/servo-readings-and-daemon-messages) lists every message the daemon sends.
