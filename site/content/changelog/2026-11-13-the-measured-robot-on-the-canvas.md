---
title: The measured robot on the canvas
date: 2026-11-13
image: /changelog/the-measured-robot-on-the-canvas/cover.png
---

While an emulated robot follows the simulation, the canvas draws it the way its servos measure it. A translucent blue robot stands next to the solid one, and Operate shows each joint's gap in degrees.

## Where it is

Connect an emulated robot from Operate, climb the Ladder to Test, then drive the robot in Simulate or start a Case try. The blue robot appears on the canvas of the scene you connected from, and goes away when you click Disconnect. It's never in screenshots or thumbnails, and clicks pass through it. Steps are in [Compare the robot with the simulation](/help/compare-the-robot-with-the-simulation).

![An arm driven with W, the measured robot trailing the simulated one, the largest gap labelled at the shoulder](/changelog/the-measured-robot-on-the-canvas/cover.png)

## How the gap is measured

Ten times a second the robot reports each servo's position. Basecase compares it with the simulation's angle at the moment the robot took the reading, not the newest frame. The difference shows in blue on each joint's row in Operate, after its position, and the canvas labels the largest one at its joint. It uses the simulation's angle rather than the angle it asked for. A servo that lags the way the simulation predicts reads close to zero, and one the simulation gets wrong doesn't.

![Operate's servo rows, each with its position, its gap in blue and its temperature](/changelog/the-measured-robot-on-the-canvas/rows.png)

## Fixing a joint that lags

When a joint's gap stays over 4° for two seconds while it moves, its row offers Calibrate in place of the temperature. Clicking it runs the same 18-second bench as Calibrate Servos, on that joint alone, while the others hold still. The fit lands in the joint's calibration history with its verdict and version, and the next simulation run uses it.

## What it doesn't do yet

It follows emulated servos only, since real motors stay locked. The measured robot is posed from the scene's rest position, so a walking robot's body doesn't travel with it. The bench can only fit what slow motion shows. A gap caused by asking a joint to move faster than Test's 0.5 rad/s cap won't calibrate away.
