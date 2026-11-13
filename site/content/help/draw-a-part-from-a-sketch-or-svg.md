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
  - illustrator
  - figma
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
  - src/components/ViewportToolbar.tsx
---

Turn an outline you draw, or an SVG file, into a solid part by extruding it to a thickness or spinning it around an axis.

## Sketch an outline

1. Click **Shapes** in the bottom toolbar and choose **Sketch**.
2. Under **Outline**, choose **Extrude** to push the outline up into a solid, or **Revolve** to spin it around the center axis.
3. With **Line** picked, click on the grid for each corner, then click the first corner again to close the outline.
4. Under **Output**, type a name and, for an extrusion, the thickness (**T**) in millimeters.
5. Click **Add**. To keep a copy in the Library too, click **Save to Library**, the bookmark in the part's Inspector header.

The panel closes and the new part is selected. **Rectangle**, **Circle** and **Arc**, beside **Line**, draw those shapes instead.

Points snap to the grid until you turn off **Snap to grid**. To type exact lengths, see [Sketch a part to exact dimensions](/help/sketch-a-part-to-exact-dimensions).

## Turn an SVG into a part

1. Click **Shapes** in the bottom toolbar and choose **Import SVG**.
2. Click **Choose or drop an SVG** and pick the file.
3. Check the preview, which counts the shapes and holes it found.
4. Under **Output**, type a name, the width (**W**) and the thickness (**T**).
5. Click **Add**.

The part starts 64 mm wide and 10 mm thick. Width runs from 5 to 500 mm and thickness from 1 to 250 mm. **Bevel**, on by default, softens the edges.

To paste SVG code from a design app such as Figma or Illustrator, click **Paste Code**. **Edit in Sketch**, beside the preview, opens the outline in Sketch so you can change it before adding it.

Sketch is also in [[⌘K]] and the canvas's right-click menu. To open Import SVG with a file already loaded, choose **Import** there, in **File** or in the Library's **+** menu, or drop the SVG on the canvas.
