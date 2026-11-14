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

You can save a part or a group of parts to the Library, then add it to any scene when you need it.

1. Select the parts you want to save.
2. Click **Library** in the view rail on the left.
3. Click **+** at the top right of the Library.
4. Choose **Save to Library**.

![The New Model menu open at the top right of the Library](/help/save-a-model-to-the-library/new-model-menu.png)

The saved model's name depends on what you save:

- If you save one part, the model gets the part's name and its **Notes**.
- If you save several parts, the model gets the scene's name.

To save every visible part in the scene, choose **Save Whole Scene** instead. You can also find **Save to Library** in a part's right-click menu and in [[⌘K]].

## Use a saved model

1. Open the scene where you want the model.
2. Click **Library** in the view rail.
3. Click the model, or drag it onto the canvas where you want it. Basecase adds the model to the scene and selects it.

Hold your pointer over a model to see where it came from, its size, how many parts it has, and its notes.

![A model's details beside the Library](/help/save-a-model-to-the-library/model-details.png)

Use the search at the top of the Library to find a model by its name or notes. The search also finds tries (see [Search tries](/help/search-tries)).

To rename, duplicate, or delete a model, right-click it. Basecase asks you to confirm before it deletes a model.

To bring in a file, click **+** and choose **Import**. An SVG file opens in Import SVG, where you click **Add** to [turn it into a part](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part). Then click the bookmark (**Save to Library**) in the part's Inspector header to save the new part to the Library.

![The Import SVG panel with a drawing loaded and one Add button under Output](/help/save-a-model-to-the-library/import-svg.png)
