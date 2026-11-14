---
title: Replay a robot's LiDAR scan
date: 2026-11-13
collection: simulate-and-train
type: task
keywords:
  - lidar replay
  - laser scan
  - point cloud
  - data layer
  - hide lidar points
related:
  - simulate-a-lidar
  - scrub-a-try-on-the-timeline
covers:
  - src/workspace/useDataLayers.ts
  - src/dataLayers/simTracks.ts
  - src/components/layers/DataLayerItem.tsx
---

You can see what a robot's LiDAR saw at any point in a recorded try, drawn from where the robot was at the time.

1. Put a LiDAR on the robot and group it with the body. See [Simulate a LiDAR](/help/simulate-a-lidar).
2. Record a try in a Case. See [Try a Case](/help/try-a-case).
3. In **Results**, click **Replay** (▷) on the try's row. The timeline opens under the canvas.
4. Press [[→]] or [[←]] to move the playhead, or press [[End]] to go to the end. The canvas uses the robot's pose at that time to draw the scan the LiDAR recorded at or before that moment.

![A rover with an RPLIDAR S2 in a corridor Case, the scan at the playhead drawn as blue points along both walls, the timeline under the canvas](/help/replay-a-robots-lidar-scan/replay.png)

5. In the view rail, click **Layers**. The scan has its own row under the robot, named after the LiDAR and marked with four blue dots.
6. Hold your pointer over the scan's row, then click **Hide**. The canvas stops drawing the scan's points until you click **Show**.

![The Layers view with the Slamtec RPLIDAR S2 scan row under the rover, its Hide button showing](/help/replay-a-robots-lidar-scan/layers.png)

The scan's row appears only while the simulation is loaded. If you hide the scan, it stays hidden in both live runs and replays.
