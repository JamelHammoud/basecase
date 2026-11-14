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

Use these steps if your robot shows Teach It to Move, has no Drive button, ignores the keys, the camera or your voice, or falls as soon as it moves.

## Teach It to Move shows instead of Drive

Teach It to Move takes the place of Drive when Basecase doesn't have a gait it can trust for your robot. That's the case if the robot has two legs, has wheels on legs, or fails the fall check. The fall check walks the robot for 5 seconds. To pass, the robot must move 3 cm forward without falling, tilting past 35° or dropping below 60% of its height.

1. Click **Teach It to Move**. If the robot stands on legs, this trains the Motor Kit's **Walk**. For any other robot, it asks the agent.
2. When **Walk** under **Train** shows its Arena line, click **Drive**.

To learn how to train **Walk**, see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

## There's no Drive button

**Drive** is hidden while a Case is open, because **Try It** drives instead.

1. Click **Close Case** (×) next to the Case's name in the **Simulate** tab.
2. Find **Drive** under **Control**.

If your robot has no arm, wheels or legs, it has nothing to drive, and **Drive** doesn't show.

**Drive with Camera** is hidden too while a Case is open, but you can still find it in [[⌘K]].

## The keys do nothing

The canvas reads "Click the canvas to drive." while a text field or a dialog has the keyboard.

1. Click the canvas.
2. Press [[W]] again.

Keys are released when the window loses focus, so switching to another app stops the robot.

## “Couldn’t open the camera.”

**Drive with Camera**, or a Case's hand or face input, didn't get a picture. Either Basecase isn't allowed to use the camera, or no camera is connected.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Camera**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Drive with Camera** or **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Camera**. In the web studio, allow the camera in your browser's site settings.

The same message appears when pose estimation can't start, even if the camera is allowed. The camera's tile then shows for a moment and closes. Quit and reopen Basecase, then click **Drive with Camera** again.

## “Couldn’t open the microphone. Allow Basecase to use it in Privacy & Security.”

A Case that listens for words didn't get any sound when you clicked **Try It**. Basecase might not be allowed to use the microphone, no microphone might be connected, or the voice model might not have loaded.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Microphone**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Microphone**. The web studio doesn't have a voice model, so a Case with voice shows “Voice works only in the desktop app.” there instead.

## Drive is grayed out

While a robot with legs runs its 5-second fall check in the background, **Drive** reads "Checking it stays up…". Wait for the check to finish. **Drive** then starts, or **Teach It to Move** takes its place.

## The robot falls over

If the robot falls, the overlay reads "Fell. Press R."

1. Press [[R]] to put the robot back where it started.
2. Drive more gently. Tap the keys instead of holding them down.
3. If it still falls, press [[Esc]] and choose **Hold pose** under **Control**.
4. Check **Peak torque** for joints at their limit.

To learn how to read **Peak torque**, see [Run a simulation](/help/run-a-simulation).
