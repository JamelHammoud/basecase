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
  - camera
  - couldn't open the camera
  - microphone
  - couldn't open the microphone
related:
  - drive-a-robot-in-the-simulation
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/components/simulate/ControlSection.tsx
  - src/components/simulate/DriveOverlay.tsx
  - src/workspace/useDriveKeys.ts
  - src/sim/driveAccess.ts
  - src/sim/useDrive.ts
  - src/cameras/operator/operatorCamera.ts
  - electron/permissions.mjs
  - src/voice/voiceSession.ts
---

Fixes for a robot that shows Teach It to Move, has no Drive button, ignores the keys, the camera or your voice, or falls as soon as it moves.

## Teach It to Move shows instead of Drive

Drive has no gait it can trust for this robot. That happens with two legs, with wheels on legs, or when the robot fails the fall check. The check walks the robot for 5 seconds. It must move 3 cm forward without falling, tilting past 35° or dropping below 60% of its height.

1. Click **Teach It to Move**. On a robot that stands on legs, it trains the Motor Kit's **Walk**; on anything else, it asks the agent.
2. When **Walk** under **Train** shows its Arena line, click **Drive**.

Training **Walk** is in [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

## There's no Drive button

**Drive** hides while a Case is open, because **Try It** drives instead.

1. Click **Close Case** (×) beside the Case's name in the **Simulate** tab.
2. Find **Drive** under **Control**.

A robot with no arm, wheels or legs has nothing to drive, and shows no **Drive** at all.

**Drive with Camera** hides while a Case is open too, but stays in [[⌘K]].

## The keys do nothing

The canvas reads "Click the canvas to drive" while a text field or a dialog has the keyboard.

1. Click the canvas.
2. Press [[W]] again.

Keys also let go when the window loses focus, so switching apps stops the robot.

## “Couldn’t open the camera.”

**Drive with Camera**, or a Case's hand or face input, got no picture. Basecase isn't allowed to use the camera, or no camera is connected.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Camera**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Drive with Camera** or **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Camera**. In the web studio, allow the camera in the browser's site settings.

The same message shows when pose estimation can't start, even with the camera allowed. The camera's tile shows for a moment, then closes. Quit and reopen Basecase, then click **Drive with Camera** again.

## “Couldn’t open the microphone. Allow Basecase to use it in Privacy & Security.”

A Case that listens for words got no sound when you clicked **Try It**. Basecase isn't allowed to use the microphone, no microphone is connected, or the voice model didn't load.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Microphone**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Microphone**. The web studio has no voice model, so a Case with voice shows “Voice works only in the desktop app.” there.

## Drive is grayed out

It reads "Checking it stays up…" while a robot with legs walks a 5-second fall check in the background. Wait for it to finish; **Drive** then starts, or **Teach It to Move** takes its place.

## The robot falls over

The overlay reads "Fell. Press R."

1. Press [[R]] to put the robot back where it started.
2. Drive more gently: tap the keys instead of holding them.
3. If it still falls, press [[Esc]] and choose **Hold pose** under **Control**.
4. Read **Peak torque** for joints at their limit.

Steps for reading **Peak torque** are in [Run a simulation](/help/run-a-simulation).
