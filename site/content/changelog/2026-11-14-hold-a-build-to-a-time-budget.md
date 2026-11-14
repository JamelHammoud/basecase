---
title: Hold a build to a time budget
date: 2026-11-14
image: /changelog/hold-a-build-to-a-time-budget/cover.png
---

You can now give a robot the hours you have, next to its money budget. A Time check adds up printing, assembly and servo set-up and tells you whether they fit.

You might want your first robot tonight or this weekend. Slicers give you a print time for each plate once you slice it, but until now you added the build and servo set-up on top yourself and checked the total against your deadline.

## How It Adds Up

Set the hours next to the budget in the bill of materials, in the Build tab.

The Time check starts with each plate's print time, spread across the printers you've added. For each step of the build guide, it adds 2 minutes a part, 45 seconds a screw and 90 seconds a heat insert. It also counts 5 minutes for each servo. Once you slice a plate, the check uses the slicer's time in place of its estimate.

The two-wheel rover from the gallery comes to about 9 hours, almost all of it printing.

## Over Budget

The check fails when the total goes over your budget and warns above 90%. Fix sends the agent the longest plate, the build step with the most screws and the servo count.

Or tell the agent your deadline, and it sets the hours. Without a time budget, the check only shows the total.

We estimated the minutes for assembly and set-up and haven't timed them on a real build.

Read [Set a time budget for a build](/help/set-a-time-budget-for-a-build) in the help center for the steps.
