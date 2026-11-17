---
title: Keep a sketch on a face
date: 2026-11-16
collection: design
type: task
order: 7
keywords:
  - sketch support
  - attached sketch
  - mounting plate
  - battery pocket
  - reference edge
related:
  - draw-a-part-from-a-sketch-or-svg
  - checks-and-blockers
covers:
  - src/utils/sketch/support.ts
  - src/utils/sketch/supportRegeneration.ts
  - src/workspace/useSketchSession.ts
  - src/workspace/useSketchSupportSelection.ts
  - src/workspace/useSketchSupportResults.ts
  - src/components/studio/SketchSupportButton.tsx
  - src/readiness/sketchSupports.ts
hub_checks_and_blockers: |
  **Sketch** keeps a blocker while a supporting face is missing, ambiguous or outside the supported shape, or its constraints can’t solve. The previous solid stays visible. [Keep a sketch on a face](/help/keep-a-sketch-on-a-face) shows how to replace the support.
---

Keep a mounting feature attached while you resize or move its supporting part.

You can attach a sketch to a single rectangular planar face of a box, generated CAD part or sketch solid. The face must have no holes and line up with the part's local axes. Rotating the whole part keeps the attachment.

You can’t use curved, split or competing parallel faces, sculpted supports or sheet-transformed parts as supports. Ground sketches and older sketches without a saved support stay independent.

## Attach the feature

1. On the canvas, click the face that will support the feature.
2. In [[⌘K]], choose **Sketch**.
3. Under **Outline**, click **Rectangle**.
4. On the sketch plane, click the first corner and move toward the opposite corner.
5. Type the width, press [[Tab]], type the height, then press [[↩]].
6. Under **Output**, set **T** to the thickness in millimeters.
7. Click **Add**.

![A dimensioned mounting feature on the generated rover deck](/help/keep-a-sketch-on-a-face/mount.png)

## Edit the supporting part

1. On the canvas, click the supporting part.
2. Under **Size**, change **H** to resize its thickness.
3. Under **Position**, change **X** to move it.

![The mounting feature follows the thicker rover deck after it moves](/help/keep-a-sketch-on-a-face/changed.png)

## Set an edge offset

Before adding the feature:

1. Under **Outline**, click **Rectangle** to put the tool down.
2. On the sketch plane, click a corner.
3. On the sketch plane, hold [[⇧]] and click a dashed reference edge.
4. In the constraint strip, click **Distance**.
5. On the sketch plane, click the new dimension.
6. In the dimension field, enter the offset in millimeters and press [[↩]].
7. Under **Output**, click **Add**.

Coordinates stay in millimeters relative to the face's center. If you constrain a sketch to a dashed reference edge, you keep that constraint as the outline changes. You can undo or redo changes to the source and its regenerated features as a group. You keep these references when you export and reopen the scene.

## Replace a support

If a support disappears or can’t resolve, the last solid stays visible and **Checks** retains a blocker.

1. In **Checks**, expand **Sketch** to read the cause.

![Checks identifies the mounting feature whose supporting part was removed](/help/keep-a-sketch-on-a-face/missing.png)

2. On the canvas, double-click the feature.
3. In **Sketch**, click **Select Face**.

![The reopened feature offers Select Face](/help/keep-a-sketch-on-a-face/select-face.png)

4. On the canvas, click the replacement face.

![The feature follows its explicitly chosen replacement deck](/help/keep-a-sketch-on-a-face/resolved.png)

Press [[Esc]] to cancel face selection. Duplicating a support and its feature keeps their relationship within the copy. Copying the feature alone or using **Mirror** makes an independent sketch at its copied position.
