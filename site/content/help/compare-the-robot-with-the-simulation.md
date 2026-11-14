---
title: Compare the robot with the simulation
date: 2026-11-13
updated: 2026-11-14
collection: operate
type: task
order: 3
related:
  - connect-an-emulated-robot
  - calibrate-an-emulated-robot
covers:
  - src/components/operate/RobotJoints.tsx
  - src/components/operate/JointRow.tsx
  - src/robot/robotTwin.ts
  - src/robot/robotGap.ts
  - src/robot/robotGhost.ts
  - src/three/viewport/ghostLayer.ts
  - src/workspace/useRobotGhost.ts
---

You can compare a connected emulated robot with the simulation joint by joint to see where the two differ, and fit again any joint that lags behind.

1. Open a scene with a robot. In the Play view, open Operate, then click Connect Emulated Robot.
2. Climb the Ladder to Test. Click Set Up, then click Test.
3. Make the simulation move the robot. In Simulate, click Drive and hold W, or start a Case try. A translucent blue robot that follows the servos' measured positions appears next to the solid robot the simulation moves.
4. Read the gaps. In Operate, each joint's row shows its gap in blue, after its position. The gap is the measured angle minus the simulation's angle at the same moment, in degrees. The canvas labels the largest gap at its joint.
5. If a joint's gap stays over 4° for 2 seconds while the joint moves, its row shows Calibrate where the temperature was. To calibrate only that joint, click Calibrate. The other joints hold still. If the joint's zero was never found, the joint wiggles for about 4 seconds, then runs the 18-second bench. The simulation uses the new fit starting with the next run.

![The measured robot in blue beside the simulated arm, with the largest gap labeled at the joint](/help/compare-the-robot-with-the-simulation/moving.png)

![Operate offering Calibrate on both joint rows after they lagged](/help/compare-the-robot-with-the-simulation/calibrate.png)

The blue robot appears only in the scene you connected the robot from, and it goes away when you click Disconnect. Screenshots, thumbnails and captures never include it, and clicking it selects whatever is behind it.

Basecase keeps both sets of angles in the session's try, under **Tries** in **Library**. See [Record a robot session as a try](/help/record-a-robot-session-as-a-try).
