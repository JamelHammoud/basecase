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
  - src/workspace/useSelectionOps.ts
  - src/components/inspector/MultiInspector.tsx
  - src/components/inspector/GroupName.tsx
  - src/components/layers/LayerItems.tsx
  - src/workspace/partActions.tsx
---

Group parts that belong together, such as a leg or a servo bracket, so they select and move as one.

1. Select the parts on the canvas. To add more parts after the first, Shift-click each one.
2. Press [[⌘G]].
3. To name the group, click its title at the top of the Inspector, type a name, then press [[↩]].

A toast shows how many parts you grouped. The group is called “Group 1” until you rename it. You can also find **Group** in the Inspector and in the right-click menu.

## Work inside a group

- To select the whole group, click any of its parts.
- To select a single part, double-click it or [[⌘]]-click it.
- Once you're inside a group, clicking another of its parts selects that part.
- Shift-click adds or removes a whole group when you're outside it, or a single part when you're inside it.

To duplicate a group, press [[⌘D]]. A copy of “Leg” is called “Leg copy”, and the parts inside it keep their names.

In **Layers**, each group appears as one row that you can collapse. Click the row to select every part in the group, or double-click it to rename the group. You can also open the same field by choosing **Rename** from the group's right-click menu or from [[⌘K]].

## Ungroup

Select the group, then press [[⇧⌘G]]. Or right-click a grouped part and choose **Ungroup** followed by the group's name.

You can't put a group inside another group. If you group parts that already belong to a group, they move into the new group.
