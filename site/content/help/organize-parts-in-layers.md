---
title: Find, hide and lock parts in Layers
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 11
keywords:
  - layers
  - outliner
  - tree
  - parts list
  - hide
  - show
  - lock
  - unlock
  - rename
  - visibility
  - overall size
related:
  - group-parts
  - add-objects-to-the-scene
covers:
  - src/components/layers/
  - src/workspace/contextMenuItems.tsx
  - src/workspace/partActions.tsx
  - src/three/viewport/picking.ts
  - src/readiness/buildChecks.ts
---

See every part in the scene as a list, find one by name, and hide or lock parts so they stay out of your way.

1. Click **Layers** in the view rail on the left.
2. Type part of a name in **Search layers** to filter the list.
3. Click a row to select that part on the canvas.
4. Hover the row and click the eye to hide the part.

The lock beside the eye locks the part instead.

The header counts parts and cutouts, and the footer gives the **Overall size** of the visible parts. Double-click a row to rename the part. **Rename** in the part's right-click menu or [[⌘K]] opens Layers with that row's name ready to type. Shift-click or [[⌘]]-click a row to add or remove that one part. Right-click a row for the same menu as the part on the canvas.

![The right-click menu of Servo Bracket in Layers, with Rename first](/help/organize-parts-in-layers/part-menu.png)

![The Servo Bracket row in Layers with its name field open, renamed Shoulder Bracket](/help/organize-parts-in-layers/rename.png)

## What hiding and locking do

- **Hide** takes the part off the canvas. Checks leave hidden parts out of clash, fit and assembly checks and say how many they skipped.
- **Lock** keeps the part from being clicked or dragged on the canvas, so you can work on what's behind it. [[⌘]]-click still selects a locked part, and so does its row.

The eye or lock stays on the row while the part is hidden or locked. **Hide** and **Lock** are also in the part's right-click menu and [[⌘K]], as **Show** and **Unlock** once they're on.

An empty scene leaves Layers empty. To bring robots, objects and saved models in, use **Parts** and **Library** in the same view rail.
