---
title: Drive a robot in the simulation
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 2
keywords:
  - teleop
  - teleoperation
  - keyboard
  - wasd
  - joystick
  - controller
  - inverse kinematics
  - ik
  - gallery
related:
  - run-a-simulation
  - drive-a-robot-with-your-camera
  - try-a-case
covers:
  - src/components/simulate/ControlSection.tsx
  - src/components/simulate/CaseSections.tsx
  - src/components/simulate/DriveOverlay.tsx
  - src/workspace/useDriveKeys.ts
  - src/workspace/caseCommands.tsx
  - src/sim/driveKeys.ts
  - src/sim/driveAccess.ts
  - src/sim/useDrive.ts
  - src/sim/drive.ts
---

Steer an arm, a rover or a walking robot live in MuJoCo with the keyboard or a gamepad, before you build it.

1. Click **Simulate** at the top of the right panel, with no Case open.
2. In **Control**, click **Drive**. A robot with legs and no **Walk** skill first runs a 5-second fall check, shown as "Checking it stays up…".
3. Click the canvas so it gets the keys.
4. Steer with the keys under **Control**, or with a gamepad.
5. Press [[R]] to put the robot back where it started.
6. Press [[Esc]] to stop driving.

**Stop Driving** under **Control** stops too, and **Drive** is also in [[⌘K]]. With a Case open, **Try It** starts driving instead; see [Try a Case](/help/try-a-case).

A humanoid or an arm can also follow your own arms: click **Drive With Camera** under **Control**. Steps are in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

## Keys

| Robot | Keys | What they do |
|---|---|---|
| Arm | [[W A S D]] | Move the hand forward, back, left and right |
| Arm | [[Q E]] | Raise and lower the hand |
| Rover | [[W S]] | Drive forward and back |
| Rover | [[A D]] | Turn left and right |
| Legs | [[W S]] | Walk forward and back |
| Legs | [[A D]] | Turn left and right |
| Legs | [[Q E]] | Step sideways, left and right |
| Any | [[R]] | Start over |
| Any | [[Esc]] | Stop driving |

The arrow keys work like W A S D. While a text field has focus, the canvas says "Click the canvas to drive" and the keys do nothing.

## Gamepad

Basecase reads the first gamepad that's connected. A stick inside its deadzone leaves the keys in charge.

| Stick | Arm | Rover | Legs |
|---|---|---|---|
| Left, up and down | Hand forward and back | Forward and back | Walk forward and back |
| Left, sideways | Hand left and right | Turn | Step sideways |
| Right, sideways | | Turn | Turn |
| Right, up and down | Raise and lower the hand | | |

## What each robot does

An arm moves its hand by inverse kinematics (IK): you steer the hand, and Basecase works out the joint angles 50 times a second. The hand moves at up to 0.9 times the arm's reach per second and never leaves its reach. Let go of the keys and the hand holds where it is.

A robot with four or more legs walks a built-in gait. Once the robot has a ready **Walk** skill, Drive walks with that skill instead, two-legged robots included. The overlay shows the speed in m/s, and "Fell. Press R." when it falls.

A robot with two legs and no **Walk** shows **Teach It to Move** in place of **Drive**. So does one with wheels on its legs, or one that fails the fall check. [Robot won't drive in the simulation](/help/troubleshoot-drive) covers each case.

Three Cases drive in a browser with no install: [the six-joint arm](https://app.basecase.so/c/arm-touch-the-dots), [the two-wheel rover](https://app.basecase.so/c/rover-reach-the-flag) and [the hexapod](https://app.basecase.so/c/hexapod-reach-the-flag).
