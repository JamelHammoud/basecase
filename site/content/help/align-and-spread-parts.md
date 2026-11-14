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

You can line up parts on their edges or centers, or space three or more parts evenly, without typing positions.

1. Select two or more parts on the canvas. Shift-click each part after the first to add it.
2. In the Inspector, find **Align**.
3. Click an icon in the **X**, **Y** or **Z** row. The parts line up on their shared bounds.
4. To space three or more parts evenly, click the icon at the end of a row, such as **Spread Along X**. The **Spread** icons appear once you select three parts.

![Align in the Inspector with three parts selected](/help/align-and-spread-parts/inspector.png)

The right-click menu has the same strip under **Align**. With parts selected, you can also run each command by name from [[⌘K]]: **Align Left**, **Align Top**, **Spread Along X** and the rest.

![The Align strip in a part's right-click menu](/help/align-and-spread-parts/menu.png)

**Center on Origin** is further down the same menu. It moves the selection's middle over the origin and keeps its height.

## What each row does

| Row | Icons | With one part, from the right-click menu |
|---|---|---|
| X | Left, Center, Right | Puts that side or the center on the origin |
| Y | Bottom, Middle, Top | Bottom puts the part on the floor |
| Z | Back, Center, Front | Puts that side or the center on the origin |

The bounds include each part's rotation, so rotated parts line up the way they look on the canvas.
