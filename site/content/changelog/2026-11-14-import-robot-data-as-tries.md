---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene. Hugging Face links work in the desktop app.

Import takes a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot dataset as a zip or folder. Import Robot takes a Hugging Face dataset link.

Thousands of SO-101, Koch and ALOHA teleop datasets sit on the Hub, and lab robots record ROS 2 bags. Basecase could write a LeRobot dataset but never read one.

Each episode becomes a try named by its task, replayed joint by joint on your robot's model. Joints match by name, including ALOHA's left and right arms on two robots. When names differ, Match Joints asks once and keeps your answer. Radians, degrees and raw Feetech counts are told apart by their range. Importing the same data twice adds nothing.

Videos stay where they are: a try keeps each camera's file and time span, never re-encoded. Camera images in an MCAP file aren't decoded. Hub datasets are capped at 1 GB, and LZ4-compressed MCAP files don't open.

Steps are in [Import robot data as tries](/help/import-robot-data-as-tries).
