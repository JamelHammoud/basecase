---
title: Hold a robot to a time budget
date: 2026-11-13
image: /changelog/hold-a-robot-to-a-time-budget/cover.png
---

You can now give a robot the hours you have, and a Time check says whether printing, assembly and servo set-up fit.

The field sits beside the money budget in the Build tab. Say you want your first robot built this weekend. Until now, no check told you whether its printing, assembly and set-up fit before Sunday night.

Time adds three numbers. Print is each plate's estimate, or its slicer time once sliced, split across your printers. Assembly is 2 minutes per part, 1 per screw, nut or washer and 1.5 per heat insert. Each moving joint adds 5 minutes to set up and calibrate its servo. The two-wheel rover comes to about 9 h 41 min on one printer.

The check fails over the budget and warns above 90%. Fix hands the agent the longest plate, the step with the most fasteners and the servo count. It can merge parts, lower infill while Strength passes, or swap a printed part for a catalog part.

Assembly and set-up minutes are fixed estimates, not measured on your bench. The check runs with Checks in the Build tab, not in the agent's `verify_design`.

Steps are in [Set a time budget for a robot](/help/set-a-time-budget).
