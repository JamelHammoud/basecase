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

If your robot won't drive, find the section that matches what you see: it shows Teach It to Move, has no Drive button, ignores the keys, the camera or your voice, or falls as soon as it moves.

## Teach It to Move shows instead of Drive

Basecase shows Teach It to Move in place of Drive when it has no gait it trusts for your robot. That happens when the robot has two legs, has wheels on legs, or fails the fall check. The fall check walks the robot for 5 seconds. To pass, the robot has to move 3 cm forward without falling, tilting past 35° or dropping below 60% of its height.

1. Click **Teach It to Move**. If the robot stands on legs, this trains the Motor Kit's **Walk**. For any other robot, it asks the agent.
2. When **Walk** under **Train** shows its Arena line, click **Drive**.

To learn how to train **Walk**, see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit).

## There's no Drive button

While a Case is open, **Try It** drives the robot, so Basecase hides **Drive**.

1. Click **Close Case** (×) next to the Case's name in the **Simulate** tab.
2. Find **Drive** under **Control**.

**Drive with Camera** is hidden while a Case is open too, but you can still open it from [[⌘K]].

A robot with no arm, wheels or legs has nothing to drive, so Basecase doesn't show **Drive** for it.

## The keys do nothing

If a text field or a dialog has the keyboard, the canvas reads "Click the canvas to drive."

1. Click the canvas.
2. Press [[W]] again.

If you switch to another app, the robot stops. Basecase releases the keys when its window loses focus.

## “Couldn’t open the camera.”

**Drive with Camera**, or a Case's hand or face input, didn't get a picture. Basecase may not have permission to use the camera, or no camera is connected.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Camera**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Drive with Camera** or **Try It** again.

On Windows, turn on the same switch in **Settings** ▸ **Privacy & security** ▸ **Camera**. In the web studio, allow the camera in your browser's site settings.

If the camera is allowed but pose estimation can't start, you see the same message. The camera's tile shows for a moment and then closes. Quit and reopen Basecase, then click **Drive with Camera** again.

## “Couldn’t open the microphone. Allow Basecase to use it in Privacy & Security.”

You clicked **Try It** on a Case that listens for words, and it got no sound. Basecase may not have permission to use the microphone, no microphone may be connected, or the voice model may not have loaded.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Microphone**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Try It** again.

On Windows, turn on the same switch in **Settings** ▸ **Privacy & security** ▸ **Microphone**. The web studio has no voice model, so a Case with voice shows “Voice works only in the desktop app.” there instead.

## Drive is grayed out

On any robot with legs, Basecase runs a 5-second fall check in the background. While it runs, **Drive** reads "Checking it stays up…". Wait for the check to finish. Basecase then either starts **Drive** or shows **Teach It to Move** in its place.

## The robot falls over

If the robot falls, the overlay reads "Fell. Press R."

1. Press [[R]] to put the robot back where it started.
2. Go easier on the controls. Tap the keys instead of holding them down.
3. If it still falls, press [[Esc]] and choose **Hold pose** under **Control**.
4. Check **Peak torque** for joints at their limit.

To learn how to read **Peak torque**, see [Run a simulation](/help/run-a-simulation).
