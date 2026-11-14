---
title: Print a fit test
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
covers:
  - src/print/fitTest.ts
  - src/three/analysis/fitCoupons.ts
  - src/workspace/useFitTest.ts
  - src/workspace/usePrinting.ts
  - src/components/print/PrintPanel.tsx
  - src/workspace/printCommands.tsx
---

A fit test prints small pieces of your design around each servo pocket, insert hole, bearing seat and screw hole. Use it to check those fits before you print the whole design.

1. Press [[⌘P]] to open Print mode.
2. Click Print Fit Test beside Done, or choose Print Fit Test in [[⌘K]]. Print Fit Test appears once your scene has a printed part and a servo, motor, heat insert, bearing or screw.
3. Check the plate. It has one piece for each kind of fit. For example, four M3 inserts of the same size make one piece, and a second servo of the same model doesn't add another piece. Each piece is the part around the fit with a 4 mm wall, lying the same way its part prints.
4. Click Send Plate 1 or Open in Bambu Studio, as you would for any plate.
5. When the plate finishes printing, press the real servo, insert or bearing into each piece. If a piece is too tight or too loose, fix that hole in your design before you print the full design.
6. To go back to the design's plates, click Done or press [[Esc]]. Fit test pieces don't get added to your scene.

**Note:** The fit test pieces have no guide letters, so **Label parts** is hidden while the fit test plate is open.

![Print mode with Print Fit Test beside Done](/help/print-a-fit-test/print-mode.png)

![The fit test plate with a servo pocket piece and an insert piece](/help/print-a-fit-test/fit-test-plate.png)
