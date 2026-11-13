---
title: Get a robot ready to build
date: 2026-11-12
covers:
  - src/components/BuildPanel.tsx
  - src/components/build/ChecksSection.tsx
  - src/components/build/CheckItem.tsx
  - src/components/build/CaseCheckItem.tsx
  - src/workspace/caseChecks.ts
  - src/components/build/TetherFields.tsx
  - src/components/build/BuyList.tsx
  - src/components/build/BuyTotal.tsx
  - src/components/build/PlatesSection.tsx
  - src/components/print/PrintPanel.tsx
---

The Build tab tells you whether a design can be built, what to buy for it and how to print it.

1. Click Build at the top of the right panel.
2. Read Checks first. Its header says Ready to build, or how many problems are left to fix.
3. Click a check with a red or amber mark to see what's wrong and which parts it means. Click Fix to hand it to the agent.
4. If the robot runs on a cable instead of a battery, open Servo voltage or Supply current and set the supply's volts (V) and amps (A).
5. If the scene has Cases, find each one in Checks under its own name, with how many of 20 runs it passed. Click it to open the Case in Simulate.
6. Type your budget in the field beside the total under Bill of materials. The bar under it shows how much is left.
7. Click Lay Out Plates under Printing, or press ⌘P, to open Print mode.

![The Build tab with Checks first and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

Each Case runs 20 times, with friction, weight, servo strength and servo delay changed a little every time, and a box or anything else that moves starting up to 15 mm from where it was placed. A Case is green at 18 of 20 or better, amber from 10 to 17 and red below 10, with its most common failure under it, such as Fell or Missed. A robot that can't enter a Case gets a red row that says why. Cases never count toward Ready to build, and you can ignore one from its ⋯ menu like any other note. They run again only when the robot or the Case changes.

![Checks with Reach the Flag and Follow a Path past a Block, each passing 20 of 20](/help/get-a-robot-ready-to-build/cases-in-checks.png)

![Checks with Reach the Flag at 0 of 20 and Missed under it, on a rover with weak wheel motors](/help/get-a-robot-ready-to-build/case-row-failing.png)

![Reach the Flag open in Simulate after clicking its row](/help/get-a-robot-ready-to-build/case-in-simulate.png)

In Print mode you choose the printer, quality, material and infill, move parts around the plate and send each plate to your printer. Printed parts lists every part with its plate and print time. To slice every plate at once, open ⌘K and choose Slice Plates; a toast shows the progress, with Stop.

![Print mode with the printer settings and Plate 1](/help/get-a-robot-ready-to-build/print-mode.png)
