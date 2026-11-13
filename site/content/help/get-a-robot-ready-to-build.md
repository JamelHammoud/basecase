---
title: Get a robot ready to build
date: 2026-11-12
covers:
  - src/components/BuildPanel.tsx
  - src/components/build/ChecksSection.tsx
  - src/components/build/CheckItem.tsx
  - src/components/build/FindingRow.tsx
  - src/components/build/TetherFields.tsx
  - src/components/build/BuyList.tsx
  - src/components/build/BuyTotal.tsx
  - src/components/build/PlatesSection.tsx
  - src/components/print/PrintPanel.tsx
---

The Build tab tells you whether a design can be built, what to buy for it and how to print it.

1. Click Build at the top of the right panel.
2. Read Checks first. Its header says Ready to build, or how many problems are left to fix.
3. Click a check with a red or amber mark to see what's wrong and which parts it means. Click Fix to hand it to the agent; on Strength, Fix prints the part on its strongest face instead.
4. If the robot runs on a cable instead of a battery, open Servo voltage or Supply current and set the supply's volts (V) and amps (A).
5. Type your budget in the field beside the total under Bill of materials. The bar under it shows how much is left.
6. Click Lay Out Plates under Printing, or press ⌘P, to open Print mode.

![The Build tab with Checks first and a $150 budget beside the total](/help/get-a-robot-ready-to-build/build-tab.png)

In Print mode you choose the printer, quality, material and infill, move parts around the plate and send each plate to your printer. Printed parts lists every part with its plate and print time. To slice every plate at once, open ⌘K and choose Slice Plates; a toast shows the progress, with Stop.

![Print mode with the printer settings and Plate 1](/help/get-a-robot-ready-to-build/print-mode.png)
