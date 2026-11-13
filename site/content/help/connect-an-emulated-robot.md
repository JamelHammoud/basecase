---
title: Connect an emulated robot
date: 2026-11-13
updated: 2026-11-13
collection: operate
type: task
order: 1
keywords:
  - hardware
  - real robot
  - serial
  - usb
  - feetech
  - sts3215
  - daemon
  - emulator
  - test motors
related:
  - the-motor-lock-and-safety-ladder
  - calibrate-an-emulated-robot
covers:
  - src/components/operate/OperatePanel.tsx
  - src/components/operate/RobotLadder.tsx
  - src/components/PlayTabs.tsx
  - src/workspace/operateCommands.tsx
  - src/robot/sceneRobot.ts
  - src/robot/robotStore.ts
  - electron/robot/
---

Run the robot in your scene against emulated servos, through the same control program and safety checks a real robot will use.

Every servo is emulated: no released build of Basecase can drive real motors. Operate is in the desktop app only.

1. Open a scene with a robot that has joints.
2. Click **Play** in the view rail.
3. Click **Operate** at the top of the panel.
4. Click **Connect Emulated Robot**. The header names the servos, such as "2 emulated Feetech servos", one for each joint that moves.
5. Under **Ladder**, click **Set Up** to check that every servo answers.
6. Click **Test** to switch the motors on. The header reads "Motors running" once they're on.

![Operate in Test with motors running, the ladder, and two emulated servos at 0.0°](/help/calibrate-an-emulated-robot/test.png)

7. Click **Simulate** at the top of the right panel.
8. Click the **Simulate** button. The emulated servos follow the simulation.
9. Click **Disconnect** when you're done.

**Show Operate**, **Connect Emulated Robot** and **Show Simulate** are also in [[⌘K]]. A blue dot on the **Operate** tab shows a robot is connected.

## What you're connected to

Basecase starts its robot daemon, the program that owns every motor command, on this computer. It talks to the app directly, with no network port. The daemon runs emulated Feetech STS3215 servos, numbered 1 upward in the order of the scene's moving joints.

A robot with a leg joint connects as legged, anything else as an arm. That decides what **Stop** does: an arm holds where it is, and a legged robot walks to its standing pose first.

Up to 32 servos can connect. A robot with more shows no **Connect Emulated Robot**.

## What's locked

Basecase can't open a serial port, so it can't reach a real servo, even one plugged in. Real motors unlock at the first hardware session, with a maintainer at the power switch. [The motor lock and safety ladder](/help/the-motor-lock-and-safety-ladder) explains each rung and what it guards.

**Rehearse** and the rungs above it run a policy on the robot itself. Basecase doesn't hand the daemon a policy. Clicking **Rehearse** answers "Load a policy first." Steps for running a skill today are in [Run a trained skill on the emulated robot](/help/run-a-trained-skill-on-the-emulated-robot).
