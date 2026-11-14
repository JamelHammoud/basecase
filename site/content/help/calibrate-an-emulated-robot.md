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
  - zero
  - direction
  - horn offset
  - replay
  - sts3215
  - dynamixel
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
  - src/robot/mountCapture.ts
  - src/reality/mountSearch.ts
  - src/cameras/silhouetteSource.ts
  - src/reality/benchSequence.ts
  - src/reality/history.ts
  - src/reality/calibratedInput.ts
  - src/reality/measuredJoints.ts
  - src/reality/servoPart.ts
  - src/reality/servoEstimate.ts
  - src/robot/emulatedUnits.ts
  - src/components/pose/JointRow.tsx
  - src/utils/engineeringSimModel.ts
---

Find each joint's zero and direction from a camera, then fit each emulated servo's model, so the simulation and training move the way the servos do.

Calibration works on the emulated robot; no real servo has been logged with it. Each joint is fitted against its own servo and variant, and each emulated servo stands in for that part.

The STS3215 C001 and XL330 start from a measured catalog model. Every other Feetech and Dynamixel servo starts from an estimate scaled from its stall torque, speed and volts. PWM servos such as the DS3218 can't answer on the bus, so Calibrate skips them and their rows read **No reply**.

1. Connect the emulated robot from the scene you want to calibrate. Steps are in [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Under **Ladder**, click **Set Up**.
3. Click **Test**, and wait for "Motors running".
4. Click **Calibrate Servos**.

![Operate in Test, with Calibrate Servos above the emulated servos](/help/calibrate-an-emulated-robot/test.png)

First, each joint whose zero and direction were never found wiggles on its own, about 4 seconds each. A camera watches it, and Basecase writes what it finds to the robot.

![The Shoulder wiggling in Operate while Calibrate Servos watches it, with the measured robot drawn in blue](/help/calibrate-an-emulated-robot/wiggle.png)

Then every joint moves slowly through a bench sequence at once, for about 18 seconds. Then each servo is fitted, one joint at a time.

5. Read each joint's row under **Emulated servos**: its name, bus ID, position and temperature. **Measured** beside the name means the simulation now runs on the fit. Under the name is the version in use, after any other verdict.

The **Pose** tab marks the same joints **Measured**.

![Shoulder 1 and Elbow 2 marked Measured at v1 in Operate, and Shoulder and Elbow marked Measured in the Pose tab](/help/calibrate-an-emulated-robot/verdicts.png)

6. Click a joint's row to open its replay.

The light line is what the servo did. The gray line is the simulation on the catalog model, and the blue line is the simulation on the fit. Under the plot, gray is the catalog model's median error and blue is the fit's.

![A joint's replay with the preset error and the calibrated error](/help/calibrate-an-emulated-robot/replay.png)

7. To go back to the previous version, hover the joint's row, click **More** and choose **Roll Back**.
8. Click **Roll Back** to confirm.

![The row's menu with its versions and Roll Back](/help/calibrate-an-emulated-robot/menu.png)

To see what an older version would do before rolling back, choose it in the same menu; the blue line redraws against it.

**Calibrate Servos** is also in [[⌘K]]. It shows only in **Test** with the motors running, and only in the scene the robot was connected from. Once a scene has calibrations, Operate lists its joints with their verdicts before you connect.

## Verdicts

| Verdict | What it means |
|---|---|
| **Measured** | The fit predicts the servo better than its catalog model, and is now in use, shown as its version: v1, v2 and up. The joint is marked **Measured** in Operate and the Pose tab |
| **Consistent with preset** | The catalog model already matches the servo; nothing changes |
| **Can’t tell** | The recording couldn't settle it; the joint keeps what it had |

A joint with no version in use shows **Preset**. On an STS3215 C001 or XL330, such a joint runs on the median of 24 emulated units of its servo, not the catalog model. **Roll Back** steps back one measured version at a time, then to the preset. A joint rolled back to the preset loses its **Measured** mark.

## Zero and direction

A joint's zero is the servo reading where the joint sits at 0°, and its direction says which way the reading grows. A horn pressed on one tooth off a 25-tooth spline sits 14.4° from the joint's 0°. A servo mounted reversed turns the joint the wrong way while its own reading agrees, so the bench can't see it.

While a joint wiggles, it steps 0.1 rad one way, then 0.1 rad the other, and back. Basecase draws the robot's outline from your CAD for both directions and every zero within 20°, and keeps the one that matches the camera. It looks for the joints nearest the base first.

- A zero that changes becomes a new version, marked **Measured**, before the bench sequence starts. The robot stops, then starts **Test** again on the new zero.
- A joint that already matched records nothing.
- A joint the camera can't see move reads **Can’t tell** and keeps its zero: one hidden behind the robot's body, or a round wrist rolling on its own axis.

The camera is your scene's first camera view, or the framed scene when you haven't placed one. On the emulated robot, Basecase draws that view at the servos' true angles, so no camera is plugged in. Each emulated servo is mounted with its own hidden offset, and some are reversed.

**Roll Back** undoes a zero like any fit. The robot's calibration follows, and a joint rolled back past its first zero returns to the default.

## What the bench sequence does

The bench sequence ramps every joint 0.25 rad each way at 0.12 rad/s, holding 0.6 s at each end, for 9 seconds. Then it swings each joint through a 0.15 rad wave at 0.12 Hz for 9 more. It's slow because Test caps each joint at 0.5 rad/s, and a move the servo couldn't follow would read **Can’t tell**.

Basecase fits the first half of each recording and checks the fit against the second half. It fits the servo's gain, delay, damping, inertia, friction and torque limit. Each stays within a quarter to 4 times its starting value, or up to 8 times for the delay. On three emulated STS3215 servos, all three read **Measured**, 7 to 10% closer than the catalog model.

If the robot leaves **Test** or faults during the run, nothing is recorded, and a message under the servo count says why.

Replays use the latest bench run, which Basecase keeps until it reloads. After a reload the verdicts and versions stay, and the replays come back with the next **Calibrate Servos**.

## Where the fit is used

The **Simulate** tab, Cases, the Motor Kit and every skill you teach run on the fitted servos. Arena varies an STS3215 C001 or XL330 joint by how its units differ, until that joint is **Measured**; see [Arena](/help/arena).

**Build** ▸ **Checks** ▸ **Servo models** passes once every servo's joint is **Measured**. Until then, its note names the servos and joints that aren't **Measured**.

To calibrate only those joints, the robot must be in **Test**, connected from this scene.

1. In **Build** ▸ **Checks**, expand **Servo models**.
2. Hover the note and click **Fix**.

Basecase selects those servos and calibrates their joints alone.

![Servo models after Elbow was rolled back, naming the Elbow servo with Fix on its note](/help/calibrate-an-emulated-robot/checks-rolled-back.png)

**Export** ▸ **Robot Package** carries each joint's active calibration, zero and direction in `joint_map.json`; see [Export a robot package](/help/export-a-robot-package).
