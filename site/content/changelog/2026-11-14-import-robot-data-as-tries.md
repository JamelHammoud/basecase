---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene.

Say someone recorded 50 SO-101 pick-and-place episodes with LeRobot and shared them on the Hub. Until now, Basecase could write that dataset but not read it, so you couldn't replay it on your arm.

## What You Can Import

Import takes a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot dataset as a zip or a folder. Import Robot takes a Hugging Face dataset link. Hugging Face links work in the desktop app.

## Episodes Become Tries

Each episode becomes a try named after its task, and it replays joint by joint on your robot's model.

Joints match by name, including ALOHA's left and right arms, which go to two robots. When the names differ, Match Joints asks you once and keeps your answer.

Basecase tells radians, degrees and raw Feetech counts apart by their range. Import the same data twice and nothing is added. A try keeps each camera's file and its time span, and Basecase never re-encodes the video.

## Limits

Basecase doesn't decode camera images in an MCAP file. LZ4-compressed MCAP files don't open, and Hub datasets are capped at 1 GB. SO-101 data saved in LeRobot's −100 to 100 range reads as degrees.

Read [Import robot data as tries](/help/import-robot-data-as-tries) in the help center for the steps.
