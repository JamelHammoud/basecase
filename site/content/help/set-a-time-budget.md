---
title: Set a time budget for a robot
date: 2026-11-13
collection: build-and-print
type: task
order: 2
keywords:
  - deadline
  - hours
  - build time
  - print time
  - assembly time
  - weekend
related:
  - price-the-parts-and-set-a-budget
  - print-plates-on-several-printers
covers:
  - src/components/build/BuyTotal.tsx
  - src/utils/buildTime.ts
  - src/utils/engineeringTime.ts
  - src/workspace/runReadiness.ts
  - electron/cad-mcp/buildTools.mjs
---

Give a robot the hours you have to print, assemble and set it up, and Checks tells you when the design takes longer.

1. In the **Build** tab, find **Bill of materials**.
2. Type the hours you have in the field marked **h**, right of the money budget.
3. Press [[↩]].

![The bill of materials total with a $0 budget and an 8 h time budget beside it](/help/set-a-time-budget/field.png)

4. Under **Checks**, click **Time** to see the total and what it's made of.

![The Time check failing at about 9 h 41 min of 8 h, with print, assembly and servo times](/help/set-a-time-budget/time-fails.png)

5. To cut the time, click **Fix** on the finding. The agent gets the longest plate, the step with the most fasteners and the servo count.

Type 0 in the field to clear the time budget. You can also ask the agent for a deadline, such as “I want to build this by Sunday, about 12 hours”.

## What counts

- **Print**: each plate's estimated hours, or the slicer's time once that plate is sliced. With two printers saved in **Settings** ▸ **Printers**, the print time is halved.
- **Assembly**: 2 minutes per part, 1 minute per screw, nut or washer, and 1.5 minutes per heat insert.
- **Servos**: 5 minutes per moving joint, to set its id, center and calibrate it.

All three are estimates, so the total is marked ≈. **Time** fails over the budget and warns above 90% of it. With no time budget, it shows the total and never blocks the build.

![The Time check passing at about 9 h 41 min of 12 h](/help/set-a-time-budget/time-passes.png)

Print times come from [Printability estimates](/help/printability-estimates) until you slice. To split plates across printers, see [Print plates on several printers](/help/print-plates-on-several-printers).
