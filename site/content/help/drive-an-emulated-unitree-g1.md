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

Move an emulated Unitree G1's waist and arms from the simulation, the way you'd drive a real one over Ethernet, while its own controller keeps it standing.

1. Press [[⌘K]] and choose Insert Unitree G1. Operate recognizes the G1 by its 29 joint names, so a G1 imported from Unitree's own URDF works too.
2. Open Operate in the Play view and click Connect Emulated Robot. Operate lists 17 emulated G1 servos: the waist and both arms. The 12 leg joints are read, never written.
3. Click Set Up. It checks that all 29 motors answer and that the G1 is balancing in its locomotion mode.
4. Click Test. The arms ease over from the G1's own controller in about a second. The ladder stops at Test for the G1.

![Operate in Test with an emulated G1](/help/drive-an-emulated-unitree-g1/operate.png)

5. Pose the arms in the Pose tab, then click Simulate in the Simulate tab. The emulated G1's arms follow the simulation at up to 0.5 rad/s. A Case try or Drive moves them the same way.

![The emulated G1's shoulders following a posed simulation](/help/drive-an-emulated-unitree-g1/simulate.png)

6. Click Stop to hand the arms back to the G1's own controller. If the app stops sending commands, the daemon hands them back on its own within 100 ms of noticing.

Only the emulated G1 can connect. A real G1 stays locked in this build.
