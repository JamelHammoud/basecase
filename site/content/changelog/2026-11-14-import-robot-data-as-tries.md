---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene.

Say someone shared 50 SO-101 pick-and-place episodes on the Hub. Until now, Basecase could write a dataset like that but couldn't read it. Now each episode comes in as a try named after its task and replays joint by joint on your arm.

## What Opens

Import opens a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot v2.0, v2.1 or v3.0 dataset as a zip or folder. In the desktop app, Import Robot also takes a Hugging Face dataset link.

## Joints Line Up

Basecase matches joints by name. When the names differ, Match Joints asks you once and keeps your answer.

Basecase tells radians, degrees and raw Feetech counts apart by their range, so you don't have to say which one a recording uses.

Import the same data again onto the same robot in the same scene, and nothing new is added.

## Videos Stay Put

A try keeps each camera's video file and its time span, and leaves the file where it is.

## Limits

Hub datasets can be up to 1 GB, and Import doesn't open LZ4-compressed MCAP files. SO-101 data saved in LeRobot's −100 to 100 range is read as degrees.

Read [Import robot data as tries](/help/import-robot-data-as-tries) in the help center for the steps.
