---
title: Map a robot's whole run
date: 2026-11-14
image: /changelog/map-a-robot-run/cover.png
---

You can now open a recorded try and see its scans combined into one height-colored map on the canvas. Imported ROS recordings and simulated LiDAR runs both get a Map row in Layers.

A rover looking down a corridor only sees part of it in each scan. The map keeps the readings from the whole run together, so you can follow the walls it passed while scrubbing back to where the robot turned.

Laser scans, point clouds and depth images feed the map, with recorded transforms or odometry placing them. It keeps one average point per 5 cm cube, up to 1,000,000 points. Scan matching starts on for imported readings, and you can switch it off from the Map row's right-click menu. Its results depend on the starting poses and overlapping surfaces.

The Map row’s Make World action now turns an imported ROS run into a saved simulation world and opens New Case with it selected. A rover can drive through the recorded corridor again, with collision walls around it. Closing the try keeps the Case world.

![New Case with Map selected and the planar scan’s estimates identified](/changelog/map-a-robot-run/new-case.png)

Worlds use 10 cm cells and at most 64 exact convex pieces. Unknown regions stay open. Planar scans use an estimated floor and 1 m obstacle height. Simulated scan maps remain overlays, and maps stay out of captures and camera views.

Read [Map a robot run](/help/map-a-robot-run) for the steps.
