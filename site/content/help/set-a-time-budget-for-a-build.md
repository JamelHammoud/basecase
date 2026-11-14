---
title: Set a time budget for a build
date: 2026-11-14
collection: build-and-print
type: task
order: 3
keywords:
  - deadline
  - hours
  - print time
  - assembly time
  - tonight
  - weekend
related:
  - price-the-parts-and-set-a-budget
  - build-checks
covers:
  - src/components/build/BuyTotal.tsx
  - src/components/build/budget.ts
  - src/utils/engineeringTime.ts
  - src/utils/buildTime.ts
  - electron/cad-mcp/buildTools.mjs
---

A time budget is the number of hours you have to build a robot. When you set one, the Time check tells you whether printing, assembly and servo set-up fit in those hours.

1. In the **Build** tab, find **Bill of materials**.
2. Type the hours you have in the field marked h, next to the money budget. Then press [[↩]].

![The bill of materials with 6 typed in the h field beside the money budget](/help/set-a-time-budget-for-a-build/budget-field.png)

3. To see the total and what goes into it, click **Time** in **Checks**.

![The Time check failing at about 8 h 52 min of 6 h, with Fix beside it](/help/set-a-time-budget-for-a-build/time-row.png)

4. To have the agent cut the time, click **Fix** next to the Time problem.

You can also tell the agent your deadline, like "I want to build this tonight", and it sets the time budget for you. To clear the budget, type 0 in the field.

## How the time is counted

The ≈ means the total is an estimate. It adds together the time for each of these:

- **Printing.** Each plate's time comes from the print estimate, or from the slicer's own time once you've sliced that plate. Parts you've marked as printed don't count. The estimate spreads the plates across every printer in **Settings** ▸ **Printers**, starting with the longest plate, and never splits one plate between two printers.
- **Assembly.** Each step of the build guide adds 2 minutes for each part, 45 seconds for each screw, nut or washer, and 90 seconds for each heat insert.
- **Servo set-up.** Each servo or motor in the scene adds 5 minutes for set-up and calibration. A joint without a servo adds nothing.

The Time check turns amber above 90% of the budget and red when the total goes over it. A red Time check stops Ready to build. If you haven't set a time budget, the check is gray and shows the total.

When you click **Fix**, the agent gets the longest plate, the build step with the most screws, and the number of servos. It can then cut the time in several ways, such as merging printed parts, thinning parts that carry no load, or buying a part instead of printing it.

**Note:** The minutes per part, screw and servo are fixed estimates. Basecase doesn't measure them on your build.
