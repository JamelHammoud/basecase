---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene.

Import takes a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot dataset as a zip or folder. Import Robot takes a Hugging Face dataset link. Hugging Face links work in the desktop app.

Thousands of SO-101, Koch and ALOHA teleop datasets are on the Hub, and lab robots record ROS 2 bags. Until now, Basecase could write a LeRobot dataset but couldn't read one.

## Each Episode Is a Try

Each episode becomes a try named by its task, and it replays joint by joint on your robot's model.

Joints match by name, including ALOHA's left and right arms, which go to two robots. When the names differ, Match Joints asks you once and keeps your answer.

Basecase tells radians, degrees and raw Feetech counts apart by their range, so you don't pick the unit. Importing the same data twice adds nothing.

## Videos Stay Where They Are

A try keeps each camera's file and its time span, and never re-encodes the video.

## What Doesn't Import

Camera images in an MCAP file aren't decoded. LZ4-compressed MCAP files don't open, and Hub datasets are capped at 1 GB.

Read [Import robot data as tries](/help/import-robot-data-as-tries) in the help center for the steps.
