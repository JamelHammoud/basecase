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

See what the robot's LiDAR saw at any moment of a recorded try, drawn on the canvas from where the robot stood then.

1. Put a LiDAR on the robot and group it with the body, as in [Simulate a LiDAR](/help/simulate-a-lidar).
2. Record a try in a Case, as in [Try a Case](/help/try-a-case).
3. In **Results**, click **Replay** (▷) on the try's row. The timeline opens under the canvas.
4. Press [[→]] or [[←]] to move the playhead, or [[End]] to go to the end. The canvas draws the scan the LiDAR recorded at or before that moment, placed from the robot's pose then.

![A rover with an RPLIDAR S2 in a corridor Case, the scan at the playhead drawn as blue points along both walls, the timeline under the canvas](/help/replay-a-robots-lidar-scan/replay.png)

5. In the view rail, click **Layers**. The scan has its own row under the robot, named after the LiDAR and marked with four blue dots.
6. Point at the scan's row and click **Hide**. The canvas stops drawing its points until you click **Show**.

![The Layers view with the Slamtec RPLIDAR S2 scan row under the rover, its Hide button showing](/help/replay-a-robots-lidar-scan/layers.png)

The scan's row shows only while the simulation is loaded. Hiding it holds for live runs and replays alike.
