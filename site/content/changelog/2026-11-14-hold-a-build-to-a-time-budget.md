---
title: Hold a build to a time budget
date: 2026-11-14
image: /changelog/hold-a-build-to-a-time-budget/cover.png
---

You can now give a robot the hours you have, beside its money budget, and a Time check says whether printing, assembly and servo set-up fit in them.

A first robot is often wanted tonight or this weekend. Slicers give print time per plate, and only after slicing. Nothing added the build and the servo set-up, or checked the total against a deadline.

The hours field sits beside the budget in the Build tab's bill of materials. The Time check adds each plate's print time, spread across the printers you've added, then 2 minutes a part, 45 seconds a screw and 90 seconds a heat insert for each step of the build guide, then 5 minutes a servo. A plate you've sliced counts the slicer's time instead of the estimate. The two-wheel rover from the gallery comes to about 9 hours 40 minutes, almost all of it printing.

The check fails over the budget and warns above 90%. Fix sends the agent the longest plate, the build step with the most screws and the servo count. You can also tell the agent your deadline and it sets the hours. Without a time budget the check only shows the total.

The minutes for assembly and set-up are estimates, not measured on a real build.

Steps are in [Set a time budget for a build](/help/set-a-time-budget-for-a-build).
