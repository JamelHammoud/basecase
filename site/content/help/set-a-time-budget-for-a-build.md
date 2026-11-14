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

You can give a robot a time budget: the number of hours you have to build it. The Time check then tells you whether printing, assembly and servo set-up fit in those hours.

1. In the **Build** tab, find **Bill of materials**.
2. In the field marked h, beside the money budget, type the hours you have. Then press [[↩]].

![The bill of materials with 6 typed in the h field beside the money budget](/help/set-a-time-budget-for-a-build/budget-field.png)

3. To see the total and what it's made of, click **Time** in **Checks**.

![The Time check failing at about 8 h 52 min of 6 h, with Fix beside it](/help/set-a-time-budget-for-a-build/time-row.png)

4. To have the agent cut the time, click **Fix** beside the Time problem.

You can also tell the agent your deadline, such as "I want to build this tonight", and it sets the time budget for you. To clear the budget, type 0 in the field.

## How the time is counted

The total is an estimate, marked ≈. It adds up three times:

- **Printing.** Each plate's time comes from the print estimate, or from the slicer's own time if you've sliced that plate. Parts you've marked printed don't count. The estimate spreads the plates across every printer in **Settings** ▸ **Printers**, starting with the longest plate, and never splits one plate between two printers.
- **Assembly.** Each step of the build guide adds 2 minutes for each part, 45 seconds for each screw, nut or washer, and 90 seconds for each heat insert.
- **Servo set-up.** Each servo or motor in the scene adds 5 minutes to set up and calibrate. A joint with no servo adds nothing.

The Time check turns amber above 90% of the budget and red when the total goes over it. A red Time check stops Ready to build. Without a time budget, the check is gray and shows the total.

When you click **Fix**, the agent receives the longest plate, the build step with the most screws, and how many servos there are. The agent then cuts the time, for example by merging printed parts, making parts that carry no load thinner, or buying a part instead of printing it.

**Note:** The minutes per part, screw and servo are fixed estimates. They aren't measured on your build.
