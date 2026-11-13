---
title: Fit test plates
date: 2026-11-13
image: /changelog/fit-test-plates/fit-test-plate.png
---

Print Fit Test lays out one small plate of pieces cut around each servo pocket, insert hole, bearing seat and screw hole in your design. A pocket that's 0.2 mm tight shows up in a short print instead of after a 14-hour plate.

## Where it is

Open Print mode with ⌘P. Print Fit Test sits beside Done at the top of the Print panel, and it's in ⌘K as Print Fit Test. It shows up once the scene has a printed part and a servo, motor, heat insert, bearing or screw.

![Print mode with Print Fit Test beside Done](/changelog/fit-test-plates/print-mode.png)

## What gets cut

Basecase already knows every fit in the design, so it groups them by what goes in the hole. Heat inserts group by size and length, servo and motor pockets by model, bearing seats by bearing and screw holes by screw size. For one fit in each group, it takes the printed part holding it. It keeps only the bought part's box plus a 4 mm wall around it.

Four identical M3 inserts in a bracket give one piece, and a robot with twelve STS3215 servos gets one servo pocket. The cutting runs in a background worker, so the app stays responsive.

Each piece lies the way its part prints. The hole comes out with the same layers, overhangs and shrinkage as it will in the real part.

![The fit test plate with a servo pocket piece and an insert piece](/changelog/fit-test-plates/fit-test-plate.png)

## Printing it

The pieces go through the same plate layout, slicing and sending as any plate. Send Plate 1, Open in Bambu Studio and the slice toast all work as usual. The panel's title reads Print Fit Test while it's open. In the example above, the two pieces take about 46 minutes and 27 g of PLA.

## Leaving it

The fit test plate is temporary. Done or Esc goes back to your design's plates, and the pieces are never added to the scene, so there's nothing to clean up. Sending a fit test doesn't mark any of your design's parts as printed.

Steps are in [Print a fit test](/help/print-a-fit-test).
