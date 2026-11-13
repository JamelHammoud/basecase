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
  - turn-an-svg-into-a-part
covers:
  - src/components/LeftSidebar.tsx
  - src/components/LibraryPanel.tsx
  - src/components/library/NewModelMenu.tsx
  - src/components/library/Tile.tsx
  - src/components/library/menus.tsx
  - src/workspace/useLibraryActions.ts
  - src/workspace/libraryModels.ts
---

Keep a part or a group of parts in the Library, so you can drop it into any scene later.

1. Select the parts you want to keep.
2. Click **Library** in the view rail on the left.
3. Click **+** at the top right of the Library.
4. Choose **Save Selection**.

![The New Model menu open at the top right of the Library](/help/save-a-model-to-the-library/new-model-menu.png)

A single part is saved under its own name, and several parts under the scene's name. To keep every visible part in the scene instead, choose **Save Whole Scene**. You can also right-click a part and choose **Save to Library**.

## Use a saved model

1. Open the scene you want the model in.
2. Click **Library** in the view rail.
3. Click the model, or drag it onto the canvas where you want it.

Hover a model to see where it came from, its size and how many parts it has. Right-click it to rename, duplicate or delete it; deleting asks first.

![A model's details beside the Library](/help/save-a-model-to-the-library/model-details.png)

The same **+** menu has **Import SVG**, which [turns an SVG into a part](/help/turn-an-svg-into-a-part). **From Image** opens the Agent tab and asks for a picture, so the agent can model it in the desktop app.
