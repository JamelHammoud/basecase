---
title: Compare clearances on a fit test plate
date: 2026-11-18
collection: build-and-print
type: task
covers:
  - src/components/print/FitVariants.tsx
  - src/workspace/useFitVariants.ts
  - src/workspace/fitVariantJob.ts
  - src/print/fitVariants.ts
  - src/print/fitPlateWriter.ts
  - src/print/fitVariantIdentity.ts
---

Print several values of a bound dimension on one plate, then apply your choice to the editable design.

The dimension must have a direct binding to a numeric millimeter parameter. See [Link dimensions with shared parameters](/help/link-dimensions-with-shared-parameters) to create that binding. You can't select calculated expressions, angular dimensions or catalog dimensions.

1. Press [[⌘P]] to open Print mode.
2. Click **Print Fit Test**.
3. In **Variants**, choose the interface's authored **Dimension**.
4. In **Mating part**, choose the part that fits into that interface.
5. In **Values (mm)**, enter comma-separated values, such as `21.9, 22, 22.1` for a bearing seat's bore diameter.

![The bearing seat's bound bore dimension and three values](/help/print-a-fit-test/values.png)

6. Click **Prepare Variants**.
7. In **Export**, choose **3MF Plates** to save the comparison plate.

![Three bearing-seat coupons with 22.1 mm selected](/help/print-a-fit-test/comparison.png)

8. In **Variants**, click the prepared value you want to use.
9. Click **Apply 22.1 mm** for the example value.

![The editable bore parameter after applying 22.1 mm](/help/print-a-fit-test/choice.png)

You can enter 2 to 8 distinct values greater than zero and up to 1000 mm. You can review the saved reasons for failed candidates. If you change the source, prepare a new set of variants before applying one.

You record a design choice when you choose a value. This choice isn't a physical measurement, material compensation or calibration result. Press [[⌘Z]] to undo the dimension change.
