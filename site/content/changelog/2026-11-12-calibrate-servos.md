---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/cover.png
---

Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit. It's in Operate once the robot reaches Test, and in ⌘K; each joint shows its verdict and version, and Roll Back on hover returns to the one before.

## Where it is

Open a scene with a robot, go to the Play view and pick Operate, then click Connect Emulated Robot. Climb the Ladder with Set Up and then Test. Once the motors are running in Test, Calibrate Servos sits under the Ladder. It's offered only there, because Test is the one rung where Basecase moves the motors itself, and only in the scene the robot was connected from, so a fit never lands in another scene.

![Operate in Test, with Calibrate Servos under the Ladder](/changelog/calibrate-servos/test.png)

## What happens

Every joint moves at once for about 18 seconds, starting from where it stands: 9 seconds of slow ramps out to about 14° either way with short holds, then 9 seconds of a gentle sine. It's slow on purpose, since the safety guard and the servo's speed cap would clip anything faster and spoil the recording. The moves go through the same path as everything else in Operate, so Stop, the motor lock and fault handling all still apply. If the robot leaves Test or faults partway, nothing is saved.

Then each servo is fitted, one joint at a time, off the main thread. The fit adjusts the servo model the simulator already uses (how hard it pushes toward a goal, how late it responds, damping, friction and its torque limit) to match what was recorded, and checks itself on the half of the recording it didn't fit.

## Reading the result

Each joint gets a row with one of three verdicts. Measured means the fit predicted the servo clearly better than the catalog's preset, and it's now in use, shown by its version, like v1. Consistent with preset means the preset already matched. Can't tell means the recording couldn't settle it, and the joint keeps what it had.

Every run is kept. To go back, hover a joint's row and click Roll Back; it asks first, then steps back to the previous measured version, or to the preset.

![Rolling back the Shoulder asks first](/changelog/calibrate-servos/roll-back.png)

## Policies trained before it

A policy trained before a calibration shows Out of date in the Simulate tab's Policies, because the servos it learned on aren't the ones the sim runs now. Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time; the old policy keeps running until the new one replaces it. Rolling the calibration back makes it current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

## What it doesn't do yet

Calibrate Servos runs on the emulated robot only, and no real servo has been calibrated with it. The fit covers what the simulator's servo model has terms for; backlash, flex in the frame, a sagging supply and heat aren't modelled, so the fit absorbs what it can of them into those terms.
