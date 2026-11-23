---
title: Check servos on first power-on
date: 2026-11-22
image: /changelog/check-servos-on-first-power-on/cover.png
---

You can now check a new emulated robot against its design in one guided pass. Operate names a swapped pair of motors, a reversed direction or a wrong offset, then replays the simulation on the robot.

Before, you had to know to use Set Up Servos, Calibrate Servos and the rows in order. A robot whose elbow motor sat on the shoulder looked fine until a policy drove it the wrong way.

Check Servos moves one joint at a time, 0.12 rad at no more than 0.24 rad/s, under Test's 0.5 rad/s cap. Each answer shows live, with the joint's name and bus ID. Skip leaves a joint for later and the check resumes where it stopped.

A fault reads as one sentence, such as "Elbow turns the wrong way." Fix writes the zero, direction and joint order through the existing calibration path, so each joint's history keeps it and Roll Back undoes it. When every joint passes, all the motors replay a 6-second reference motion beside the simulation. A joint within 0.1 rad of it ends the check with "Matches the simulation."

Real motors stay locked, so this runs on emulated servos and the simulated network robot. It covers Feetech and Dynamixel servos. ROS 2 and G1 robots match joints by name already.

Steps are in [Check a robot's wiring on first power-on](/help/check-a-robots-wiring-on-first-power-on).
