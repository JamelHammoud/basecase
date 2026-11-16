---
title: Open lids and pull drawers
date: 2026-11-15
collection: simulate-and-train
type: task
related:
  - make-a-case
  - try-a-case
covers:
  - src/cases/fixtureGoals.ts
  - src/cases/fixtureTravel.ts
  - src/components/simulate/ReferenceTryButton.tsx
hub_run_a_case: |
  ### Lids and drawers

  Test an arm against a passive hinge or slide, with editable travel, weight and resistance. [Open lids and pull drawers](/help/open-lids-and-pull-drawers).
---

Test whether an arm can move a hinged lid or a sliding drawer through contact with its handle.

1. In **Parts**, add a robot with an arm and a gripper.
2. In **Play** ▸ **Cases**, click **New Case**.
3. Under **Goal**, choose **Open a Lid** or **Pull a Drawer**.
4. Set **Travel** to the hinge angle in degrees or the drawer distance in millimeters.
5. Set **Weight** to the moving plate's weight in grams.

   ![Open a Lid in New Case with travel, weight and resistance fields](/help/open-lids-and-pull-drawers/lid-builder.png)

   ![Pull a Drawer in New Case with travel, weight and resistance fields](/help/open-lids-and-pull-drawers/drawer-builder.png)

6. Click **Make Case**.
7. In **Try**, click **Try Reference**.
8. Under **Results**, click the saved try to reopen its recorded motion and verdict.

   ![The recorded lid try open on its timeline](/help/open-lids-and-pull-drawers/lid-replay.png)

   ![The recorded drawer try open on its timeline](/help/open-lids-and-pull-drawers/drawer-replay.png)

Use **Width**, **Depth** and **Height** to change the fixture's geometry. Use **Joint friction** and **Damping** to change its resistance. A heavier plate or higher resistance can make the same robot fail. The reference must keep handle contact while moving beyond 80% of the chosen travel.

Choose **Try It** to drive the robot yourself. Follow the steps in [Try a Case](/help/try-a-case).
