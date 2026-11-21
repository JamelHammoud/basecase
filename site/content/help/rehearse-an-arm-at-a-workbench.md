---
title: Rehearse an arm at a workbench
date: 2026-11-20
collection: simulate-and-train
type: task
related:
  - make-a-case
  - try-a-case
covers:
  - src/cases/workbench/
  - src/workspace/useCaseWorkbench.ts
  - src/workspace/useWorkbenchVerification.ts
  - src/components/simulate/WorkbenchSection.tsx
  - src/components/simulate/WorkbenchPoseFields.tsx
hub_run_a_case: |
  Enter a named unit's measured base placement and [rehearse an arm at a workbench](/help/rehearse-an-arm-at-a-workbench) with fixture dimensions fixed.
---

Check an arm's Cartesian reference at the workbench placement you enter. Keep the Case's fixtures at the size you authored.

You run the rehearsal in simulation without sending robot commands. The measurements you enter don't establish physical registration accuracy.

1. In **Play**, open **Cases**.
2. Choose an existing Case for one fixed arm.
3. In **Simulate**, expand **Workbench placement**.
4. In **Unit**, enter the named unit you want to save the placement for.
5. In **X**, **Y** and **Z**, enter the robot's base datum in millimeters relative to the workbench.
6. In **Yaw**, enter the base's rotation about the upright axis in degrees.
7. Click **Rehearse**.

![An entered placement for bench-arm with a passed simulated drawer reference](/help/rehearse-an-arm-at-a-workbench/entered.png)

Use the Case's authored frame as the workbench frame. Y points up, and positive yaw turns positive Z toward positive X.
Use the mean of the robot's root joint origins as the base datum, rather than the bottom of its mesh.
The initial values place that datum at its position in the studio.
You can enter a translation of up to 100000 mm in either direction and a yaw of up to 360 degrees in either direction.
You can't set pitch or roll.

Use Cartesian position targets and grip commands in the supplied reference. Basecase refuses joint targets, velocity moves and scripted worlds before simulation.
The existing arm controller keeps its upright tool convention.
During rehearsal, Basecase runs every supported command and checks the Case's physical contract in MuJoCo.
Basecase can refuse a placement during reach and static-fixture contact checks even if the contract would pass.

![An entered placement refused because a reference target is outside the arm's reach](/help/rehearse-an-arm-at-a-workbench/unreachable.png)

Basecase saves the placement and its result with the scene. You can save 128 placements in each scene. In the **Entered** result, Basecase retains the unit, Case and robot identities.
Focus or hover over **Entered** to inspect the Case and robot fingerprints.
If you change the Case, geometry, tool binding or placement, Basecase hides the previous verdict. Changing only a part's visual finish keeps the verdict.
Press [[⌘Z]] to undo a completed placement, or [[⇧⌘Z]] to redo it.

You can open these fields with [[⌘K]] and **Edit Workbench Placement**.
With **Try Reference**, you continue to use the Case's usual reach adaptation.
