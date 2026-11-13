---
title: Calibrate an emulated robot
date: 2026-11-12
covers:
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/CalibrationRow.tsx
  - src/robot/calibrationSession.ts
  - src/robot/benchRun.ts
  - src/components/operate/CalibrationReplay.tsx
  - src/components/operate/CalibrationRowActions.tsx
---

Fit each servo of a connected emulated robot, so the Simulate tab, Cases, Skills and training move the way your servos do.

1. Open a scene with a robot, open Operate in the Play view, and click Connect Emulated Robot.
2. Climb the Ladder to Test: click Set up, then Test.
3. Click Calibrate Servos. Every joint moves slowly through a bench sequence for about 18 seconds, then each servo is fitted.
4. Read each joint's row. Measured means the fit beat the servo's preset and is now in use, shown as its version (v1). Consistent with preset means the preset already matches. Can’t tell means the recording couldn't settle it, and the joint keeps what it had.
5. Click a joint's row to see its bench run replayed in the sim. The white line is what the servo did, grey is the preset's replay and blue is the calibration in use. The grey and blue numbers under it are each one's median error.
6. To see what an older version would change, hover the row, click Versions and choose it. The blue line and number redraw for that version; nothing changes until you roll back.
7. To go back to the previous version, hover the joint's row, click Roll Back, then Roll Back again to confirm.

![Operate in Test, with Calibrate Servos above the servos](/help/calibrate-an-emulated-robot/test.png)

![Each joint's verdict and version after calibrating](/help/calibrate-an-emulated-robot/verdicts.png)

![A joint's replay: the logged position in white, the preset in grey and the calibration in blue, with 0.70° and 0.14° under it](/help/calibrate-an-emulated-robot/replay.png)

![The Versions menu on a joint's row, listing v2 and v1](/help/calibrate-an-emulated-robot/versions.png)

![Rolling a joint back asks first](/help/calibrate-an-emulated-robot/roll-back.png)

Calibrate Servos is also in ⌘K. It only shows in the scene the robot was connected from.
