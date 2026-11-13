---
title: Calibrate servos
date: 2026-11-12
---

Calibrate Servos moves each joint of a connected emulated robot through a slow bench run and fits its servo, so the Simulate tab, Cases and training run on the fit. It's in Operate once the robot reaches Test, and in ⌘K; each joint shows its verdict and version, and Roll Back on hover returns to the one before.

A policy trained before a calibration shows Out of date in the Simulate tab's Policies, because the servos it learned on aren't the ones the sim runs now. Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time; the old policy keeps running until the new one replaces it. Rolling the calibration back makes it current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)
