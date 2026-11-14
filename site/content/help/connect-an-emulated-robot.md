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
  - connect-an-emulated-ros-2-robot
  - keep-a-robot-session-as-a-try
covers:
  - src/components/operate/OperatePanel.tsx
  - src/components/operate/RobotLadder.tsx
  - src/components/PlayTabs.tsx
  - src/workspace/operateCommands.tsx
  - src/robot/sceneRobot.ts
  - src/robot/robotStore.ts
  - src/robot/robotPolicy.ts
  - electron/robot/
---

You can connect the robot in your scene to emulated servos. It runs through the same control program and safety checks that a real robot will use.

**Note:** Every servo is emulated. No released build of Basecase can drive real motors. Operate is available only in the desktop app.

1. Open a scene with a robot that has joints.
2. Click **Play** in the view rail.
3. Click **Operate** at the top of the panel.
4. Click **Connect Emulated Robot**. The header lists one servo for each joint that moves, for example "2 emulated Feetech servos".
5. Under **Ladder**, click **Set Up** to check that every servo answers.
6. Click **Test** to turn on the motors. When they're on, the header reads "Motors running".

![Operate in Test with motors running, the ladder, and two emulated servos at 0.0°](/help/calibrate-an-emulated-robot/test.png)

7. Click **Simulate** at the top of the right panel.
8. Click the **Simulate** button. The emulated servos follow the simulation.
9. When you're finished, click **Disconnect**.

**Show Operate**, **Connect Emulated Robot**, **Simulate**, **Show Simulate** and **Disconnect Robot** are also in [[⌘K]]. While a robot is connected, the **Operate** tab shows a blue dot.

## What you're connected to

When you connect, Basecase starts its robot daemon on your computer. The daemon is the program that sends every motor command. It talks to the app directly and doesn't use a network port.

The daemon runs the emulated servos on the Feetech bus, numbered from 1 upward in the same order as the scene's moving joints. If a joint has a Feetech or Dynamixel servo from Parts, its emulated servo behaves like that servo. Any other joint gets an STS3215. A joint whose motor isn't a Feetech or Dynamixel servo, such as the DS3218, reads No reply.

Each emulated servo sits on its joint with a hidden offset of up to 12°, and about one in four is reversed. To find both with a camera, see [Calibrate an emulated robot](/help/calibrate-an-emulated-robot).

A robot with a leg joint connects as a legged robot, and any other robot connects as an arm. This changes what **Stop** does:

- An arm holds its position.
- A legged robot walks to its standing pose first.

You can connect up to 32 servos. If a robot has more than 32, **Connect Emulated Robot** doesn't appear.

## What's locked

Basecase can't open a serial port, so it can't reach a real servo, even if one is plugged in. Real motors will be unlocked at the first hardware session, with a maintainer at the power switch. To learn what each rung does and what it guards, see [The motor lock and safety ladder](/help/the-motor-lock-and-safety-ladder).

**Rehearse** and the rungs above it need a trained policy. When you connect, Basecase gives the robot the scene's newest ready skill or up-to-date policy. If a newer one finishes training while you're connected, Basecase hands it over right away. If there's no policy, clicking **Rehearse** shows "Load a policy first."

To run a skill, see [Run a trained skill on the emulated robot](/help/run-a-trained-skill-on-the-emulated-robot).
