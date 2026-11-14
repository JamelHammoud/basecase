---
title: Number a robot's servos
date: 2026-11-13
updated: 2026-11-13
collection: operate
type: task
covers:
  - src/components/operate/ServoSetupSection.tsx
  - src/robot/servoSetup.ts
  - src/robot/servoWalk.ts
  - hw/crates/robot-daemon/src/control/assign.rs
---

Give each servo the ID its joint has in the scene, one servo at a time, so the robot's servos match its joint map before its first move.

New servos all answer at ID 1. Basecase numbers the robot's movable joints from 1 up, and Set Up Servos writes those numbers onto the servos. This build keeps real motors locked, so Set Up Servos runs on emulated servos, and each one starts out as a new servo.

1. Open a scene with a robot, then open Operate in the Play view.
2. Click Set Up Servos, or choose Set Up Servos in [[⌘K]]. The robot connects with its servos still at ID 1 and goes to Set Up with the motors off.
3. Under Motors off, find the highlighted row. It shows the joint and the ID it gets, starting with the highest ID, and Basecase selects that joint's moving parts on the canvas.
4. Plug in that joint's servo next to the servos you've already numbered. With emulated servos, Basecase plugs it in for you. Once the servo answers at its new ID, Basecase highlights the next joint.
5. After the last joint (ID 1), all the servos answer under Emulated servos. Click Test on the Ladder to continue.

If a joint uses a motor outside the Feetech and Dynamixel servos, such as the DS3218, it reads No reply because the daemon can't read that motor.

![Operate before the robot connects, with Set Up Servos under Connect Emulated Robot](/help/number-a-robots-servos/operate.png)

![The Wrist row with ID 3, and the wrist's moving part selected on the canvas](/help/number-a-robots-servos/wrist.png)

![The Elbow row with ID 2, and the elbow's moving parts selected](/help/number-a-robots-servos/elbow.png)

![Every servo answering in Set up once all three are numbered](/help/number-a-robots-servos/numbered.png)

Basecase starts at the highest ID because a new servo arrives at ID 1, which is the first joint's number. When ID 1 comes last, the servos you've already numbered can stay plugged in.

To stop, press [[Esc]]. The servos keep the IDs you've written, and Set Up Servos picks up again at the first joint that doesn't answer. If you plug in two new servos at once, or if another servo already has that ID, the robot refuses and shows the reason under the servo count.
