---
title: Move and rotate parts
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 2
keywords:
  - gizmo
  - transform
  - position
  - rotation
  - translate
  - snap
  - snapping
  - nudge
  - drop to floor
  - stack
  - exact
  - coordinates
related:
  - add-parts-from-the-catalog
  - align-and-spread-parts
covers:
  - src/components/ViewportToolbar.tsx
  - src/components/inspector/partTransformSections.tsx
  - src/components/inspector/MultiInspector.tsx
  - src/design-system/NumberInput.tsx
  - src/design-system/numberInputMath.ts
  - src/components/SettingsWindow.tsx
  - src/workspace/usePartEdits.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/partActions.tsx
---

You can move a part by dragging it with the gizmo. Or type its exact position in millimeters and its angle in degrees in the Inspector.

## Drag with the gizmo

1. Click a part on the canvas to select it.
2. Press [[V]] for **Move**, [[E]] for **Rotate** or [[R]] for **Scale**.
3. Drag one of the gizmo's arrows, rings or handles.

Moves snap to 5 mm and turns snap to 15°. To move or turn without snapping, hold [[⇧]] while you drag. The canvas shows **Snapping off** for as long as you hold it.

To change the steps, open **Settings** ▸ **Canvas** ▸ **Snapping**. You can set **Move** to Off, 1, 2, 5 or 10 mm, and **Rotate** to Off, 5°, 15°, 45° or 90°.

If you select several parts, the gizmo appears at their shared center and moves them all together. Locked parts don't move. A real component keeps its size when you use **Scale**.

## Type an exact position or angle

1. Select the part.
2. In the Inspector, click the **X**, **Y** or **Z** field under **Position** or **Rotation**.
3. Type the value and press [[↩]].

Position is the part's center, in millimeters. Y points up.

In any of these fields, you can:

- Type math, such as `40/2` or `12+3.5`.
- Press [[↑]] or [[↓]] to step the value up or down. Hold [[⇧]] to step 10 times as far, or [[⌥]] to step a tenth as far.
- Drag the field's label left or right to scrub the value.
- Press [[Esc]] to restore the value you started with.

Other fields have single-letter labels too, such as **W** under **Size**. To see what a letter stands for, hold the pointer over it.

To turn the part a quarter turn around X, Y or Z, click a **90°** button under **Rotation**. To set all three angles back to 0, click **Reset rotation** in the section's header. You can also choose **Reset Rotation** from the part's right-click menu or from [[⌘K]].

## Place a part against the floor or another part

- **Drop to floor** ([[F]]) sets the part on the floor.
- **Stack on part below** ([[S]]) sets the part on top of the part underneath it.
- **Center on origin** sets the part's X and Z to 0.

You'll find all three in the header of **Position**, in the part's right-click menu and in [[⌘K]].

To line up several parts with each other, see [Align and spread parts](/help/align-and-spread-parts).
