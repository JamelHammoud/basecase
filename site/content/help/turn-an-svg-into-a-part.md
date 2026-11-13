---
title: Turn an SVG drawing into a part
date: 2026-11-13
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 6
keywords:
  - import svg
  - extrude
  - logo
  - vector
  - illustrator
  - figma
  - 2d to 3d
related:
  - import-a-mesh
  - save-a-model-to-the-library
covers:
  - src/components/SculptAndDrawStudio.tsx
  - src/components/studio/SvgImportPanel.tsx
  - src/components/studio/OutputFields.tsx
  - src/components/studio/useStudioDraft.ts
  - src/components/ViewportToolbar.tsx
---

Extrude a logo, a bracket outline or any SVG drawing into a solid part, at the width and thickness you choose.

1. In the toolbar at the bottom of the canvas, click **Shapes**, then choose **Import SVG**.
2. In the right panel, click **Choose or drop an SVG** and pick the file.
3. Check the preview, which counts the drawing's shapes and holes.
4. In **W**, type the part's width in millimeters, from 5 to 500.
5. In **T**, type its thickness in millimeters, from 1 to 250.
6. Pick a color, and turn off **Bevel** if you want sharp edges.
7. Click **Add**, or **Add & Save** to keep a copy in the Library too.
8. Click **Done** to close the panel.

The part starts 64 mm wide and 10 mm thick until you change them. To fix the outline first, click **Edit in Sketch**. To paste SVG code from a design app instead of a file, click **Paste code**.

Import SVG is also in the **File** menu, the Library's **+** menu and ⌘K. Dropping an SVG on the canvas adds it as a flat reference image, not a part.

For 3D files such as STL or OBJ, see [Import a mesh](/help/import-a-mesh).
