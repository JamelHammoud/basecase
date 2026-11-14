---
title: Import LeRobot datasets and ROS 2 recordings as tries
date: 2026-11-14
image: /changelog/import-robot-data-as-tries/cover.png
---

You can now import LeRobot datasets and ROS 2 MCAP recordings as tries on the robot in your scene.

Import opens a `.mcap` file, a rosbag2 folder stored as MCAP, or a LeRobot v2.0, v2.1 or v3.0 dataset as a zip or folder. In the desktop app, Import Robot also takes a Hugging Face dataset link.

Say someone shared 50 SO-101 pick-and-place episodes on the Hub. Basecase could write that dataset but never read it. Now each episode comes in as a try named after its task, and it replays joint by joint on your arm.

Joints match by name. When the names differ, Match Joints asks once and keeps your answer. Basecase tells radians, degrees and raw Feetech counts apart by their range. Importing the same data again adds nothing.

Videos stay where they are. A try keeps each camera's file and time span. Hub datasets can be up to 1 GB, and LZ4-compressed MCAP files don't open. SO-101 data saved in LeRobot's −100 to 100 range reads as degrees.

Steps are in [Import robot data as tries](/help/import-robot-data-as-tries).
