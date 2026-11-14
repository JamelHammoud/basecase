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

Print small pieces of your design around each servo pocket, insert hole, bearing seat and screw hole, so you can check they fit before printing the whole thing.

1. Press [[⌘P]] to open Print mode.
2. Click Print Fit Test beside Done, or choose Print Fit Test in [[⌘K]]. It's there once the scene has a printed part and a servo, motor, heat insert, bearing or screw.
3. Check the plate. There's one piece for each kind of fit: four M3 inserts of the same size give one piece, and a second servo of the same model adds nothing. Each piece is the part around the fit with a 4 mm wall, lying the way its part prints.
4. Click Send Plate 1, or Open in Bambu Studio, as for any plate.
5. When it's printed, press the real servo, insert or bearing into each piece. If one is too tight or too loose, fix the hole in the design before the full print.
6. Click Done or press [[Esc]] to go back to the design's plates. The pieces aren't added to your scene.

The pieces carry no guide letters, so **Label parts** is hidden while the fit test plate is open.

![Print mode with Print Fit Test beside Done](/help/print-a-fit-test/print-mode.png)

![The fit test plate with a servo pocket piece and an insert piece](/help/print-a-fit-test/fit-test-plate.png)
