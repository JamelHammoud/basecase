---
title: Sketch a part to exact dimensions
date: 2026-11-13
collection: design
type: task
covers:
  - src/components/studio/SketchPanel.tsx
  - src/components/studio/SketchCanvas.tsx
  - src/components/studio/useSketchDrawing.ts
  - src/components/studio/useSketchSelection.ts
  - src/components/studio/useSketchKeys.ts
  - src/utils/sketch/solver.ts
  - src/utils/sketch/face.ts
  - src/utils/sketch/placement.ts
  - src/workspace/useSketchSession.ts
---

Draw a profile with typed lengths on a part's face, push it into a solid of an exact size, and change it later.

1. Click the face of a part you want to sketch on, such as the top of a box. Skip this to sketch on the ground.
2. Press ⌘K and choose **Sketch**, or choose Sketch from Shapes ▾ or the right-click menu. The sketch opens on that face, with its edges dashed.

![Sketch open on the top face of a box, the face's outline dashed](/help/sketch-a-part-to-exact-dimensions/face.png)

3. Click **Rectangle**, then click where one corner goes.
4. Type the width, press Tab, type the height, and press Enter. A line takes its length, then Tab for its angle; a circle takes its diameter.

![A rectangle being drawn with 40 and 20 typed in its fields](/help/sketch-a-part-to-exact-dimensions/typed.png)

5. Set **T** to the thickness in millimeters. A negative thickness cuts into the face instead, as a Cutout you can subtract.
6. Click **Add**. The new part stands on the face at exactly the size you typed.

![The 40 × 20 × 5 mm part on the box, with its size in the Inspector](/help/sketch-a-part-to-exact-dimensions/extruded.png)

To change it, double-click the part. Click a dimension, type the new value and press Enter: the part re-extrudes in place, and ⌘Z puts it back.

![The reopened sketch with the width changed to 50, and the part grown on the box](/help/sketch-a-part-to-exact-dimensions/edited.png)

While drawing, a point snaps onto an existing point, and a line snaps level or upright; a small glyph by the pointer shows which, and the sketch keeps it as a constraint. To hold two lines parallel, perpendicular or equal, click the active tool to put it down, click one line, ⇧-click the other and pick from the strip above the sketch. An edit that would conflict with the others is refused, and the sketch keeps its last shape.

To draw the path a leg or finger should trace instead, choose **Path** under **Outline**. The steps are in [Design a linkage from a path](/help/design-a-linkage-from-a-path).
