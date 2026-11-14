---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene.

Import opens a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot dataset as a zip or a folder. In the desktop app, Import Robot takes a Hugging Face dataset link.

Say someone recorded 50 SO-101 pick-and-place episodes with LeRobot and shared them on the Hub. Until now, Basecase could write that dataset but not read it, so you couldn't replay it on your arm. Now each episode comes in as a try named after its task and replays joint by joint on your robot's model.

## Joints Match by Name

Each joint in the data goes to the joint with the same name on your robot. With ALOHA, the left and right arms go to two robots. When the names differ, Match Joints asks you once and keeps your answer.

Basecase tells radians, degrees and raw Feetech counts apart by their range, so you don't pick a unit.

## Nothing Gets Copied Twice

If you import the same data again, Basecase adds nothing. A try keeps each camera's file and its time span, and Basecase never re-encodes the video.

## Limits

Basecase doesn't decode camera images in an MCAP file, and it can't open LZ4-compressed MCAP files. Datasets from the Hub can be up to 1 GB. Basecase reads SO-101 data saved in LeRobot's −100 to 100 range as degrees.

Read [Import robot data as tries](/help/import-robot-data-as-tries) in the help center for the steps.
