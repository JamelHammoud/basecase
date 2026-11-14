---
title: Replay LiDAR scans on the canvas
date: 2026-11-13
image: /changelog/replay-lidar-scans-on-the-canvas/cover.png
---

You can now scrub a recorded try and see what the robot's LiDAR saw at that moment. Layers lists each LiDAR under its robot, so you can hide its points.

Before, a replay kept the last live scan on the canvas. A rover that brushed a corridor wall replayed with points from where it stopped, not from where it touched.

![A rover with an RPLIDAR S2 in a corridor Case, the scan at the playhead drawn as blue points along both walls](/changelog/replay-lidar-scans-on-the-canvas/cover.png)

A try records every LiDAR's values with each of its 50 frames a second. An RPLIDAR S2 casts 720 rays out to 30 m and scans ten times a second. At the playhead, the canvas draws the newest scan at or before that moment, placed from the robot's pose then. The points are 3 px dots in blue, and they never show in captures or thumbnails.

Each LiDAR's scan gets its own row in Layers, named after the part and marked with four blue dots. Hide stops drawing its points, in replays and live runs alike.

![The Layers view with the Slamtec RPLIDAR S2 scan row under the rover, its Hide button showing](/changelog/replay-lidar-scans-on-the-canvas/layers.png)

Only the simulator's own LiDARs draw today. Steps are in [Replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
