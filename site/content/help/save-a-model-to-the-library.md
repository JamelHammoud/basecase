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

Save a part or a group of parts to the Library so you can add it to any scene later.

1. Select the parts you want to keep.
2. Click **Library** in the view rail on the left.
3. Click **+** at the top right of the Library.
4. Choose **Save to Library**.

![The New Model menu open at the top right of the Library](/help/save-a-model-to-the-library/new-model-menu.png)

If you save a single part, the model takes that part's name and its **Notes**. If you save several parts, the model takes the scene's name. To save every visible part in the scene instead, choose **Save Whole Scene**.

You can also find **Save to Library** in a part's right-click menu and in [[⌘K]].

## Use a saved model

1. Open the scene you want the model in.
2. Click **Library** in the view rail.
3. Click the model, or drag it onto the canvas where you want it. The model appears in the scene already selected.

Hold your pointer over a model to see where it came from, its size, how many parts it has and its notes.

The search at the top of the Library finds models by name or notes. It also finds tries, as [Search tries](/help/search-tries) shows.

Right-click a model to rename, duplicate or delete it. Basecase asks before it deletes a model.

![A model's details beside the Library](/help/save-a-model-to-the-library/model-details.png)

The **+** menu also has **Import**, which brings in a file. An SVG opens in Import SVG, where you click **Add** to [turn it into a part](/help/draw-a-part-from-a-sketch-or-svg#turn-an-svg-into-a-part). To save an SVG part to the Library, click **Save to Library**, the bookmark in its Inspector header.

![The Import SVG panel with a drawing loaded and one Add button under Output](/help/save-a-model-to-the-library/import-svg.png)
