---
title: Fit a robot's body from a recorded run
date: 2026-11-14
collection: operate
type: task
keywords:
  - mass
  - payload
  - friction
  - system identification
  - body calibration
related:
  - calibrate-an-emulated-robot
  - retrain-an-out-of-date-policy
covers:
  - src/components/operate/BodyCalibration.tsx
  - src/workspace/bodyActions.ts
  - src/reality/fitBody.ts
  - src/reality/bodyModel.ts
  - src/reality/history.ts
---

In the desktop app, fit the masses, payload and floor friction used by simulation and training from recorded joint positions and commands.

Real motors stay locked in the current runtime. You can record runs with an emulated robot.

1. Drive the robot in **Test** to record a moving Operate session. Follow [Keep a robot session as a try](/help/keep-a-robot-session-as-a-try).
2. In the Play view, open **Operate**.
3. Click the connected unit's named row, if more than one is connected.
4. Click **Fit Body**.

![Fit Body button in Operate](/help/fit-a-robots-body-from-a-recorded-run/fit-body.png)

5. Read the result after fitting finishes. **Body v1**, or a later version, means the fit is in use. **Can’t tell** means the run didn't establish a better model, so the active model stays in place.

![Body v1 in Operate with the preset and fitted replay errors](/help/fit-a-robots-body-from-a-recorded-run/measured.png)

You can also choose **Fit Body** from [[⌘K]]. The fit uses up to the last 20 seconds of the current run, or the latest completed run after disconnect.

If you change the robot or its calibration while fitting runs, Basecase discards the result. Click **Fit Body** again after your changes.

Basecase fits per-link mass scales, payload at a terminal link and floor friction on top of your active servo fits. It keeps the result only when median error on held-out samples falls by at least 25%.

![Can’t tell in Operate after an inconclusive body fit](/help/fit-a-robots-body-from-a-recorded-run/cant-tell.png)

The new body model is used by simulation and training. Policies trained on the previous model show **Out of date**. **Weight** and **Servo torque** refresh in Checks. **Peak torque** and **Falls** need new simulation measurements before their results count on the changed body.

To restore the previous body version, click **Roll Back**, then confirm with **Roll Back**. Rolling back restores the previous model fingerprint, so a policy trained on that model is current again.

![Operate after rolling back the body fit to the preset](/help/fit-a-robots-body-from-a-recorded-run/rolled-back.png)

Continue with [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy) to train on the body fit.
