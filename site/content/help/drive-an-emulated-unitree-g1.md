---
title: Drive an emulated Unitree G1
date: 2026-11-13
collection: operate
type: task
covers:
  - electron/robot/unitreeG1.mjs
  - electron/robot/robotSpec.mjs
  - src/robot/sceneRobot.ts
  - src/robot/intentMirror.ts
  - src/components/operate/OperatePanel.tsx
  - src/components/operate/RobotLadder.tsx
  - hw/crates/robot-daemon/src/g1/
  - hw/crates/servo-emu/src/g1/
---

You can move an emulated Unitree G1's waist and arms from the simulation, the same way you'd drive a real G1 over Ethernet. The G1's own controller keeps it standing while you drive it.

1. Press [[⌘K]] and choose Insert Unitree G1. Operate recognizes a G1 by its 29 joint names, so a G1 you imported from Unitree's own URDF works too.
2. Open Operate in the Play view, then click Connect Emulated Robot. Operate lists 17 emulated G1 servos: the waist and both arms. It reads the 12 leg joints but never writes to them.
3. Click Set Up. Set Up checks that all 29 motors answer and that the G1 is balancing in its locomotion mode.
4. Click Test. The arms ease over from the G1's own controller in about a second. For the G1, the ladder stops at Test.

![Operate in Test with an emulated G1](/help/drive-an-emulated-unitree-g1/operate.png)

5. Pose the arms in the Pose tab, then click Simulate in the Simulate tab. The emulated G1's arms follow the simulation at up to 0.5 rad/s. A Case try or Drive moves them the same way.

![The emulated G1's shoulders following a posed simulation](/help/drive-an-emulated-unitree-g1/simulate.png)

6. Click Stop to hand the arms back to the G1's own controller. If the app stops sending commands, the daemon hands the arms back within 100 ms of noticing.

In this build, a real G1 stays locked, so only the emulated G1 can connect.
