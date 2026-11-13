---
title: Calibrate an emulated robot
date: 2026-11-12
covers:
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/CalibrationRow.tsx
  - src/components/operate/JointReplayPlot.tsx
  - src/reality/jointReplay.ts
  - src/robot/calibrationSession.ts
  - src/robot/benchRun.ts
---

Fit each servo of a connected emulated robot, so the Simulate tab, Cases, Skills and training move the way your servos do, and see how much closer the sim gets.

1. Open a scene with a robot, open Operate in the Play view, and click Connect Emulated Robot.
2. Climb the Ladder to Test: click Set up, then Test.
3. Click Calibrate Servos. Every joint moves slowly through a bench sequence for about 18 seconds, then each servo is fitted.
4. Read each joint's row. Measured means the fit beat the servo's preset and is now in use, shown as its version (v1). Consistent with preset means the preset already matches. Can’t tell means the recording couldn't settle it, and the joint keeps what it had.
5. Click a joint's row to open its replay. The light line is what the servo did, the grey line is the sim with the catalog's preset and the blue line is the sim with the calibration. Under it, grey is the preset's median error and blue is the calibration's.
6. To see what an older calibration would do, hover the row, click More and choose its version. The blue line redraws against it.
7. To go back to the previous version, choose Roll Back in the same menu, then Roll Back again to confirm.

![Operate in Test, with Calibrate Servos above the servos](/help/calibrate-an-emulated-robot/test.png)

![Each joint's verdict and version after calibrating](/help/calibrate-an-emulated-robot/verdicts.png)

![A joint's replay with the preset error and the calibrated error](/help/calibrate-an-emulated-robot/replay.png)

![The row's menu with its versions and Roll Back](/help/calibrate-an-emulated-robot/menu.png)

Calibrate Servos is also in ⌘K. It only shows in the scene the robot was connected from.

Replays use the latest bench run, which the app keeps until it reloads; after a reload the rows stay, and the replays come back with the next Calibrate Servos.
