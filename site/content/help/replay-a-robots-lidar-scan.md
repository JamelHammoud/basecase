---
title: Replay a robot's LiDAR scan
date: 2026-11-13
updated: 2026-11-13
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
  - src/workspace/useCaseRun.ts
  - src/workspace/useTryTimeline.ts
---

See what the robot's LiDAR saw at any moment of a recorded try, drawn on the canvas from where the robot stood then.

1. Put a LiDAR on the robot and group it with the body, as in [Simulate a LiDAR](/help/simulate-a-lidar).
2. Record a try in a Case, as in [Try a Case](/help/try-a-case).
3. In **Results**, click **Replay** (▷) on the try's row. The Case opens running, with the timeline under the canvas.
4. Press [[→]] or [[←]] to move the playhead, or [[End]] to go to the end. The canvas draws the scan the LiDAR recorded at or before that moment, placed from the robot's pose then.

![Reach a Spot in a Corridor running a rover's try, its RPLIDAR S2 scan at the playhead drawn as blue points along both walls, the timeline under the canvas](/help/replay-a-robots-lidar-scan/replay.png)

Click **Done** or press [[Esc]] to go back to the live robot.

To stop drawing the scan, hide it in **Layers** while a try runs in the Simulate tab. The scan has its own row under the robot, named after the LiDAR and marked with four blue dots. Point at it and click **Hide**.

![The Layers view with the Slamtec RPLIDAR S2 scan row under the rover, its Hide button showing](/help/replay-a-robots-lidar-scan/layers.png)

Clicking **Layers** leaves a running Case, so hide the scan before you replay. It stays hidden in live runs and replays until you click **Show**.
