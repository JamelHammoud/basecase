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
  - dimension
  - exact size
  - typed lengths
  - constraint
  - sketch on a face
  - svg
  - vector
  - logo
  - 2d to 3d
  - profile
  - import svg
  - illustrator
  - figma
related:
  - save-a-model-to-the-library
  - cut-join-and-intersect-parts
covers:
  - src/components/studio/SketchPanel.tsx
  - src/components/studio/SketchCanvas.tsx
  - src/components/studio/useSketchDrawing.ts
  - src/components/studio/useSketchSelection.ts
  - src/components/studio/useSketchKeys.ts
  - src/components/studio/SvgImportPanel.tsx
  - src/components/studio/OutputFields.tsx
  - src/components/studio/useStudioDraft.ts
  - src/components/SculptAndDrawStudio.tsx
  - src/components/ViewportToolbar.tsx
  - src/utils/sketch/solver.ts
  - src/utils/sketch/face.ts
  - src/utils/sketch/placement.ts
  - src/utils/svgTo3DParser.ts
  - src/workspace/useSketchSession.ts
---

Turn an outline you draw with typed lengths, or an SVG file, into a solid part on the ground or on a part's face.

## Sketch an outline

1. To sketch on a part, click its face, such as the top of a box. Skip this to sketch on the ground.
2. Click **Shapes** in the bottom toolbar and choose **Sketch**. On a face, the sketch opens with the face's edges dashed.

![Sketch open on the top face of a box, the face's outline dashed](/help/draw-a-part-from-a-sketch-or-svg/face.png)

3. Under **Outline**, choose **Extrude** to push the outline up into a solid, or **Revolve** to spin it around the center axis.
4. Click **Rectangle**, then click where one corner goes.
5. Type the width, press [[Tab]], type the height, and press [[↩]].

![A rectangle being drawn with 40 and 20 typed in its fields](/help/draw-a-part-from-a-sketch-or-svg/typed.png)

6. Under **Output**, type a name and, for an extrusion, set **T** to the thickness in millimeters.
7. Click **Add**. The new part stands on the face at exactly the size you typed, selected.

![The 40 × 20 × 5 mm part on the box, with its size in the Inspector](/help/draw-a-part-from-a-sketch-or-svg/extruded.png)

**Line**, picked when Sketch opens, adds a corner at each click; click the first corner again to close the outline. A line takes its length as you type, then [[Tab]] for its angle. **Circle** takes its diameter, and a circle inside the outline becomes a hole. A negative thickness cuts into the face instead, as a Cutout you can subtract.

While drawing, a point snaps onto an existing point, and a line snaps level or upright. A small glyph by the pointer shows which, and the sketch keeps it as a constraint. Points also snap to the grid until you turn off **Snap to grid**.

To keep a copy in the Library too, click **Save to Library**, the bookmark in the part's Inspector header.

## Change a sketched part

Double-click the part to reopen its sketch. Click a dimension, type the new value and press [[↩]]. The part re-extrudes in place, and [[⌘Z]] puts it back.

![The reopened sketch with the width changed to 50, and the part grown on the box](/help/draw-a-part-from-a-sketch-or-svg/edited.png)

To hold two lines parallel, perpendicular or equal, click the active tool to put it down. Click one line, Shift-click the other and pick from the strip above the sketch. An edit that would conflict with the others is refused, and the sketch keeps its last shape.

**Path**, the third choice under **Outline**, fits a linkage to points you click instead of making a solid. [Design a linkage from a path](/help/design-a-linkage-from-a-path) has the steps.

## Turn an SVG into a part

1. Click **Shapes** in the bottom toolbar and choose **Import SVG**.
2. Click **Choose or drop an SVG** and pick the file.
3. Check the preview, which counts the shapes and holes it found.
4. Under **Output**, type a name, the width (**W**) and the thickness (**T**).
5. Click **Add**.

The part starts 64 mm wide and 10 mm thick. Width runs from 5 to 500 mm and thickness from 1 to 250 mm. **Bevel**, on by default, softens the edges.

To paste SVG code from a design app such as Figma or Illustrator, click **Paste Code**. **Edit in Sketch**, beside the preview, opens the outline in Sketch so you can change it before adding it.

To leave either panel without adding a part, click **Done**. [[Esc]] leaves only while the panel is empty, so it never throws away a drawing or a loaded SVG. In Sketch, the first [[Esc]] drops the tool you're drawing with.

Sketch is also in [[⌘K]] and the canvas's right-click menu. To open Import SVG with a file already loaded, choose **Import** there, in **File** or in the Library's **+** menu, or drop the SVG on the canvas.
