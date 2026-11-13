---
title: Compare the robot with the simulation
date: 2026-11-13
covers:
  - src/components/operate/RobotJoints.tsx
  - src/robot/robotTwin.ts
  - src/robot/robotGap.ts
  - src/robot/robotGhost.ts
  - src/three/viewport/ghostLayer.ts
  - src/workspace/useRobotGhost.ts
---

See where a connected emulated robot and the simulation part ways, joint by joint, and fit the joint that lags.

1. Open a scene with a robot, open Operate in the Play view, and click Connect Emulated Robot.
2. Climb the Ladder to Test: click Set Up, then Test.
3. Make the simulation move the robot: in Simulate, click Drive and hold W, or start a Case try. A translucent blue robot follows the servos' measured positions, next to the solid robot the simulation moves.
4. Read the gaps. Each servo's row in Operate shows its gap in blue after its position: the measured angle minus the simulation's angle at the same moment, in degrees. The canvas labels the largest gap at its joint.
5. When a joint's gap stays over 4° for 2 seconds while it moves, its row shows Calibrate where the temperature was. Click it to run the 18-second bench on that joint alone. The other joints hold still, and the simulation uses the new fit from the next run.

![The measured robot in blue beside the simulated arm, with the largest gap labelled at the joint](/help/compare-the-robot-with-the-simulation/moving.png)

![Operate offering Calibrate on both servo rows after they lagged](/help/compare-the-robot-with-the-simulation/calibrate.png)

The blue robot only shows in the scene the robot was connected from, and it goes away when you click Disconnect. It never appears in screenshots, thumbnails or captures, and clicking it selects whatever is behind it.
