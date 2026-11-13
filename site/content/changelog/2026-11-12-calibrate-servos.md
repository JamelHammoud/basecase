---
title: Calibrate servos
date: 2026-11-12
---

Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit. It's in Operate once the robot reaches Test, and in ⌘K; each joint shows its verdict and version, and Roll Back on hover returns to the one before.

A policy trained before a calibration shows Out of date in the Simulate tab's Policies, because the servos it learned on aren't the ones the sim runs now. Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time; the old policy keeps running until the new one replaces it. Rolling the calibration back makes it current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

## See the gap close

Click a calibrated joint's row and its bench run replays in the sim right under it: what the servo did in white, the catalog preset in grey and the calibration in use in blue, on one time axis, with each model's median error beside it. On the emulated arm a shoulder went from 0.70° on the preset to 0.14° once calibrated. Versions on the row's hover redraws the blue line for any older calibration, so you see what Roll Back would change before you click it. The agent's `operate` tool reports the same two errors for every calibrated joint.

![A joint's replay with the logged position, the preset and the calibration, and 0.70° and 0.14° beside it](/changelog/calibrate-servos/replay.png)
