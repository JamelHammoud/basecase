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

Calibrating finds each joint's zero and direction from a camera, then fits a model to each emulated servo. After that, the simulation and training move the way your servos do.

Calibration works on the emulated robot and hasn't logged a real servo. Basecase fits each joint against its own servo and variant, and each emulated servo stands in for that part.

The STS3215 C001 and XL330 start from a measured catalog model. Every other Feetech and Dynamixel servo starts from an estimate scaled from its stall torque, speed and volts. PWM servos such as the DS3218 can't answer on the bus, so Calibrate skips them and their rows read **No reply**.

1. Connect the emulated robot from the scene you want to calibrate. For steps, see [Connect an emulated robot](/help/connect-an-emulated-robot).
2. Under **Ladder**, click **Set Up**.
3. Click **Test**, then wait for "Motors running".
4. Click **Calibrate Servos**.

![Operate in Test, with Calibrate Servos above the emulated servos](/help/calibrate-an-emulated-robot/test.png)

First, Basecase wiggles each joint whose zero and direction it has never found. Each one moves on its own for about 4 seconds while a camera watches it, and Basecase writes what it finds to the robot.

![The Shoulder wiggling in Operate while Calibrate Servos watches it, with the measured robot drawn in blue](/help/calibrate-an-emulated-robot/wiggle.png)

Next, all the joints move together through a slow bench sequence for about 18 seconds. Finally, Basecase fits each servo, one joint at a time.

5. Read each joint's row under **Emulated servos**. It shows the joint's name, bus ID, position and temperature. **Measured** beside the name means the simulation now runs on the fit. The version in use appears under the name, after any other verdict.

The **Pose** tab marks the same joints **Measured**.

![Shoulder 1 and Elbow 2 marked Measured at v1 in Operate, and Shoulder and Elbow marked Measured in the Pose tab](/help/calibrate-an-emulated-robot/verdicts.png)

6. Click a joint's row to open its replay.

The light line is what the servo did. The gray line is the simulation on the catalog model, and the blue line is the simulation on the fit. Under the plot, gray is the catalog model's median error and blue is the fit's.

![A joint's replay with the preset error and the calibrated error](/help/calibrate-an-emulated-robot/replay.png)

7. To go back to the previous version, hover the joint's row, click **More**, then choose **Roll Back**.
8. Click **Roll Back** to confirm.

![The row's menu with its versions and Roll Back](/help/calibrate-an-emulated-robot/menu.png)

To see what an older version would do before you roll back, choose it in the same menu. Basecase redraws the blue line against that version.

**Calibrate Servos** is also in [[⌘K]]. It shows only in **Test** with the motors running, and only in the scene you connected the robot from. Once a scene has calibrations, Operate lists its joints with their verdicts before you connect.

## Verdicts

| Verdict | What it means |
|---|---|
| **Measured** | The fit predicts the servo better than its catalog model and is now in use, shown as its version: v1, v2 and up. The joint is marked **Measured** in Operate and the Pose tab |
| **Consistent with preset** | The catalog model matches the servo. Nothing changes |
| **Can’t tell** | Basecase couldn't decide either way from the recording, so the joint keeps what it had |

A joint with no version in use shows **Preset**. **Roll Back** steps back one measured version at a time, then to the preset. A joint rolled back to the preset loses its **Measured** mark.

## Zero and direction

A joint's zero is the servo reading where the joint sits at 0°. Its direction says which way the reading grows. A horn pressed on one tooth off a 25-tooth spline sits 14.4° from the joint's 0°. A servo mounted reversed turns the joint the wrong way while its own reading agrees, so the bench can't see it.

While a joint wiggles, it steps 0.1 rad one way, then 0.1 rad the other, and back. Basecase draws the robot's outline from your CAD for both directions and every zero within 20°, and keeps the one that matches the camera. It checks the joints nearest the base first.

- When a joint's zero changes, Basecase saves it as a new version, marked **Measured**, before the bench sequence starts. The robot stops, then starts **Test** again on the new zero.
- If a joint's zero matches the camera, Basecase records nothing for it.
- If the camera can't see a joint move, the joint reads **Can’t tell** and keeps its zero. This happens with a joint hidden behind the robot's body, or a round wrist rolling on its own axis.

The camera is your scene's first camera view. If you haven't placed one, it's the framed scene. The emulated robot has no camera plugged in, so Basecase draws that view at the servos' true angles. It also gives each emulated servo its own hidden offset and mounts some reversed.

**Roll Back** undoes a zero the same way it undoes any fit. Basecase updates the robot's calibration to match, and a joint rolled back past its first zero returns to the default.

## What the bench sequence does

The bench sequence ramps every joint 0.25 rad each way at 0.12 rad/s, holding 0.6 s at each end, for 9 seconds. Then it swings each joint through a 0.15 rad wave at 0.12 Hz for 9 more seconds. It's slow because Test caps each joint at 0.5 rad/s, and a move the servo couldn't follow would read **Can’t tell**.

Basecase fits the first half of each recording and checks the fit against the second half. It fits the servo's gain, delay, damping, inertia, friction and torque limit. Each stays within a quarter to 4 times its starting value, or up to 8 times for the delay. On three emulated STS3215 servos, all three read **Measured**, 7 to 10% closer than the catalog model.

If the robot leaves **Test** or faults during the run, Basecase records nothing, and a message under the servo count says why.

Replays use the latest bench run, which Basecase keeps until it reloads. After a reload, the verdicts and versions stay, and the replays come back with the next **Calibrate Servos**.

## Where the fit is used

The **Simulate** tab, Cases, the Motor Kit and every skill you teach run on the fitted servos.

**Build** ▸ **Checks** ▸ **Servo models** passes once every servo's joint is **Measured**. Until then, its note names the servos and joints that aren't **Measured**.

To calibrate only those joints, connect the robot from this scene and put it in **Test**.

1. In **Build** ▸ **Checks**, expand **Servo models**.
2. Hover the note and click **Fix**.

Basecase selects those servos and calibrates only their joints.

![Servo models after Elbow was rolled back, naming the Elbow servo with Fix on its note](/help/calibrate-an-emulated-robot/checks-rolled-back.png)

**Export** ▸ **Robot Package** carries each joint's active calibration, zero and direction in `joint_map.json`. To learn more, see [Export a robot package](/help/export-a-robot-package).
