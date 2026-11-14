---
title: Roll out a skill to a fleet
date: 2026-11-14
image: /changelog/roll-out-a-skill-to-a-fleet/cover.png
---

You can now run several emulated robots at once in Operate and roll a skill out to them, canaries first. Each rollout proves the skill in Arena on every robot's calibrated twin before sending a policy.

Operate lists one row per robot, and the Ladder, the servo rows and Calibrate Servos act on the row you click. Every robot runs its own control program with its own hidden servo differences, so a stall on one leaves the others running. Each robot keeps its own calibrations.

Robots from one design still differ. In our test fleet of three arms, one had a shoulder servo that couldn't hold its load. The same skill passed Arena on the design and on two twins, and failed on that robot's twin. Roll Out held that robot back with the contract line it failed, and sent the policy to the other two.

Roll Out runs Arena on every twin, then sends the policy to the canaries you choose. It climbs each to Rehearse before the rest get it. Each robot stays on the version it runs, and Roll Back returns one robot to its previous version. A fleet holds up to 32 emulated robots in the desktop app. Roll Out sends saved network policies to Feetech and Dynamixel units.

Steps are in [Roll out a skill to a fleet of emulated robots](/help/roll-out-a-skill-to-a-fleet).
