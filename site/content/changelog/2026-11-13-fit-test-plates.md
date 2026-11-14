---
title: Fit test plates
date: 2026-11-13
image: /changelog/fit-test-plates/fit-test-plate.png
---

You can now print a small plate that tests the fits in your design.

Print Fit Test lays out one plate of pieces cut around each servo pocket, insert hole, bearing seat and screw hole in your design. If a pocket is 0.2 mm tight, you find out from a short print instead of after a 14-hour plate.

## Where it is

Press ⌘P to open Print mode. Print Fit Test sits beside Done at the top of the Print panel, and it's in ⌘K under the same name.

The button shows up once your scene has a printed part and a servo, motor, heat insert, bearing or screw.

![Print mode with Print Fit Test beside Done](/changelog/fit-test-plates/print-mode.png)

## What gets cut

Basecase knows each fit in your design and groups them by what goes in the hole: heat inserts by size and length, servo and motor pockets by model, bearing seats by bearing, and screw holes by screw size.

From each group it takes one fit, finds the printed part that holds it, and keeps only the bought part's box plus a 4 mm wall around it. A bracket with four identical M3 inserts gives you one piece, and a robot with twelve STS3215 servos gives you one servo pocket.

The cutting runs in a background worker, so the app stays responsive.

Each piece sits on the plate the way its part prints, so the hole has the same layers, overhangs and shrinkage as the real part.

![The fit test plate with a servo pocket piece and an insert piece](/changelog/fit-test-plates/fit-test-plate.png)

## Printing it

Lay out, slice and send the fit test like any other plate. Send Plate 1, Open in Bambu Studio and the slice toast work as usual. While it's open, the panel's title reads Print Fit Test.

The two pieces pictured above take about 46 minutes and 27 g of PLA.

## Leaving it

Press Done or Esc to leave the fit test plate, which is temporary, and go back to your design's plates. The pieces never go into the scene, so there's nothing to clean up.

Sending a fit test doesn't mark any of your design's parts as printed.

Read [Print a fit test](/help/print-a-fit-test) in the help center for the steps.
