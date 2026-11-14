---
title: Align and spread parts
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 3
keywords:
  - align
  - distribute
  - spread evenly
  - line up
  - center
  - origin
  - floor
  - spacing
related:
  - move-and-rotate-parts
  - group-parts
covers:
  - src/components/AlignBar.tsx
  - src/components/inspector/MultiInspector.tsx
  - src/components/alignActions.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/editCommands.tsx
  - src/utils/selection.ts
---

Line parts up on their edges or centers, or space three or more evenly, without typing a single position.

1. Select two or more parts on the canvas. Shift-click adds each one after the first.
2. In the Inspector, find **Align**.
3. Click an icon in the **X**, **Y** or **Z** row to line the parts up on their shared bounds.
4. To space three or more parts evenly, click the **Spread** icon at the end of a row.

![Align in the Inspector with three parts selected](/help/align-and-spread-parts/inspector.png)

The same strip is under **Align** in the right-click menu. While parts are selected, [[⌘K]] has each one by name: **Align Left**, **Align Top**, **Spread Along X** and the rest.

![The Align strip in a part's right-click menu](/help/align-and-spread-parts/menu.png)

**Center on Origin**, a little lower in the menu, moves the selection so its middle sits over the origin at the same height.

## What each row does

| Row | Icons | With one part, from the right-click menu |
|---|---|---|
| X | Left, Center, Right | Puts that side or the center on the origin |
| Y | Bottom, Middle, Top | Bottom puts the part on the floor |
| Z | Back, Center, Front | Puts that side or the center on the origin |

The bounds count each part's rotation, so turned parts line up by what you see. **Spread** shows once three parts are selected.
