---
title: Simulate a LiDAR
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/sim/lidar.ts
  - src/sim/scanner.ts
  - src/data/lidarScan.ts
  - src/three/viewport/dataLayers.ts
  - src/datasets/lerobot.ts
  - src/datasets/lerobotRows.ts
  - src/datasets/lerobotV3.ts
---

You can see what a LiDAR on your robot would see before you buy it. A LiDAR from the catalog scans in the simulator with the range, rate and sample count from its datasheet, and the datasets you export include its scans too.

1. In Parts, search for LiDAR and add one, such as the Slamtec RPLIDAR C1.
2. Place it on the robot's body, then group the two with [[⌘G]] so the LiDAR moves with the robot. Without the group, it stays where you placed it in the scene.
3. Open the Simulate tab and start the robot with Drive or with Try It in a Case. The canvas draws each return as a blue point and refreshes them at the LiDAR's scan rate. The C1 scans ten times a second with 500 rays that reach 12 m.

![A rover with an RPLIDAR C1 in a corridor Case, its returns drawn along both walls](/help/simulate-a-lidar/scan.png)

4. Record tries in a Case, click **Make Dataset** in Results, then click **Export Dataset**. Each frame of the dataset has an `observation.scan` column with one value per ray: the distance divided by the LiDAR's range, or 1 if nothing came back. For each LiDAR, `meta/basecase.json` lists the ray count, range, rate and field of view.

The current scan's points stay on the canvas while the simulation runs and clear when it stops. They never appear in captures or camera views. Each LiDAR casts at most 720 rays per scan, and a 3D LiDAR casts only its horizontal ring.

The **Map** layer accumulates the simulated LiDAR's hits, colored by height. In **Layers**, its eye hides those combined points independently of the current scan. It also stays out of captures and camera views. See [Map a robot run](/help/map-a-robot-run) for its controls and limits.

To see the scans from a recorded try again, [replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
