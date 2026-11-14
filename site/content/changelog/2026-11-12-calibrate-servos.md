---
title: Calibrate servos
date: 2026-11-12
image: /changelog/calibrate-servos/cover.png
---

You can now fit each servo's model from an 18-second bench run, so the simulation moves the way your servos do. It works on the emulated robot.

Real servos stay locked.

Until now, every servo started from its catalog preset. But a real unit lags, sticks and sags in its own way, so a policy trained on the preset ends up running on an arm that behaves differently.

## Where it is

Open a scene with a robot, go to the Play view, pick Operate and click Connect Emulated Robot. Go up the Ladder through Set Up, then Test. Once the motors are running in Test, Calibrate Servos shows up under the Ladder.

It's in ⌘K too, but a run only starts from Test, the one rung where Basecase moves the motors itself. Anywhere else, the command opens Operate.

![Operate in Test, with Calibrate Servos under the Ladder](/changelog/calibrate-servos/test.png)

## What happens

Every joint moves at once for about 18 seconds, starting from where it stands. The first 9 seconds are slow ramps, and the last 9 are a gentle sine. The ramps go out to about 14° one way and 9° the other. They're slow on purpose, because the safety guard and the servo's speed cap would clip anything faster.

The moves go through the same path as everything else in Operate, so Stop, the motor lock and fault handling all still apply. If the robot leaves Test or faults partway, nothing is saved.

Then Basecase fits each servo, one joint at a time, off the main thread. Each one takes about 2 seconds. The fit adjusts seven terms of the servo model the simulator already uses: position gain, delay, damping, armature, friction, load friction and torque limit.

Basecase keeps a fit only if it predicts the held-back half of the run at least 5% better than the preset. On three emulated STS3215 servos, the fits came out 7 to 10% better.

## Reading the result

Each joint gets a row with one of three verdicts. Measured means the fit beat the catalog's preset and is now in use. The row shows its version, like v1. Consistent with preset means the preset already matched. Can't tell means the recording couldn't settle it, and the joint keeps what it had.

The Simulate tab, Cases, Skills and training use each fit on the joint whose servo it was measured on.

You can calibrate every Feetech and Dynamixel servo in the catalog, each against its own variant. The STS3215 C001 and XL330 start from a published model. The rest start from an estimate scaled from their stall torque, speed and volts. PWM servos such as the DS3218 can't answer on the bus, so Calibrate skips them.

## The replay

Click a joint to open its replay. The bench log runs back through the sim twice, once with the preset and once with the calibration. The plot draws both over what the servo really did: the light line is the servo, gray is the preset and blue is the calibration.

Under the plot is each one's median error in degrees. On this Shoulder joint, the median error fell from 0.71° to 0.12°.

![The Shoulder joint's replay in Operate, with the servo's path, the preset in gray, the calibration in blue and 0.71° and 0.12° under it](/changelog/calibrate-servos/replay.png)

## Older versions and rolling back

Basecase keeps every run, and the row's More menu lists every measured version. Choose an older one and the blue line is redrawn against it, so you see what rolling back would change before you do it.

Roll Back in the same menu returns to the version before, or to the preset, after you confirm.

![The Shoulder row's More menu open over the replay, with v1 checked and Roll Back under it](/changelog/calibrate-servos/menu.png)

The agent's `operate` reply now ends with the same median errors for each joint.

## Policies trained on an older fit

A policy trained before a calibration shows Out of date in the Simulate tab's Policies, because the servos it learned on aren't the ones the sim runs now.

Right-click it and choose Retrain to train it again on the fit, with the same task, speed and training time. The old policy keeps running until the new one replaces it. If you roll the calibration back, the old policy is current again.

![Policies with Walk 1 and Stand 1 marked Out of date, and Retrain in the right-click menu](/changelog/calibrate-servos/retrain.png)

## What it doesn't do

Calibrate Servos only runs on the emulated robot, and nobody has calibrated a real servo with it yet. Backlash, flex in the frame, a sagging supply and heat aren't in the model, so the fit absorbs what it can of them.

Replays use the latest bench run, which the app keeps until it reloads. After a reload, the verdicts and versions stay, and the replays come back with the next Calibrate Servos run.

Read [Calibrate an emulated robot](/help/calibrate-an-emulated-robot) and [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy) in the help center for the steps.
