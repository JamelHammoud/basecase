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
hub_troubleshoot_build_check_blocks_ready_to_build_order: 20
hub_troubleshoot_build_check_blocks_ready_to_build: |
  ## Time is red

  Estimated printing, assembly and servo setup exceed your budget in hours.

  1. In **Checks**, open **Time** to read the three contributions.
  2. Click **Fix** to ask the agent to reduce printing or assembly time.

  ![The Time check failing with a one-hour budget on Weekend rover](/help/set-a-time-budget/over-budget.png)

  If you have more time available, change **Time** under **Bill of materials** and press [[↩]]. The row passes at 90% of the budget or below, turns amber above 90% and red above 100%. Entering 0 clears the budget and leaves the estimate as a note. [Set a time budget](/help/set-a-time-budget) explains what the estimate includes.
hub_checks_and_blockers_order: 10
hub_checks_and_blockers: |
  Time is a note until you [set a time budget](/help/set-a-time-budget). It becomes a blocker when estimated printing, assembly and servo setup exceed those hours. Above 90% of the budget, it stays a note.

  ![The Time check failing with a one-hour budget on Weekend rover](/help/set-a-time-budget/over-budget.png)

  Time uses planning estimates for assembly and servo setup even after slicing. It excludes delivery, failed prints and print service lead times.
hub_the_design_agent_order: 170
hub_the_design_agent: |
  Give the agent a budget in hours, or [set a time budget](/help/set-a-time-budget) in the Build tab. On the Time row, **Fix** sends it the longest print plate, the assembly step with the most fasteners and the servo count. It can merge compatible printed parts or replace a printed part with a catalog part.
---

Compare printing, assembly, and servo setup with the hours you have for your robot.

1. In the right panel, click **Build**.
2. Under **Bill of materials**, enter your hours in **Time**.
3. Press [[↩]].
4. Under **Checks**, click **Time** to read the breakdown.

![The Time check with a printing, assembly, and servo setup estimate](/help/set-a-time-budget/estimate.png)

For what the estimate includes and leaves out, see [Printability estimates](/help/printability-estimates).

Time doesn’t estimate PCB routing or soldering for an [electronics board](/help/fit-an-electronics-board).

Changes to printer obstacle settings or supplied brim clearance refresh the checks and invalidate affected plate timings. Those plates use estimates until sliced again.

![The Time check failing with a one-hour budget on Weekend rover](/help/set-a-time-budget/over-budget.png)

The check fails above your budget and warns above 90 percent.
On a failing row, click **Fix** to ask the agent to reduce printing or assembly time.
The agent gets the longest plate, the step with the most fasteners, and the servo count.

To change the budget, enter another value in **Time**.
To clear it, enter 0.
Without a budget, the estimate remains a note and never blocks the build.

![The Time check passing after increasing the budget](/help/set-a-time-budget/within-budget.png)
