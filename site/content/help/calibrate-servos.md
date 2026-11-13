---
title: Calibrate a robot's servos and compare the replays
date: 2026-11-12
covers:
  - src/components/operate/RobotCalibration.tsx
  - src/components/operate/CalibrationRow.tsx
  - src/components/operate/JointReplayPlot.tsx
  - src/reality/jointReplay.ts
---

Fit the sim's servo model to how each joint of your robot actually moves, and see how much closer the sim gets.

1. Open Operate in the Play view, or press ⌘K and choose Show Operate.
2. Click Connect Emulated Robot, then Set Up, then Test.
3. Click Calibrate. Every joint moves slowly for about 18 seconds, then each one gets a row with its verdict and version.

![Operate in Test, with Calibrate under the ladder](/help/calibrate-servos/test.png)

![Each joint's verdict and version after calibrating](/help/calibrate-servos/calibrated.png)

4. Click a joint's row to open its replay. The light line is what the servo did, the grey line is the sim with the catalog's preset and the blue line is the sim with the calibration. Under it, grey is the preset's median error and blue is the calibration's.

![A joint's replay with the preset error and the calibrated error](/help/calibrate-servos/replay.png)

5. To see what an older calibration would do, hover the row, click More and choose its version. The blue line redraws against it.
6. To go back to the previous version for good, choose Roll Back in the same menu and confirm.

![The row's menu with its versions and Roll Back](/help/calibrate-servos/menu.png)
