---
title: Drive a robot with your arms
date: 2026-11-13
image: /changelog/drive-a-robot-with-your-arms/cover.png
---

You can now drive a humanoid's arms, or a fixed robot arm, by moving your own in front of your computer's camera. It works in the simulation.

Drive with Camera is in the Simulate tab's Control section, and in ⌘K. Collecting arm demonstrations for a humanoid meant keyframing poses or a separate motion capture setup. Now you raise your arm and the robot raises its arm, and a Case try records it as a demonstration.

The camera's tile shows beside the canvas with your skeleton drawn over it. A humanoid's arms, waist and head follow yours, each joint at most 240° a second and inside its limits. Its legs stay still. Without a Walk skill its base is held in place; with one, the keys still walk it. A fixed arm's hand follows your right hand, and pinching your left fingers closes its gripper.

Pose estimation runs on your computer, and the camera's picture is never saved or sent anywhere. Press Esc to stop, and the camera turns off.

Steps are in [Drive a robot with your camera](/help/drive-a-robot-with-your-camera).
