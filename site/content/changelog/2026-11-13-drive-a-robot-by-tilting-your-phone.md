---
title: Drive a robot by tilting your phone
date: 2026-11-13
image: /changelog/drive-a-robot-by-tilting-your-phone/cover.png
---

You can now steer a robot in the simulation by tilting your phone. Scan one code from the desktop app and the phone becomes the controller.

It works with rovers, walking robots and arms.

Open ⌘K and run Pair Phone. You don't need an app on the phone. The code opens a small page that the desktop app serves on your network while pairing is on.

Until now, steering a quadruped around a scanned room took the keys or a gamepad. Now you can use your phone.

## Tilt to Drive

Tilt the top of the phone down to drive forward, or tilt an edge down to turn. Within 4° of level the robot stays still, and at 25° it goes full speed.

On an arm, tilting the phone moves the hand, and you raise it with the touch pad. Press A to close the gripper.

Each press of A or B also reaches a Case's logic as a named event, so a game can react to it.

## What the Phone Sends

The phone page sends about 30 readings a second over one connection. The app takes at most 60 a second and drops the rest.

If the phone locks, the robot stops within half a second.

## Pairing

The desktop app and the phone need to be on the same network. The browser shows a warning first, because Basecase makes a new certificate for each pairing.

Read [Drive a robot with your phone](/help/drive-a-robot-with-your-phone) in the help center for the steps.
