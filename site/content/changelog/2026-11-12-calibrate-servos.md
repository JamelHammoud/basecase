---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/cover.png
---

You can now fit each servo's model from an 18-second bench run, so simulation moves the way your servos do. It works on the emulated robot; real servos stay locked.

Every servo starts from its catalog preset. A real unit lags, sticks and sags in its own way, and a policy trained on the preset meets a different arm when it runs.

In Operate, connect the emulated robot, climb the Ladder to Test and click Calibrate Servos. Every joint moves through 9 seconds of slow ramps and 9 of a slow sine. Then each servo is fitted, one at a time, in about 2 seconds each.

The fit adjusts seven terms of the servo model: position gain, delay, damping, armature, friction, load friction and torque limit. It's kept only if it predicts the held-back half of the run at least 5% better than the preset. On three emulated STS3215 servos, the fits came out 7 to 10% better.

Each joint then shows Measured, Consistent with preset or Can't tell, and the version in use. Roll Back returns to the version before. The Simulate tab, Cases, Skills and training use the fit on joints driven by a catalog STS3215 or XL330.

A policy trained before a calibration shows Out of date in the Simulate tab's Policies. The servos it learned on aren't the ones the sim runs now. Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time. The old policy keeps running until the new one replaces it, and rolling the calibration back makes it current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

No real servo has been calibrated yet. Backlash and supply sag aren't in the model, so the fit absorbs what it can of them.

Steps are in [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) and [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy).
