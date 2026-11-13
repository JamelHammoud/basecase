---
title: Calibrate an emulated robot
date: 2026-11-12
updated: 2026-11-13
collection: operate
type: task
order: 2
keywords:
  - calibration
  - servo fit
  - system identification
  - sysid
  - sim to real
  - roll back
  - replay
  - sts3215
related:
  - connect-an-emulated-robot
  - simulation-in-basecase
covers:
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/JointRow.tsx
  - src/components/operate/JointRowMenu.tsx
  - src/components/operate/JointReplayPlot.tsx
  - src/workspace/operateCommands.tsx
  - src/robot/jointRows.ts
  - src/reality/jointReplay.ts
  - src/robot/calibrationSession.ts
  - src/robot/benchRun.ts
  - src/reality/benchSequence.ts
  - src/reality/history.ts
  - src/reality/calibratedInput.ts
---

Fit each emulated servo's model from an 18-second bench run, so the simulation, Cases and training move the way the servos do.

Calibration works on the emulated robot; no real servo has been logged with it. The fit is used on joints driven by an STS3215, the servo the emulator runs.

1. Connect the emulated robot from the scene you want to calibrate. Steps are in [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Under **Ladder**, click **Set Up**.
3. Click **Test**, and wait for "Motors running".
4. Click **Calibrate Servos**.

![Operate in Test, with Calibrate Servos above the emulated servos](/help/calibrate-an-emulated-robot/test.png)

Every joint moves slowly through a bench sequence at once, for about 18 seconds. Then each servo is fitted, one joint at a time.

5. Read each joint's row under **Emulated servos**: its name and bus ID, its position and temperature, and under the name its verdict and the version now in use.

![Shoulder 1 and Elbow 2, each Measured at v1 under its name, beside its position and temperature](/help/calibrate-an-emulated-robot/verdicts.png)

6. Click a joint's row to open its replay.

The light line is what the servo did. The grey line is the simulation on the catalog model, and the blue line is the simulation on the fit. Under the plot, grey is the catalog model's median error and blue is the fit's.

![A joint's replay with the preset error and the calibrated error](/help/calibrate-an-emulated-robot/replay.png)

7. To go back to the previous version, hover the joint's row, click **More** and choose **Roll Back**.
8. Click **Roll Back** to confirm.

![The row's menu with its versions and Roll Back](/help/calibrate-an-emulated-robot/menu.png)

To see what an older version would do before rolling back, choose it in the same menu; the blue line redraws against it.

**Calibrate Servos** is also in [[⌘K]]. It shows only in **Test** with the motors running, and only in the scene the robot was connected from. Once a scene has calibrations, Operate lists its joints with their verdicts before you connect.

## Verdicts

| Verdict | What it means |
|---|---|
| **Measured** | The fit predicts the servo better than its catalog model, and is now in use, shown as its version: v1, v2 and up |
| **Consistent with preset** | The catalog model already matches the servo; nothing changes |
| **Can’t tell** | The recording couldn't settle it; the joint keeps what it had |

A joint with no version in use shows **Preset**. **Roll Back** steps back one measured version at a time, then to the preset.

## What the bench sequence does

The bench sequence ramps every joint 0.25 rad each way at 0.12 rad/s, holding 0.6 s at each end, for 9 seconds. Then it swings each joint through a 0.15 rad wave at 0.12 Hz for 9 more. It's slow because Test caps each joint at 0.5 rad/s, and a move the servo couldn't follow would read **Can’t tell**.

Basecase fits the first half of each recording and checks the fit against the second half. It fits the servo's gain, delay, damping, inertia, friction and torque limit. Each stays within a quarter to 4 times the catalog value, or up to 8 times for the delay. On three emulated STS3215 servos, all three read **Measured**, 7 to 10% closer than the catalog model.

If the robot leaves **Test** or faults during the run, nothing is recorded, and a message under the servo count says why.

Replays use the latest bench run, which Basecase keeps until it reloads. After a reload the verdicts and versions stay, and the replays come back with the next **Calibrate Servos**.

## Where the fit is used

The **Simulate** tab, Cases, the Motor Kit and every skill you teach run on the fitted servos. **Export** ▸ **Robot Package** carries each joint's active calibration in `joint_map.json`; see [Export a robot package](/help/export-a-robot-package).
