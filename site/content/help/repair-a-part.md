---
title: Repair a part
date: 2026-11-14
collection: build-and-print
type: task
covers:
  - src/workspace/useRepair.ts
  - src/guide/repairPlan.ts
  - src/assembly/minimumTeardown.ts
  - src/print/repairPlate.ts
  - src/workspace/usePrintMode.ts
---

Reach a broken part, replace it, and put the robot back together with a repair walkthrough from your design.

1. On the broken part, right-click.
2. In its menu, choose **Repair**.

![The Wrist bracket menu with Repair](/help/repair-a-part/menu.png)

3. Follow the removal arrows, pressing [[→]] after each step.

![Build Along showing the bracket removal and the parts to keep in place](/help/repair-a-part/removal.png)

4. At the replacement step, check the part named below the bar.

![The bracket callout with Print in the Build Along bar](/help/repair-a-part/swap.png)

5. For a printed part, in the bar, click **Print**.
6. In Print mode, print the one-part plate with your [usual printing steps](/help/print-a-robots-parts).

![Print mode holding only the replacement Wrist bracket](/help/repair-a-part/plate.png)

7. In Print mode, click **Done**.
8. In Build Along, press [[→]] to follow the reassembly steps.

![Build Along showing the bracket being reassembled](/help/repair-a-part/reassembly.png)

9. When the robot is back together, click **Done**.

With one part selected, you can also press [[⌘K]] and choose **Repair**.

For a bought part, replace the item named in the callout and continue with reassembly. There is no print plate for it.

Repair needs a measured teardown and proven reassembly order. If it can’t find them, it names the part and directs you to Checks in Build.
