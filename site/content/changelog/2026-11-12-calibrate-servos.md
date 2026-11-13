---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/replay.png
---

Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit. Then you can watch the replay of each joint to see how much closer the sim gets.

## Where it is

It's in Operate once the robot reaches Test, and in ⌘K. Every joint moves through the bench sequence for about 18 seconds, then each row shows its verdict: Measured with its version (v1) when the fit beat the catalog's preset and is now in use, Consistent with preset when the preset already matches, and Can’t tell when the run couldn't settle it.

## The replay

Clicking a joint opens its replay. The bench log goes back through the sim twice, once with the preset and once with the calibration, and both are drawn over what the servo really did: the light line is the servo, grey is the preset and blue is the calibration. Under the plot are each one's median error in degrees, 0.71° for the preset and 0.12° for the calibration in the run below.

![The Shoulder joint's replay in Operate, with the servo's path, the preset in grey, the calibration in blue and 0.71° and 0.12° under it](/changelog/calibrate-servos/replay.png)

## Older versions and rolling back

The row's More menu lists every measured version. Choosing an older one redraws the blue line against it, so you see what rolling back would change before you do it. Roll Back in the same menu returns to the version before, after you confirm.

![The Shoulder row's More menu open over the replay, with v1 checked and Roll Back under it](/changelog/calibrate-servos/menu.png)

The agent's `operate` reply ends with the same median errors for each joint.

## What it doesn't do

Replays use the latest bench run, which the app keeps until it reloads. After a reload the verdicts and versions stay, and the replays come back with the next Calibrate Servos.
