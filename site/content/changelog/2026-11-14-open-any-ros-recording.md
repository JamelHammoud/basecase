---
title: Open any ROS recording with every topic
date: 2026-11-14
image: /changelog/open-any-ros-recording/cover.png
---

You can now open ROS 1 bags and MCAP files with every topic kept. Their logs, diagnostics, modes and sensor data play beside your robot on one timeline.

Say a pick went wrong 9 seconds in. The bag has the `/rosout` warnings, the motor driver's diagnostics and the arm's mode that explain it. Until now, Basecase kept only the joints and the cameras.

## What Opens

Import takes `.mcap` and `.bag` files. Pick several files together and they play as one recording.

Basecase reads channels in ROS 1, ROS 2, Protobuf or JSON from the schema the file carries, and turns every field into a signal. Plot `topic./joint_states.effort[:]`, for example, and it draws each joint's effort.

## What You See

When the recording opens, a column of cards shows up. The log has a level filter and search. Each diagnostic shows its newest level, and string topics show as colored states. Other cards show the IMU's angular velocity, odometry x against y, and one topic's newest message as a tree.

Laser scans, point clouds, TF frames, markers and grids draw on the canvas at the playhead.

## Limits

A recording can run up to 10 minutes, and each file can be up to 512 MB. FlatBuffers channels and bz2 bags don't open. The scene needs a robot in it.

Read [Play a ROS recording's topics in the console](/help/play-a-ros-recordings-topics-in-the-console) in the help center for the steps.
