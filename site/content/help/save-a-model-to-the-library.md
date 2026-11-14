---
title: Save a model to the Library
date: 2026-11-12
updated: 2026-11-14
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

You can save a part or a group of parts to the Library and then add it to any scene.

1. Select the parts you want to save.
2. Click **Library** in the view rail on the left.
3. Click **+** at the top right of the Library.
4. Choose **Save to Library**.

![The New Model menu open at the top right of the Library](/help/save-a-model-to-the-library/new-model-menu.png)

When you save one part, the model takes that part's name and its **Notes**. When you save several, it takes the name of the scene. To save every visible part in the scene, choose **Save Whole Scene** instead.

You can also right-click a part and choose **Save to Library**, or use [[⌘K]].

To bring in a file, choose **Import** from the **+** menu. An SVG file opens in Import SVG, where you click **Add** to [turn the drawing into a part](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part). Then save that part with **Save to Library** (the bookmark) in the part's Inspector header.

![The Import SVG panel with a drawing loaded and one Add button under Output](/help/save-a-model-to-the-library/import-svg.png)

## Use a saved model

1. Open the scene you want to add the model to.
2. Click **Library** in the view rail.
3. Click the model, or drag it onto the canvas where you want it. Basecase adds the model to the scene and selects it.

Hold the pointer over a model to see where it came from, its size, how many parts it has, and its notes.

![A model's details beside the Library](/help/save-a-model-to-the-library/model-details.png)

To find a model by name or notes, use **Search library**. Matching tries, if you have any, appear below the models. See [Search tries](/help/search-tries).

Right-click a model to rename, duplicate, or delete it. Basecase asks you to confirm before it deletes a model.
