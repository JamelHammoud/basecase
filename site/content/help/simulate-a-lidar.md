---
title: Simulate a LiDAR
date: 2026-11-13
updated: 2026-11-14
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

You can see what a LiDAR on your robot would see before you buy it. When you add a LiDAR from the catalog, it scans in the simulator with the range, rate and sample count from its datasheet, and the datasets you export include its scans too.

1. In Parts, search for LiDAR and add one, such as the Slamtec RPLIDAR C1.
2. Place it on the robot's body, then press [[⌘G]] to group the two so the LiDAR moves with the robot. If you don't group them, the LiDAR stays where you placed it in the scene.
3. Open the Simulate tab, then start the robot with Drive, or with Try It in a Case. Each return appears as a blue point on the canvas, and the points refresh at the LiDAR's scan rate. For example, the C1 scans ten times a second with 500 rays that reach 12 m.

![A rover with an RPLIDAR C1 in a corridor Case, its returns drawn along both walls](/help/simulate-a-lidar/scan.png)

4. Record tries in a Case until one passes.
5. Under **Results**, click **Make Dataset**.
6. In the dataset that opens, click **Export Dataset**. Every frame in the dataset has an `observation.scan` column with one value per ray. Each value is the distance divided by the LiDAR's range, or 1 if nothing came back. For each LiDAR, `meta/basecase.json` lists the ray count, range, rate and field of view.

The points stay on the canvas while the simulation runs and clear when it stops. They never appear in captures or camera views.

Each LiDAR casts up to 720 rays per scan. A 3D LiDAR casts only its horizontal ring.

To see a recorded try's scans again, [replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
