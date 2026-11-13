---
title: Calibrate an emulated robot
date: 2026-11-12
covers:
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/CalibrationRow.tsx
  - src/robot/calibrationSession.ts
  - src/robot/benchRun.ts
---

Fit each servo of a connected emulated robot, so the Simulate tab, Cases, Skills and training move the way your servos do.

1. Open a scene with a robot, open Operate in the Play view, and click Connect Emulated Robot.
2. Climb the Ladder to Test: click Set up, then Test.
3. Click Calibrate Servos. Every joint moves slowly through a bench sequence for about 18 seconds, then each servo is fitted.
4. Read each joint's row. Measured means the fit beat the servo's preset and is now in use, shown as its version (v1). Consistent with preset means the preset already matches. Can’t tell means the recording couldn't settle it, and the joint keeps what it had.
5. To go back to the previous version, hover the joint's row, click Roll Back, then Roll Back again to confirm.

![Operate in Test, with Calibrate Servos above the servos](/help/calibrate-an-emulated-robot/test.png)

![Each joint's verdict and version after calibrating](/help/calibrate-an-emulated-robot/verdicts.png)

![Rolling a joint back asks first](/help/calibrate-an-emulated-robot/roll-back.png)

Calibrate Servos is also in ⌘K. It only shows in the scene the robot was connected from.
