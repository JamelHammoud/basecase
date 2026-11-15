---
title: Compare the robot with the simulation
date: 2026-11-13
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

You can compare a connected emulated robot with the simulation joint by joint to see where the two differ. If a joint lags behind, you can fit it again.

1. Open a scene with a robot. In the Play view, open Operate, then click Connect Emulated Robot.
2. In Operate, click the connected robot's named row.
3. Climb the Ladder to Test: click Set Up, then click Test.
4. Make the simulation move the robot. In Simulate, click Drive and hold W, or start a Case try. A translucent blue robot appears next to the solid robot that the simulation moves, and it follows the servos' measured positions.
5. Read the gaps. In Operate, each joint's row shows its gap in blue after its position. The gap is the measured angle minus the simulation's angle at the same moment, in degrees. On the canvas, the largest gap is labeled at its joint.
6. If a joint's gap stays over 4° for 2 seconds while the joint moves, its row shows Calibrate where the temperature was. To calibrate only that joint, click Calibrate. If the joint's zero was never found, the joint wiggles for about 4 seconds before it runs the 18-second bench. The other joints hold still, and the selected unit keeps the new fit. Ordinary simulation uses the first robot's fits. Fleet rollout uses each unit's own fits.

![The measured robot in blue beside the simulated arm, with the largest gap labeled at the joint](/help/compare-the-robot-with-the-simulation/moving.png)

![Operate offering Calibrate on both joint rows after they lagged](/help/compare-the-robot-with-the-simulation/calibrate.png)

When several robots are connected, selecting a different Operate row switches the measured robot and its gap readings. Commands from the simulation go only to that selected unit.

The blue robot follows the selected unit in the scene you connected it from. **Disconnect** removes that unit. If another unit remains, Operate selects it. Screenshots, thumbnails and captures never include it. Clicking it selects whatever is behind it.
