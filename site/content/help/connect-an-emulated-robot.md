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

You can run the robot in your scene against emulated servos. It goes through the same control program and safety checks that a real robot will use.

Every servo is emulated, and no released build of Basecase can drive real motors. Operate is available only in the desktop app.

1. Open a scene with a robot that has joints.
2. Click **Play** in the view rail.
3. Click **Operate** at the top of the panel.
4. Click **Connect Emulated Robot**. The header names the servos, one for each joint that moves. For example, "2 emulated Feetech servos".
5. Under **Ladder**, click **Set Up** to check that every servo answers.
6. Click **Test** to turn on the motors. Once they're on, the header reads "Motors running".

![Operate in Test with motors running, the ladder, and two emulated servos at 0.0°](/help/calibrate-an-emulated-robot/test.png)

7. Click **Simulate** at the top of the right panel.
8. Click the **Simulate** button. The emulated servos follow the simulation.
9. When you're done, click **Disconnect**.

You can also find **Show Operate**, **Connect Emulated Robot**, **Simulate**, **Show Simulate** and **Disconnect Robot** in [[⌘K]]. A blue dot on the **Operate** tab shows that a robot is connected.

## What you're connected to

When you connect, Basecase starts its robot daemon on this computer. The daemon is the program that owns every motor command, and it talks to the app directly, with no network port.

The daemon runs the emulated servos on the Feetech bus, numbered from 1 upward in the order of the scene's moving joints. Each Feetech or Dynamixel servo behaves like the servo from Parts on its joint. Any other joint gets an STS3215. A joint whose motor isn't a Feetech or Dynamixel servo, such as the DS3218, reads No reply.

Each emulated servo sits on its joint with its own hidden offset of up to 12°, and about one in four is reversed. [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) finds both using a camera.

A robot with a leg joint connects as a legged robot, and anything else connects as an arm. This decides what **Stop** does: an arm holds where it is, and a legged robot walks to its standing pose first.

You can connect up to 32 servos. For a robot with more than that, **Connect Emulated Robot** doesn't appear.

## What's locked

Basecase can't open a serial port, so it can't reach a real servo, even if one is plugged in. Real motors unlock at the first hardware session, with a maintainer at the power switch. For each rung and what it guards, see [The motor lock and safety ladder](/help/the-motor-lock-and-safety-ladder).

**Rehearse** and the rungs above it need a trained policy. Basecase hands the robot the scene's newest ready skill or up-to-date policy when you connect, and hands over a newer one right away once it finishes training. Without one, clicking **Rehearse** shows "Load a policy first."

For steps to run a skill, see [Run a trained skill on the emulated robot](/help/run-a-trained-skill-on-the-emulated-robot).
