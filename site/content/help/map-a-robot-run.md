---
title: Map a robot run
date: 2026-11-14
collection: simulate-and-train
type: task
order: 18
keywords:
  - map
  - scan fusion
  - lidar
  - point cloud
  - depth camera
  - scan matching
  - icp
related:
  - replay-a-robots-lidar-scan
  - play-a-ros-recordings-topics-in-the-console
covers:
  - src/dataLayers/map.ts
  - src/dataLayers/mapFeed.ts
  - src/dataLayers/mapSession.ts
  - src/dataLayers/mapSweeps.ts
  - src/dataLayers/mapMatch.ts
  - src/dataLayers/simMap.ts
  - src/workspace/useMapLayer.ts
  - src/components/layers/dataLayerMenu.ts
  - src/dataLayers/mapWorld.ts
  - src/workspace/useMapWorld.ts
hub_the_design_agent_order: 50
hub_the_design_agent: |
  - Ask what happened in a try. It reads the try's recording and answers with times and values. For a try with scans, it also reads the [map's](/help/map-a-robot-run) bounds and point count.
---

Keep a robot run's scans together on the canvas, or turn an imported recording into a saved world for simulation.

Start with an [imported ROS recording](/help/play-a-ros-recordings-topics-in-the-console) containing scans or a [recorded simulated LiDAR try](/help/replay-a-robots-lidar-scan). A moving sensor needs recorded TF transforms or odometry to place its readings along the run. Its mounting frame must connect to the robot's base. A separate sensor TF subtree isn’t enough to place its readings. Depth images must include matching `CameraInfo` messages and optical-frame TF transforms.

1. In the view rail, click **Library**.
2. Under **Tries**, click the robot whose recording you want to map.
3. Click the try. The timeline opens, and Basecase combines its recorded readings into a map.
4. In the view rail, click **Layers**. The **Map** row controls the combined points, which are colored by height.

![A recorded robot run with a height-colored map on the canvas and the Map row in Layers](/help/map-a-robot-run/map.png)

5. Right-click **Map** to open its menu.

![The Map row’s menu with Scan Matching checked](/help/map-a-robot-run/scan-matching.png)

6. Choose **Scan Matching** to compare placement with matching off. The check mark means matching is on.
7. Drag on the timeline to inspect the robot at different times. The map keeps the whole run in view while each sensor's scan follows the playhead.

Scan matching starts on for imported readings. It uses overlapping surfaces to adjust their placement from the recorded poses. Poor starting poses, moving objects or repeated surfaces can still leave drift. Simulated LiDAR hits use their recorded world positions and bypass matching.

The map keeps one average point in each 5 cm cube, up to 1,000,000 points. To hide it, hold your pointer over **Map** and click **Hide**. Maps stay out of captures and camera views. Imported ROS maps can also become Case worlds. Simulated scan maps remain overlays.

8. In **Layers**, right-click **Map**.
9. Choose **Make World**.

![The Map menu with Make World above Scan Matching](/help/map-a-robot-run/make-world.png)

![New Case with Map selected and its estimated floor and obstacle height identified](/help/map-a-robot-run/new-case.png)

10. In **New Case**, click **Make Case**.

![The saved Map Case world after the source try closes](/help/map-a-robot-run/case-world.png)

The world records the source try and scan-matching choice when you choose **Make World**. You can close the try and reopen the saved scene without losing the Case's world.

Reconstruction uses 10 cm cells and refuses a world needing more than 64 collision pieces. It leaves unobserved regions open. A planar laser scan uses an estimated floor under observed free space and an estimated 1 m obstacle height. Depth and point-cloud recordings keep their observed surfaces, including floor patches and steps.

For the individual scan at the playhead, see [Replay a robot's LiDAR scan](/help/replay-a-robots-lidar-scan).
