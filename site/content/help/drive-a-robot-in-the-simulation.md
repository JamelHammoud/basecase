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

Before you build a robot, you can steer it live in MuJoCo with the keyboard or a gamepad. You can drive arms, rovers, and walking robots.

1. Click **Simulate** at the top of the right panel. Make sure no Case is open.
2. In **Control**, click **Drive**. If the robot has legs and no **Walk** skill, Basecase first runs a 5-second fall check and shows "Checking it stays up…".
3. Click the canvas so it receives your key presses.
4. Steer with the keys listed under **Control**, or with a gamepad.
5. To put the robot back where it started, press [[R]].
6. To stop driving, press [[Esc]].

To stop driving, you can also click **Stop Driving** under **Control**. You can also find **Drive** in [[⌘K]]. If a Case is open, click **Try It** to start driving instead. See [Try a Case](/help/try-a-case).

A humanoid or an arm can also follow your own arms. Click **Drive with Camera** under **Control**, then follow the steps in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).

## Keys

| Robot | Keys | What they do |
|---|---|---|
| Arm | [[W A S D]] | Move the hand forward, back, left, and right |
| Arm | [[Q E]] | Raise and lower the hand |
| Rover | [[W S]] | Drive forward and back |
| Rover | [[A D]] | Turn left and right |
| Legs | [[W S]] | Walk forward and back |
| Legs | [[A D]] | Turn left and right |
| Legs | [[Q E]] | Step sideways, left and right |
| Any | [[R]] | Start over |
| Any | [[Esc]] | Stop driving |

The arrow keys work the same way as [[W A S D]]. While a text field has focus, the keys do nothing and the canvas shows "Click the canvas to drive".

## Gamepad

Basecase reads the first connected gamepad. The keys stay in control as long as a stick is inside its deadzone.

| Stick | Arm | Rover | Legs |
|---|---|---|---|
| Left, up and down | Hand forward and back | Forward and back | Walk forward and back |
| Left, sideways | Hand left and right | Turn | Step sideways |
| Right, sideways | | Turn | Turn |
| Right, up and down | Raise and lower the hand | | |

## What each robot does

An arm moves its hand with inverse kinematics (IK). You steer the hand, and Basecase works out the joint angles 50 times a second. The hand moves at up to 0.9 times the arm's reach per second and never goes outside that reach. When you let go of the keys, the hand stays where it is.

A robot with four or more legs walks with a built-in gait. Once a robot has a ready **Walk** skill, Drive walks with that skill instead, and this applies to two-legged robots too. The overlay shows the speed in m/s. If the robot falls, the overlay shows "Fell. Press R."

Some robots show **Teach It to Move** instead of **Drive**:

- A robot with two legs and no **Walk** skill
- A robot with wheels on its legs
- A robot that fails the fall check

To find out why, see [Robot won't drive in the simulation](/help/troubleshoot-drive).

You can drive three Cases in a browser without installing anything: [the six-joint arm](https://app.basecase.so/c/arm-touch-the-dots), [the two-wheel rover](https://app.basecase.so/c/rover-reach-the-flag), and [the hexapod](https://app.basecase.so/c/hexapod-reach-the-flag).
