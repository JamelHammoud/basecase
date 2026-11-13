---
title: Drive a robot with your camera
date: 2026-11-13
image: /changelog/drive-a-robot-with-your-camera/cover.png
---

You can now drive a humanoid or a fixed arm in the simulation by moving your own arms in front of the Mac's camera. Frames stay on your Mac and are never saved.

Drive With Camera sits under Control in the Simulate tab and in ⌘K. It started with one request: move my arms at the Mac, and the G1's arms move with them.

Your camera shows as a tile above the robot's cameras, with your skeleton drawn over it. On a humanoid, every joint above the hips follows your arms, waist and head. On a fixed arm, the hand follows your right wrist, scaled to the arm's reach. On a robot with a gripper, a pinch of your left hand closes it. Each joint turns at up to 240° a second and stays inside its limits.

It follows one person, and sees each hand as four points, so single fingers don't move the robot. The camera is an input source like the keys and a gamepad, so a Case can list it.

Steps are in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).
