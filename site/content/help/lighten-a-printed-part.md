---
title: Lighten a printed part
date: 2026-11-14
collection: engineer
type: task
covers:
  - src/components/LightenSheet.tsx
  - src/workspace/lighten.ts
  - src/workspace/lightenLoads.ts
  - src/workspace/useLighten.ts
  - src/strength/lighten.ts
  - src/strength/lightenShape.ts
related:
  - check-printed-parts-are-strong-enough
  - checks-and-blockers
---

Remove material from a printed bracket using the loads and mounting points in your robot.

The part must be a visible, unlocked printed solid with a load path that Strength can measure.

Mounting regions and the wall setting can keep the result above your target mass.

1. On the canvas, right-click the printed part.
2. In the part menu, choose **Lighten**.
3. In **Target mass**, enter the percentage of the original mass to keep. The starting value is 50%.

   ![Lighten with Target mass set to 50% and Expert collapsed](/help/lighten-a-printed-part/lighten.png)

4. In **Expert**, set **Min. wall** if you need a different minimum wall thickness. The starting value is 1.5 mm.
   ![Expert with Min. wall set to 1.5 mm](/help/lighten-a-printed-part/expert.png)

5. Click **Lighten** to replace the part with the result.

   ![The lightened coxa bracket with its mounting holes retained](/help/lighten-a-printed-part/result.png)
6. In **Build**, review **Checks** for the changed part before printing it.

You can also select one part, press [[⌘K]] and choose **Lighten**.

If Lighten can’t produce a result, it keeps the original part and shows the reason in the dialog.

Press [[⌘Z]] to restore the original shape. Use [Check printed parts are strong enough](/help/check-printed-parts-are-strong-enough) to review the changed part's load margin.
