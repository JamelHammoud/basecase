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

Use these steps if your robot shows Teach It to Move in place of Drive or has no Drive button. They also help if it ignores the keys, the camera or your voice, or falls over as soon as it moves.

## Teach It to Move shows instead of Drive

Basecase has no gait it can trust for a robot with two legs or wheels on legs, or for one that fails the fall check, so it shows Teach It to Move for those robots.

The fall check walks your robot for 5 seconds. It passes if the robot moves 3 cm forward without falling, tilting past 35° or dropping below 60% of its height.

1. Click **Teach It to Move**. On a robot that stands on legs, it trains the Motor Kit's **Walk**. On any other robot, it asks the agent.
2. Wait for **Walk** under **Train** to show its Arena line, then click **Drive**.

[Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit) shows you how to train **Walk**.

## There's no Drive button

While a Case is open, you drive with **Try It**, so Basecase hides **Drive**.

1. Click **Close Case** (×) next to the Case's name in the **Simulate** tab.
2. Look for **Drive** under **Control**.

A robot with no arm, wheels or legs has nothing to drive, so **Drive** doesn't appear for it.

**Note:** Basecase also hides **Drive with Camera** while a Case is open. You can still find it in [[⌘K]].

## The keys do nothing

If a text field or a dialog has the keyboard, the canvas reads "Click the canvas to drive."

1. Click the canvas.
2. Press [[W]] again.

Basecase releases the keys when its window loses focus, so the robot stops if you switch to another app.

## “Couldn’t open the camera.”

**Drive with Camera**, or a Case's hand or face input, didn't get a picture. Either Basecase doesn't have permission to use the camera, or no camera is connected.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Camera**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Drive with Camera** or **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Camera**. In the web studio, allow the camera in your browser's site settings.

You'll also get this message if pose estimation can't start, even with the camera allowed. The camera's tile then shows for a moment and closes. Quit and reopen Basecase, then click **Drive with Camera** again.

## “Couldn’t open the microphone. Allow Basecase to use it in Privacy & Security.”

You clicked **Try It** on a Case that listens for words, and it got no sound. Basecase may not have permission to use the microphone, no microphone may be connected, or the voice model didn't load.

1. On a Mac, open **System Settings** ▸ **Privacy & Security** ▸ **Microphone**.
2. Turn on **Basecase**.
3. Quit and reopen Basecase.
4. Click **Try It** again.

On Windows, the same switch is in **Settings** ▸ **Privacy & security** ▸ **Microphone**. The web studio has no voice model, so a Case with voice shows “Voice works only in the desktop app.” there.

## Drive is grayed out

On a robot with legs, Basecase runs a 5-second fall check in the background, and **Drive** reads "Checking it stays up…" while it runs. Wait for the check to finish. Then **Drive** starts, or **Teach It to Move** takes its place.

## The robot falls over

If the robot falls, the overlay reads "Fell. Press R."

1. Press [[R]] to put the robot back where it started.
2. Drive with short taps on the keys instead of holding them down.
3. If it still falls, press [[Esc]] and choose **Hold pose** under **Control**.
4. Look in **Peak torque** for any joints at their limit.

[Run a simulation](/help/run-a-simulation) shows you how to read **Peak torque**.
