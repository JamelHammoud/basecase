---
title: Label objects in recorded camera frames
date: 2026-11-15
image: /changelog/label-camera-frames/cover.png
---

You can now label objects inside a try’s camera images, then export them for training. Add Frames takes images from the timeline or a selection of tries.

A wrist camera recording of a missed grasp can become training data without exporting the video to another app. Draw boxes, polygons and named keypoints in the frame editor. Renaming a class changes it across the set, and every edit supports undo.

Simulated tries get labels from recorded body poses through the same renderer as training images. LeRobot videos, Operate videos and compressed-image topics in MCAP recordings can supply real frames.

Click an object to make a mask with SAM 2 small, then track it through the next 30 frames. Detector and agent labels stay unreviewed until accepted. Models download on first use and run locally.

Each action takes up to 1,000 camera frames. Pose labeling stops when the source scene no longer matches the recorded model.

Steps are in [Label objects in camera frames](/help/label-objects-in-camera-frames).
