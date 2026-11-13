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

Give each servo the ID its joint has in the scene, one servo at a time, so the robot's servos match its joint map before the first move.

New servos all answer at ID 1. Basecase numbers the movable joints 1, 2, 3 and so on, and Set Up Servos writes those numbers onto the servos. Real motors stay locked in this build, so it runs on emulated servos, which start as a bag of new ones.

1. Open a scene with a robot and open Operate in the Play view.
2. Click Set Up Servos, or choose Set Up Servos in ⌘K. The robot connects with its servos still at ID 1 and goes to Set Up, with the motors off.
3. Look at the highlighted row under Motors off: it shows the joint and the ID it gets, starting with the highest ID. The canvas selects that joint's moving parts.
4. Plug in that joint's servo next to the ones already done. With emulated servos, Basecase plugs it in for you. Once it answers at its new ID, the next joint lights up.
5. When the last joint, ID 1, is done, every servo answers under Emulated servos. Click Test on the Ladder to go on.

A joint whose motor isn't a Feetech or Dynamixel servo, such as the DS3218, reads No reply, because the daemon can't read it.

![Operate before the robot connects, with Set Up Servos under Connect Emulated Robot](/help/number-a-robots-servos/operate.png)

![The Wrist row with ID 3, and the wrist's moving part selected on the canvas](/help/number-a-robots-servos/wrist.png)

![The Elbow row with ID 2, and the elbow's moving parts selected](/help/number-a-robots-servos/elbow.png)

![Every servo answering in Set up once all three are numbered](/help/number-a-robots-servos/numbered.png)

The highest ID goes first because a new servo arrives at ID 1, the first joint's number. Numbering ID 1 last means the servos already done can stay plugged in.

Press Esc to stop. The IDs already written stay on the servos, and Set Up Servos picks up at the first joint that doesn't answer. If two new servos are plugged in at once, or another servo already has the ID, the robot refuses and says why under the servo count.
