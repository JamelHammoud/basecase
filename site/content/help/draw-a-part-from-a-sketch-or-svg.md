---
title: Draw a part from a sketch or SVG
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 6
keywords:
  - sketch
  - draw
  - outline
  - extrude
  - revolve
  - lathe
  - svg
  - vector
  - logo
  - 2d to 3d
  - profile
  - import svg
related:
  - save-a-model-to-the-library
  - cut-join-and-intersect-parts
covers:
  - src/components/studio/SketchPanel.tsx
  - src/components/studio/SketchCanvas.tsx
  - src/components/studio/SvgImportPanel.tsx
  - src/components/studio/OutputFields.tsx
  - src/components/studio/useStudioDraft.ts
  - src/components/SculptAndDrawStudio.tsx
  - src/utils/svgTo3DParser.ts
---

Turn an outline you draw, or an SVG file, into a solid part by extruding it to a thickness or spinning it around an axis.

## Sketch an outline

1. Click **Shapes** in the bottom toolbar and choose **Sketch**.
2. Under **Outline**, choose **Extrude** to push the outline up into a solid, or **Revolve** to spin it around the center axis.
3. Click **Clear**, then **Clear** again to confirm, to start from an empty sketch.
4. Click on the grid to add each corner.
5. To cut a hole in an extruded outline, choose **Hole** and click inside the shape.
6. Under **Output**, type a name, the width (**W**) and the thickness (**T**), in millimeters.
7. Click **Add**, or **Add & Save** to keep a copy in the Library too.

The panel closes and the new part is selected. To draw freehand instead of by corners, choose **Freehand** above the grid and drag.

Points snap to the grid until you turn off **Snap to grid**, and **Remove last point** takes back one corner.

For **Revolve**, **W** is the diameter and **T** is the height. Width runs from 5 to 500 mm and thickness from 1 to 250 mm. **Bevel**, on by default for extrusions, softens the edges.

## Turn an SVG into a part

1. Click **Shapes** in the bottom toolbar and choose **Import SVG**.
2. Click **Choose or drop an SVG** and pick the file.
3. Check the preview, which counts the shapes and holes it found.
4. Under **Output**, type a name, the width (**W**) and the thickness (**T**).
5. Click **Add**, or **Add & Save**.

To paste SVG code instead of choosing a file, click **Paste code**. **Edit in Sketch**, beside the preview, opens the outline in Sketch so you can change it before adding it.

Sketch is also in [[⌘K]] and the canvas's right-click menu. Import SVG is in both of those, in **File** ▸ **Import SVG**, and in the Library's **+** menu.
