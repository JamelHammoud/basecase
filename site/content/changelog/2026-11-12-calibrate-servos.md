---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/replay.png
---

You can now fit each servo's model from an 18-second bench run, so simulation moves the way your servos do. It works on the emulated robot; real servos stay locked.

Every servo starts from its catalog preset. A real unit lags, sticks and sags in its own way, so a policy trained on the preset meets a different arm.

In Operate, connect the emulated robot, climb the Ladder to Test and click Calibrate Servos. Every joint runs 9 seconds of slow ramps and 9 of a slow sine, then each servo is fitted.

The fit adjusts seven terms of the servo model: position gain, delay, damping, armature, friction, load friction and torque limit. It's kept only if it predicts the held-back half of the run at least 5% better. On three emulated STS3215 servos, the fits came out 7 to 10% better.

Each joint shows Measured, Consistent with preset or Can't tell, and the version in use. Click it to replay the run through the sim, with the preset in grey, the fit in blue and each one's median error.

Its More menu lists every version, and choosing one redraws the blue line. Roll Back there returns to the one before. The Simulate tab, Cases, Skills and training use the fit on catalog STS3215 and XL330 joints.

![The Shoulder row's More menu open over the replay, with v1 checked and Roll Back under it](/changelog/calibrate-servos/menu.png)

A policy trained before a calibration shows Out of date in Policies. Retrain, in its right-click menu, trains it again on the fit; the old one runs meanwhile.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

No real servo has been calibrated yet. Backlash and supply sag aren't in the model. Replays last until the app reloads.

Steps are in [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) and [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy).
