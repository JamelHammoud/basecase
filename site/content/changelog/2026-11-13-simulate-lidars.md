---
title: LiDARs scan in the simulator
date: 2026-11-13
image: /changelog/simulate-lidars/cover.png
---

A LiDAR from Parts now scans in the simulator the way its datasheet says it does. It draws what it hits on the canvas and records its scans into the datasets you export.

## Nothing to set up

Put a LiDAR on the robot and group it with the body, then Drive or Try It. Basecase reads the range, scan rate and sample rate from the part's spec rows, the same rows Parts shows. An RPLIDAR C1 casts 500 rays out to 12 m ten times a second, and an LD19 casts 450. A Hokuyo UST-10LX sweeps 270° forty times a second.

The scan comes from the sensor's optical center, measured for each of the 18 LiDARs in the catalog. A C1 whose model includes its cable still scans from its head. Moving the LiDAR higher, lower or further forward changes what it sees on the next run. Steps are in [Simulate a LiDAR](/help/simulate-a-lidar).

![A rover with an RPLIDAR C1 in a corridor Case, its returns drawn along both walls](/changelog/simulate-lidars/cover.png)

## On the canvas

Each return is a blue point on the surface it hit, redrawn once per scan while the simulation runs. The points never show in captures, camera views or dataset videos.

## In datasets

Export Dataset and Publish to Hugging Face add an `observation.scan` column with one value per ray for every frame. Each value is the distance divided by the sensor's range, and 1 where nothing came back. `meta/basecase.json` lists each LiDAR's rays, range, rate and field of view. GR00T's `modality.json` names the scan as a state group, so a policy fine-tuned on the dataset can read it.

## What it doesn't do yet

A scan carries no noise, and a 3D LiDAR such as the Mid-360 casts only its horizontal ring. Each LiDAR is capped at 720 rays a scan. Policies trained in Basecase don't take scans as an input yet. The agent does see them when it operates the robot, as the nearest return and its bearing after every step.
