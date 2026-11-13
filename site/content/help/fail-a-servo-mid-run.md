---
title: Fail a servo mid-run
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/sim/faults.ts
  - src/components/simulate/faultMenu.tsx
  - src/components/simulate/RunResult.tsx
  - src/components/simulate/ResultsSection.tsx
  - src/workspace/contextMenuItems.tsx
---

Break one servo while the simulation runs, to see whether the robot still stands, walks or grips without it before you print anything.

1. Open the Simulate tab and start the robot: click **Drive**, or pick a controller and press Play.
2. Right-click the joint's row under **Peak torque** in **Results**, or right-click a part on the canvas that the joint moves.
3. Choose **Fault**, then how the servo fails: **Limp** (no torque), **Weak** (half its torque), **Stuck** (holds where it is) or **Laggy** (every command arrives 60 ms late).

![The Fault menu open on Leg2 bend in Peak torque](/help/fail-a-servo-mid-run/menu.png)

4. Watch the robot. The joint's row shows the fault and moves to the top of Peak torque.

![Leg2 bend marked Limp while the hexapod keeps walking on five legs](/help/fail-a-servo-mid-run/limp.png)

5. To mend the servo, right-click it again and choose **Fault ▸ Clear**. Ending the simulation clears every fault.

A fault stays through Reset and Start over (R), the way a broken servo would.

During a Case try, the faults you set are saved on the try. Its row in Results shows each one, and hovering a fault shows the joint and when it failed, counted from the start of the try.

![A missed try in Results marked Weak, with Arm1 at 1.3 s in its tooltip](/help/fail-a-servo-mid-run/results.png)
