---
title: Robot won't drive in the simulation
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 1
keywords:
  - drive missing
  - keys not working
  - wasd not working
  - teach it to move
  - falls over
  - fell
  - checking it stays up
  - camera not working
related:
  - drive-a-robot-in-the-simulation
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/components/simulate/ControlSection.tsx
  - src/components/simulate/DriveOverlay.tsx
  - src/workspace/useDriveKeys.ts
  - src/sim/driveAccess.ts
  - src/sim/useDrive.ts
  - src/workspace/useCameraToast.ts
  - electron/permissions.mjs
---

Fixes for a robot that shows Teach It to Move, has no Drive button, ignores the keys or the camera, or falls as it moves.

## Teach It to Move shows instead of Drive

Drive has no gait it can trust for this robot. That happens with two legs, with wheels on legs, or when the robot fails the fall check. The check walks the robot for 5 seconds. It must move 3 cm forward without falling, tilting past 35° or dropping below 60% of its height.

1. Click **Teach It to Move**. On a robot that stands on legs, it trains the Motor Kit's **Walk**; on anything else, it asks the agent.
2. When **Walk** under **Train** shows its Arena line, click **Drive**.

Training **Walk** is in [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

## There's no Drive button

**Drive** hides while a Case is open, because **Try It** drives instead.

1. Click **Close Case** (×) beside **Brief** in the **Simulate** tab.
2. Find **Drive** under **Control**.

A robot with no arm, wheels or legs has nothing to drive, and shows no **Drive** at all. **Drive With Camera** shows only for a humanoid or an arm fixed to the ground.

## The keys do nothing

The canvas reads "Click the canvas to drive" while a text field or a dialog has the keyboard.

1. Click the canvas.
2. Press [[W]] again.

Keys also let go when the window loses focus, so switching apps stops the robot.

## The camera doesn't open

A toast reads "Couldn’t open the camera: Camera access is off in System Settings." macOS refused Basecase the camera, often after **Don’t Allow** at its first prompt.

1. Open **System Settings** and choose **Privacy & Security** ▸ **Camera**.
2. Turn on **Basecase**. If macOS offers **Quit & Reopen**, choose it.
3. Click **Drive With Camera** again.

## Drive is greyed out

It reads "Checking it stays up" while a robot with legs walks a 5-second fall check in the background. Wait for it to finish; **Drive** then starts, or **Teach It to Move** takes its place.

## The robot falls over

The overlay reads "Fell. Press R."

1. Press [[R]] to put the robot back where it started.
2. Drive more gently: tap the keys instead of holding them.
3. If it still falls, press [[Esc]] and choose **Hold pose** under **Control**.
4. Read **Peak torque** for joints at their limit.

Steps for reading **Peak torque** are in [Run a simulation](/help/run-a-simulation).
