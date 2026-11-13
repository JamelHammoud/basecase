---
title: Group parts
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 5
keywords:
  - group
  - ungroup
  - assembly
  - subassembly
  - select group
  - rename group
related:
  - organize-parts-in-layers
  - parts-assemblies-and-mounting-ports
covers:
  - src/workspace/usePartEdits.ts
  - src/workspace/selection.ts
  - src/components/inspector/MultiInspector.tsx
  - src/components/inspector/GroupName.tsx
  - src/components/layers/LayerItems.tsx
---

Keep parts that belong together, such as a leg or a servo bracket, selecting and moving as one.

1. Select the parts on the canvas. Shift-click adds each one after the first.
2. Press [[⌘G]].
3. To name the group, click its title at the top of the Inspector, type the name and press [[↩]].

A toast says how many parts were grouped, and the group is called “Group 1” until you rename it. **Group** is also in the Inspector and in the right-click menu.

## Work inside a group

- Click any part of the group to select the whole group.
- Double-click a part, or [[⌘]]-click it, to select that part alone.
- Once you're inside a group, a click selects another of its parts.
- Shift-click adds or removes a whole group from outside it, or one part from inside it.

In **Layers**, a group is one row you can collapse. Click the row to select every part in it, or double-click it to rename the group.

## Ungroup

Select the group and press [[⇧⌘G]]. Right-clicking a grouped part offers **Ungroup** followed by the group's name.

Groups don't nest. Grouping parts that already belong to a group moves them into the new one.
