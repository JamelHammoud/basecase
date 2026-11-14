---
title: Drive a robot with your arms
date: 2026-11-13
image: /changelog/drive-a-robot-with-your-arms/cover.png
---

You can now drive a humanoid's arms, or a fixed robot arm, by moving your own in front of your computer's camera. It works in the simulation.

Open Drive with Camera from the Control section of the Simulate tab, or from ⌘K. The camera's tile shows up beside the canvas, with your skeleton on top of the picture.

Until now, collecting arm demonstrations for a humanoid meant keyframing poses or a separate motion capture setup. Now you raise your arm and the robot raises its arm. Drive it during a Case try, and the try records the motion as a demonstration.

## Humanoids

A humanoid's arms, waist and head follow yours, with each joint moving at most 240° a second and staying inside its limits. The legs stay still.

If the robot has no Walk skill, its base stays in place. If it has one, you still walk it with the keys.

## Fixed Arms

A fixed arm's hand follows your right hand. Pinch the fingers of your left hand to close its gripper.

## On Your Computer

Pose estimation runs on your computer, and the camera's picture is never saved or sent anywhere.

Press Esc to stop, and the camera turns off.

Read [Drive a robot with your camera](/help/drive-a-robot-with-your-camera) in the help center for the steps.
