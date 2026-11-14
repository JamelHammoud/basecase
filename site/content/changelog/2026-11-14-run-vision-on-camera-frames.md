---
title: React to what the camera sees
date: 2026-11-14
image: /changelog/run-vision-on-camera-frames/cover.png
---

You can now run vision models on the robot's camera frames and use their detections in a Routine. Camera tiles show each detection's box, class and score.

A cup on the table can start a reaction without a scenario supplying the answer. See Objects, See Person, Find Faces and Body Pose read frames, while Obstacle Ahead estimates indoor depth in meters.

The detector runs locally in its own worker, at up to five frames per second per camera. Models download on first use and stay cached on this computer. Cases can read class counts and the leading box through their signals, and the agent receives detections with camera reads.

Saved camera videos are analyzed at the playhead. Captured images keep their original pixels without the boxes. Speech and Look and Answer aren't included in this camera runtime.

Steps are in [Watch what the robot's cameras see](/help/watch-what-the-robots-cameras-see).
