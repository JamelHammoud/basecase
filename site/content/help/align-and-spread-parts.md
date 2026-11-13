---
title: Align and spread parts
date: 2026-11-12
covers:
  - src/components/AlignBar.tsx
  - src/workspace/contextMenuItems.tsx
  - src/workspace/editCommands.tsx
---

Line parts up against each other, or put one part's edge on the origin, without typing positions.

1. Select the parts in Layers or on the canvas. Shift-click adds one more.
2. Right-click the selection and point at Align ▸, or look at Align in the Inspector when two or more parts are selected.
3. Click an icon in the X, Y or Z row. Left, center and right line the parts up on their shared bounds. With one part selected, the part's edge goes to the origin instead, and Bottom puts it on the floor.
4. To space three or more parts evenly, click the Spread icon at the end of the row.

![The Align strip in a part's right-click menu](/help/align-and-spread-parts/menu.png)

![Align in the Inspector with three parts selected](/help/align-and-spread-parts/inspector.png)

Every action is also in ⌘K: type Align or Spread.
