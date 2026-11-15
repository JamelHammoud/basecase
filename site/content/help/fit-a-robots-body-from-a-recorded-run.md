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
hub_checks_and_blockers: |
  Keeping or rolling back a [body fit](/help/fit-a-robots-body-from-a-recorded-run) refreshes **Weight** and **Servo torque**. **Peak torque** and **Falls** need simulation measurements that match the active body.
covers:
  - src/components/operate/BodyCalibration.tsx
  - src/workspace/bodyActions.ts
  - src/reality/fitBody.ts
  - src/reality/bodyModel.ts
  - src/reality/history.ts
---

Fit the masses, payload and floor friction used by simulation and training from recorded joint positions and commands.

Body fitting runs in the desktop app. Real motors stay locked in the current runtime. First, [record a moving Operate session](/help/keep-a-robot-session-as-a-try) with an emulated robot.

1. In the Play view, open **Operate**.
2. Click the connected unit's named row, if more than one is connected.
3. Click **Fit Body**.

![Fit Body button in Operate](/help/fit-a-robots-body-from-a-recorded-run/fit-body.png)

4. Read the result after fitting finishes. **Body v1**, or a later version, means the fit is in use. **Can’t tell** means the run didn't establish a better model, so the active model stays in place.

![Body v1 in Operate with the preset and fitted replay errors](/help/fit-a-robots-body-from-a-recorded-run/measured.png)

You can also choose **Fit Body** from [[⌘K]]. The fit uses up to the last 20 seconds of the current run, or the latest completed run after disconnect.

If you change the robot or its calibration while fitting runs, Basecase discards the result. Click **Fit Body** again after your changes.

![Can’t tell in Operate after an inconclusive body fit](/help/fit-a-robots-body-from-a-recorded-run/cant-tell.png)

See [Bodies fitted from recordings](/help/simulation-in-basecase#bodies-fitted-from-recordings) for how a fit changes simulation, Checks and training.

## Restore the previous body

1. In **Operate**, beside the active body version, click **Roll Back**.
2. In the confirmation, click **Roll Back**.

![Operate after rolling back the body fit to the preset](/help/fit-a-robots-body-from-a-recorded-run/rolled-back.png)

Continue with [Retrain an out-of-date policy](/help/retrain-an-out-of-date-policy) to train on the body fit.
