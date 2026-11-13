---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/replay.png
---

Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit. Then you can watch the replay of each joint to see how much closer the sim gets.

## Where it is

Open a scene with a robot, go to the Play view and pick Operate, then click Connect Emulated Robot. Climb the Ladder with Set Up and then Test. Once the motors are running in Test, Calibrate Servos sits under the Ladder, and it's in ⌘K too. It's offered only there, because Test is the one rung where Basecase moves the motors itself, and only in the scene the robot was connected from, so a fit never lands in another scene.

![Operate in Test, with Calibrate Servos under the Ladder](/changelog/calibrate-servos/test.png)

## What happens

Every joint moves at once for about 18 seconds, starting from where it stands: 9 seconds of slow ramps out to about 14° either way with short holds, then 9 seconds of a gentle sine. It's slow on purpose, since the safety guard and the servo's speed cap would clip anything faster and spoil the recording. The moves go through the same path as everything else in Operate, so Stop, the motor lock and fault handling all still apply. If the robot leaves Test or faults partway, nothing is saved.

Then each servo is fitted, one joint at a time, off the main thread. The fit adjusts the servo model the simulator already uses (how hard it pushes toward a goal, how late it responds, damping, friction and its torque limit) to match what was recorded, and checks itself on the half of the recording it didn't fit.

## Reading the result

Each joint gets a row with one of three verdicts. Measured means the fit predicted the servo clearly better than the catalog's preset, and it's now in use, shown by its version, like v1. Consistent with preset means the preset already matched. Can't tell means the recording couldn't settle it, and the joint keeps what it had.

## The replay

Clicking a joint opens its replay. The bench log goes back through the sim twice, once with the preset and once with the calibration, and both are drawn over what the servo really did: the light line is the servo, grey is the preset and blue is the calibration. Under the plot are each one's median error in degrees, 0.71° for the preset and 0.12° for the calibration in the run below.

![The Shoulder joint's replay in Operate, with the servo's path, the preset in grey, the calibration in blue and 0.71° and 0.12° under it](/changelog/calibrate-servos/replay.png)

## Older versions and rolling back

Every run is kept. The row's More menu lists every measured version. Choosing an older one redraws the blue line against it, so you see what rolling back would change before you do it. Roll Back in the same menu returns to the version before, or to the preset, after you confirm.

![The Shoulder row's More menu open over the replay, with v1 checked and Roll Back under it](/changelog/calibrate-servos/menu.png)

The agent's `operate` reply ends with the same median errors for each joint.

## Policies trained on an older fit

A policy trained before a calibration shows Out of date in the Simulate tab's Policies, because the servos it learned on aren't the ones the sim runs now. Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time; the old policy keeps running until the new one replaces it. Rolling the calibration back makes it current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

## What it doesn't do

Calibrate Servos runs on the emulated robot only, and no real servo has been calibrated with it. The fit covers what the simulator's servo model has terms for; backlash, flex in the frame, a sagging supply and heat aren't modelled, so the fit absorbs what it can of them into those terms.

Replays use the latest bench run, which the app keeps until it reloads. After a reload the verdicts and versions stay, and the replays come back with the next Calibrate Servos.
