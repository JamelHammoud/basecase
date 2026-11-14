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

Draw an outline with typed lengths, or load an SVG file, and turn it into a solid part. The part can stand on the ground or on another part's face.

- Sketch an outline
- Change a sketched part
- Turn an SVG into a part

## Sketch an outline

1. To sketch on a part, click its face, such as the top of a box. To sketch on the ground, skip this step.
2. Click **Shapes** in the bottom toolbar, then choose **Sketch**. If you clicked a face, the sketch opens with the face's edges dashed.

![Sketch open on the top face of a box, the face's outline dashed](/help/draw-a-part-from-a-sketch-or-svg/face.png)

3. Under **Outline**, choose **Extrude** to push the outline up into a solid, or **Revolve** to spin it around the center axis.
4. Click **Rectangle**, then click where you want one corner to go.
5. Type the width, press [[Tab]], type the height, then press [[↩]].

![A rectangle being drawn with 40 and 20 typed in its fields](/help/draw-a-part-from-a-sketch-or-svg/typed.png)

6. Under **Output**, type a name. For an extrusion, set **T** to the thickness in millimeters.
7. Click **Add**. Basecase places the new part on the face at the size you typed and selects it.

![The 40 × 20 × 5 mm part on the box, with its size in the Inspector](/help/draw-a-part-from-a-sketch-or-svg/extruded.png)

More ways to draw:

- **Line** is picked when Sketch opens. Each click adds a corner, and clicking the first corner again closes the outline. As you draw a line, type its length, press [[Tab]], then type its angle.
- **Circle** takes its diameter. A circle inside the outline becomes a hole.
- A negative thickness cuts into the face. The part becomes a Cutout you can subtract.

While you draw, a point snaps onto an existing point and a line snaps level or upright. A small glyph by the pointer shows which snap applies, and the sketch keeps it as a constraint. Points also snap to the grid until you turn off **Snap to grid**.

Click **Save to Library**, the bookmark in the part's Inspector header, to keep a copy in the Library as well.

## Change a sketched part

Double-click a sketched part to reopen its sketch. Click a dimension, type the new value and press [[↩]], and the part re-extrudes in place. Press [[⌘Z]] to put it back.

![The reopened sketch with the width changed to 50, and the part grown on the box](/help/draw-a-part-from-a-sketch-or-svg/edited.png)

You can hold two lines parallel, perpendicular or equal. Click the active tool to put it down, click one line, Shift-click the other, then pick from the strip above the sketch. If an edit would conflict with the other constraints, Basecase refuses it and keeps the sketch's last shape.

**Path**, the third choice under **Outline**, fits a linkage to points you click and makes no solid. [Design a linkage from a path](/help/design-a-linkage-from-a-path) has the steps.

## Turn an SVG into a part

1. Click **Shapes** in the bottom toolbar, then choose **Import SVG**.
2. Click **Choose or drop an SVG**, then pick the file.
3. Check the preview, which counts the shapes and holes it found.
4. Under **Output**, type a name, the width (**W**) and the thickness (**T**).
5. Click **Add**.

Or drag the SVG onto **Choose or drop an SVG**, which turns blue while the file is over it.

The part starts 64 mm wide and 10 mm thick. You can set the width from 5 to 500 mm and the thickness from 1 to 250 mm. **Bevel** softens the edges and is on by default.

Click **Paste Code** to paste SVG code from a design app such as Figma or Illustrator. **Edit in Sketch**, beside the preview, opens the outline in Sketch so you can change it before you add it.

Click **Done** to leave either panel without adding a part. [[Esc]] leaves only while the panel is empty, so it can't throw away a drawing or a loaded SVG. In Sketch, the first press of [[Esc]] drops the tool you're drawing with.

You can also open Sketch from [[⌘K]] or the canvas's right-click menu. To open Import SVG with a file loaded, choose **Import** in [[⌘K]], the right-click menu, the **File** menu or the Library's **+** menu. Or drop the SVG on the canvas.
