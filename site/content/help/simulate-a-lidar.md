---
title: Simulate a LiDAR
date: 2026-11-13
updated: 2026-11-13
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

See what a LiDAR on your robot would see before you buy it. A catalog LiDAR scans in the simulator with the range, rate and sample count from its datasheet, and its scans go into the datasets you export.

1. In Parts, search for LiDAR and add one, such as the Slamtec RPLIDAR C1.
2. Place it on the robot's body and group the two with [[⌘G]], so it rides on the robot instead of standing in the scene.
3. Open the Simulate tab and start the robot, with Drive or with Try It in a Case. The canvas draws each return as a blue point, refreshed at the LiDAR's scan rate: ten times a second for the C1, with 500 rays reaching 12 m.

![A rover with an RPLIDAR C1 in a corridor Case, its returns drawn along both walls](/help/simulate-a-lidar/scan.png)

4. Record tries in a Case, then click Export Dataset in Results. Each frame of the dataset has an `observation.scan` column with one value per ray: the distance divided by the LiDAR's range, and 1 where nothing came back. `meta/basecase.json` lists each LiDAR's ray count, range, rate and field of view.

The points stay on the canvas while the simulation runs and clear when it stops. They never show in captures or camera views. Each LiDAR casts at most 720 rays a scan, and a 3D LiDAR casts only its horizontal ring. To see a recorded try's scans again, [replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
