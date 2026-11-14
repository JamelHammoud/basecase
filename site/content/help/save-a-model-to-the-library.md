---
title: Save a model to the Library
date: 2026-11-12
updated: 2026-11-13
collection: files-and-sharing
type: task
order: 5
keywords:
  - reuse
  - component library
  - favorites
  - insert model
  - saved parts
related:
  - scenes-files-and-the-library
  - draw-a-part-from-a-sketch-or-svg
covers:
  - src/components/LeftSidebar.tsx
  - src/components/LibraryPanel.tsx
  - src/components/library/NewModelMenu.tsx
  - src/components/library/Tile.tsx
  - src/components/library/menus.tsx
  - src/components/studio/SvgImportPanel.tsx
  - src/workspace/useLibraryActions.ts
  - src/workspace/libraryModels.ts
  - src/utils/libraryParts.ts
  - src/components/library/details.tsx
---

Keep a part or a group of parts in the Library, so you can drop it into any scene later.

1. Select the parts you want to keep.
2. Click **Library** in the view rail on the left.
3. Click **+** at the top right of the Library.
4. Choose **Save Selection**.

![The New Model menu open at the top right of the Library](/help/save-a-model-to-the-library/new-model-menu.png)

A single part is saved under its own name, with its **Notes**, and several parts under the scene's name. To keep every visible part in the scene instead, choose **Save Whole Scene**. You can also right-click a part, or press [[⌘K]], and choose **Save to Library**.

## Use a saved model

1. Open the scene you want the model in.
2. Click **Library** in the view rail.
3. Click the model, or drag it onto the canvas where you want it. It lands selected.

Hover a model to see where it came from, its size, how many parts it has and its notes. **Search library** finds a model by its name or notes. Right-click it to rename, duplicate or delete it; deleting asks first.

![A model's details beside the Library](/help/save-a-model-to-the-library/model-details.png)

The same **+** menu has **Import**, which brings in a file. An SVG opens Import SVG, which [turns it into a part](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part) when you click **Add**. Keep an SVG part here with **Save to Library**, the bookmark in its Inspector header.

![The Import SVG panel with a drawing loaded and one Add button under Output](/help/save-a-model-to-the-library/import-svg.png)
