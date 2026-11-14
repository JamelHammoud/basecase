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

Give a robot the hours you have, and the Time check tells you if printing, assembly and servo set-up fit in them.

1. In the **Build** tab, find **Bill of materials**.
2. Type the hours you have in the field marked h, beside the money budget, and press [[↩]].

![The bill of materials with 6 typed in the h field beside the money budget](/help/set-a-time-budget-for-a-build/budget-field.png)

3. In **Checks**, click **Time** to see the total and what it's made of.

![The Time check failing at about 9 h 41 min of 6 h, with Fix beside it](/help/set-a-time-budget-for-a-build/time-row.png)

4. To have the agent cut the time, click **Fix** beside the Time problem.

The agent can also set the time budget when you tell it your deadline, such as "I want to build this tonight". To clear the budget, type 0 in the field.

## How the time is counted

The total is an estimate, marked ≈, made of three parts:

- **Printing.** Each plate's time from the print estimate, or the slicer's own time for a plate you've sliced. Plates spread across every printer in **Settings** ▸ **Printers**, longest first, and one plate never splits between two printers.
- **Assembly.** For each step of the build guide, 2 minutes a part, 45 seconds a screw, nut or washer, and 90 seconds a heat insert.
- **Servo set-up.** 5 minutes to set up and calibrate each servo.

The Time check turns red over the budget and amber above 90% of it. Red stops Ready to build. With no time budget, the check is gray and shows the total.

Fix tells the agent the longest plate, the build step with the most screws, and how many servos there are. The agent then cuts the time, for example by merging printed parts, making parts that carry no load thinner, or buying a part instead of printing it.

The minutes per part, screw and servo are fixed estimates. They aren't measured on your build.
