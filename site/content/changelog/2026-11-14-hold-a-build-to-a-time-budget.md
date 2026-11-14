---
title: Hold a build to a time budget
date: 2026-11-14
image: /changelog/hold-a-build-to-a-time-budget/cover.png
---

You can now give a robot a budget in hours, next to its money budget. A Time check adds up printing, assembly and servo set-up and tells you whether it all fits.

You might want your first robot tonight, or this weekend. A slicer gives you each plate's print time once you slice it, but until now you had to add the build and servo set-up yourself and check the total against your deadline.

## How It Adds Up

The hours field is next to the budget in the bill of materials in the Build tab.

The Time check starts with each plate's print time, spread across the printers you've added. Then it walks through the build guide step by step, adding 2 minutes for each part, 45 seconds for each screw and 90 seconds for each heat insert. Each servo adds 5 minutes. Once you slice a plate, the check uses the slicer's time instead of its own estimate.

The two-wheel rover from the gallery comes to about 9 hours, almost all of it printing.

## Over Budget

The check warns when the total passes 90% of your budget and fails when it goes over. Without a time budget, it only shows the total.

Fix sends the agent the longest plate, the build step with the most screws and the servo count. You can also tell the agent your deadline, and it sets the hours for you.

The assembly and set-up minutes are our own estimates. We haven't timed them on a real build.

Read [Set a time budget for a build](/help/set-a-time-budget-for-a-build) in the help center for the steps.
