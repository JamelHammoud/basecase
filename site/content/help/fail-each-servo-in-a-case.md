---
title: Fail each servo in a Case
date: 2026-11-22
collection: simulate-and-train
type: task
related:
  - fail-a-servo-mid-run
  - replay-a-failing-seed
covers:
  - src/cases/caseFaults.ts
  - src/components/cases/CaseFaultSection.tsx
  - src/components/build/CaseCheckItem.tsx
  - src/workspace/caseChecks.ts
  - src/workspace/caseFaultEditing.ts
---

Add a broken servo to a Case, and Checks tells you whether the robot still passes the Case without it.

1. Open the Case in the **Simulate** tab. Find **Faults** under the Case's world.
2. Press the + button in **Faults**. Choose the servo, then how it fails: **Limp**, **Weak**, **Stuck** or **Laggy**.

   ![The servo list open on leg0_bend with its four failures](/help/fail-each-servo-in-a-case/menu.png)

3. The fault is listed in **Faults**. Add one entry for each servo you want to test.

   ![Faults listing Limp leg0_bend](/help/fail-each-servo-in-a-case/faults.png)

4. Open the **Build** tab. Under **Checks**, each fault has its own row under the Case's row, with how many of the 20 seeded runs passed.

   ![Walk Without Falling with Limp leg0_bend at 0 of 20](/help/fail-each-servo-in-a-case/row.png)

5. Click a fault's row. Then click a red trail on the canvas to open that failing seed with the servo broken.

   ![A failing seed open on the timeline with leg0_bend limp](/help/fail-each-servo-in-a-case/replay.png)

To add a fault you set during a run, right-click the joint's row under **Peak torque**, then choose **Fault** ▸ **Add to Case**. It needs an open Case and a fault already set on that joint.

To remove an entry, press **Delete** beside it and confirm.

Each fault is tried on its own, from the first moment of every run, across the same 20 seeds as the Case's row. A row passes at 18 or more. The Case's own row judges the robot with no fault.

A passing row means the simulated robot survived that failure. It says nothing about the printed robot, and it doesn't count toward Ready to build.

A fault on a servo the robot no longer has fails its row and says so. Remove the entry or change the servo.

For failing seeds, see [Replay a failing seed](/help/replay-a-failing-seed). For faults during a live run, see [Fail a servo mid-run](/help/fail-a-servo-mid-run).
