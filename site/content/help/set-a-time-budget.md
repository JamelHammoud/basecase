---
title: Set a time budget
date: 2026-11-14
collection: build-and-print
type: task
related:
  - price-the-parts-and-set-a-budget
  - build-checks
covers:
  - src/components/build/BuyTotal.tsx
  - src/utils/engineeringTime.ts
  - src/workspace/runReadiness.ts
---

Compare printing, assembly, and servo setup with the hours you have for your robot.

1. In the right panel, click **Build**.
2. Under **Bill of materials**, enter your hours in **Time**.
3. Press [[↩]].
4. Under **Checks**, click **Time** to read the breakdown.

![The Time check with a printing, assembly, and servo setup estimate](/help/set-a-time-budget/estimate.png)

The estimate divides printing across the printers saved in Settings, with one printer counted when none are saved.
Matching sliced plates replace their print estimates, while unsliced plates keep theirs.
Assembly allows one minute per guide step, two per part, half a minute per fastener, and one and a half per insert.
Servo setup and calibration allow five minutes per movable joint.
These are planning estimates, and exclude delivery, print failures, and print service lead times.

![The Time check failing with a one-hour budget on Weekend rover](/help/set-a-time-budget/over-budget.png)

The check fails above your budget and warns above 90 percent.
On a failing row, click **Fix** to ask the agent to reduce printing or assembly time.
The agent gets the longest plate, the step with the most fasteners, and the servo count.

To change the deadline, enter another value in **Time**.
To clear it, enter 0.
Without a budget, the estimate remains a note and never blocks the build.

![The Time check passing after increasing the budget](/help/set-a-time-budget/within-budget.png)
