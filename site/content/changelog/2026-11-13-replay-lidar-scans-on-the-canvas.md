---
title: Replay LiDAR scans on the canvas
date: 2026-11-13
image: /changelog/replay-lidar-scans-on-the-canvas/cover.png
---

You can now scrub through a recorded try and see what the robot's LiDAR saw at that moment. Layers lists each LiDAR under its robot, so you can hide its points.

Until now, a replay kept the last live scan on the canvas. If a rover brushed a corridor wall, scrubbing back to that moment still showed the points from where it stopped.

![A rover with an RPLIDAR S2 in a corridor Case, the scan at the playhead drawn as blue points along both walls](/changelog/replay-lidar-scans-on-the-canvas/cover.png)

## What You See

A try records 50 frames a second, and each frame holds the values of every LiDAR. An RPLIDAR S2, for example, casts 720 rays out to 30 m and scans ten times a second.

Move the playhead and the canvas draws the newest scan at or before that moment, placed from the robot's pose at that time. The points are 3 px blue dots, and they never show up in captures or thumbnails.

## Hide a Scan

Each LiDAR's scan has its own row in Layers, named after the part and marked with four blue dots. Click Hide and its points stop drawing, in replays and in live runs.

![The Layers view with the Slamtec RPLIDAR S2 scan row under the rover, its Hide button showing](/changelog/replay-lidar-scans-on-the-canvas/layers.png)

Only the simulator's own LiDARs draw today. Read [Replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan) in the help center for the steps.
