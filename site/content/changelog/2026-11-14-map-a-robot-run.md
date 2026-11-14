---
title: Map a robot's whole run
date: 2026-11-14
image: /changelog/map-a-robot-run/cover.png
---

You can now open a recorded try and see its scans combined into one height-colored map on the canvas. Imported ROS recordings and simulated LiDAR runs both get a Map row in Layers.

A rover looking down a corridor only sees part of it in each scan. The map keeps the readings from the whole run together, so you can follow the walls it passed while scrubbing back to where the robot turned.

Laser scans, point clouds and depth images feed the map, with recorded transforms or odometry placing them. It keeps one average point per 5 cm cube, up to 1,000,000 points. Scan matching starts on for imported readings, and you can switch it off from the Map row's right-click menu. Its results depend on the starting poses and overlapping surfaces.

Maps stay out of captures and camera views. They can’t become collision geometry or a Case world.

Read [Map a robot run](/help/map-a-robot-run) for the steps.
