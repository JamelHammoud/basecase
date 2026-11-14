---
title: LiDARs scan in the simulator
date: 2026-11-13
image: /changelog/simulate-lidars/cover.png
---

A LiDAR from Parts now scans in the simulator the way its datasheet says it does. It draws what it hits on the canvas, and its scans go into the datasets you export.

## Nothing to set up

Put a LiDAR on the robot, group it with the body, then Drive or Try It. Basecase reads the range, scan rate and sample rate from the part's spec rows, the same rows you see in Parts. An RPLIDAR C1 casts 500 rays out to 12 m ten times a second. An LD19 casts 450. A Hokuyo UST-10LX sweeps 270° forty times a second.

Each of the 18 LiDARs in the catalog has a measured optical center, and the scan starts there. So a C1 whose model includes its cable still scans from its head. Move the LiDAR higher, lower or further forward, and it sees something different on the next run. Read [Simulate a LiDAR](/help/simulate-a-lidar) for the steps.

![A rover with an RPLIDAR C1 in a corridor Case, its returns drawn along both walls](/changelog/simulate-lidars/cover.png)

## On the canvas

Each return shows up as a blue point on the surface it hit. While the simulation runs, Basecase redraws the points once per scan. They never show in captures, camera views or dataset videos.

## In datasets

Export Dataset and Publish to Hugging Face add an `observation.scan` column, with one value per ray for every frame. Each value is the distance divided by the sensor's range, or 1 where nothing came back.

`meta/basecase.json` lists each LiDAR's rays, range, rate and field of view. GR00T's `modality.json` names the scan as a state group, so a policy fine-tuned on the dataset can read it.

## What it doesn't do yet

Scans carry no noise. A 3D LiDAR such as the Mid-360 casts only its horizontal ring. Each LiDAR casts at most 720 rays a scan.

Policies you train in Basecase don't take scans as an input yet, but the agent sees them when it operates the robot: after every step, it gets the nearest return and its bearing.
