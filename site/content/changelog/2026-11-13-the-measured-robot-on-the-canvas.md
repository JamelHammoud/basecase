---
title: The measured robot on the canvas
date: 2026-11-13
image: /changelog/the-measured-robot-on-the-canvas/cover.png
---

While an emulated robot follows the simulation, Basecase draws a translucent blue robot next to the solid one, posed from what its servos measure. Operate shows each joint's gap in degrees.

## Where it is

Connect an emulated robot from Operate and climb the Ladder to Test. Then drive the robot in Simulate, or start a Case try.

The blue robot shows up on the canvas of the scene you connected from and goes away when you click Disconnect. Basecase leaves it out of screenshots and thumbnails, and your clicks pass through it.

![An arm driven with W, the measured robot trailing the simulated one, the largest gap labeled at the shoulder](/changelog/the-measured-robot-on-the-canvas/cover.png)

## How the gap is measured

Ten times a second, the robot reports the position of each servo. Basecase skips the newest frame and compares each reading with the simulation's angle at the moment the robot took it.

Each joint's row in Operate shows the difference in blue, after its position. Basecase also labels the largest one on the canvas, at its joint.

The gap is measured against the simulation's angle, and Basecase ignores the angle it asked for. A servo that lags the way the simulation predicts reads close to zero. A servo the simulation gets wrong reads further off.

![Operate's servo rows, each with its position, its gap in blue and its temperature](/changelog/the-measured-robot-on-the-canvas/rows.png)

## Fixing a joint that lags

If a joint's gap stays over 4° for two seconds while it moves, its row shows Calibrate in place of the temperature.

Click it to run the same 18-second bench as Calibrate Servos on that one joint. The other joints hold still while it runs.

Basecase saves the fit to the joint's calibration history with its verdict and version, and the next simulation run uses it.

## What it doesn't do yet

The measured robot only follows emulated servos, because real motors stay locked.

Basecase poses it from the scene's rest position, so the body of a walking robot doesn't travel with it.

The bench only fits what slow motion shows. If a gap comes from asking a joint to move faster than Test's 0.5 rad/s cap, you can't calibrate it away.

Read [Compare the robot with the simulation](/help/compare-the-robot-with-the-simulation) in the help center for the steps.
