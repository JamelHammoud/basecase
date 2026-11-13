---
title: Drive a robot by tilting your phone
date: 2026-11-13
image: /changelog/drive-a-robot-by-tilting-your-phone/cover.png
---

You can now steer a robot in the simulation by tilting your phone, after scanning one code from the desktop app. It works on rovers, walking robots and arms.

Pair Phone is in ⌘K. The phone needs no app: the code opens a small page that the desktop app serves on your network while pairing is on. Steering a quadruped around a scanned room took the keys or a gamepad, and a phone is the controller everyone already carries.

Tilting the top down drives forward and tilting an edge down turns. A phone within 4° of level holds still, and 25° is full speed. On an arm, tilt moves the hand and the touch pad raises it. The A button closes the gripper. Each press of A or B also reaches a Case's logic as a named event, so a game can react to it.

The phone page sends about 30 readings a second over one connection. The app takes at most 60 a second and drops anything else. If the phone locks, the robot stops within half a second.

Pairing needs the desktop app and a phone on the same network. The browser shows a warning first, because Basecase makes a new certificate for each pairing.

Steps are in [Drive a robot with your phone](/help/drive-a-robot-with-your-phone).
