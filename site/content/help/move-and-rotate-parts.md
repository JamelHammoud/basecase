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

You can move and turn a part by dragging the gizmo on the canvas. Or type its exact position in millimeters and its angle in degrees in the Inspector.

## Drag with the gizmo

1. Click a part on the canvas to select it.
2. Press [[V]] for **Move**, [[E]] for **Rotate** or [[R]] for **Scale**.
3. Drag one of the gizmo's arrows, rings or handles.

Moves snap to 5 mm, and turns snap to 15°. To move or turn freely, hold [[⇧]] while you drag. The canvas shows **Snapping off** while you hold the key.

To change the steps, open **Settings** ▸ **Canvas** ▸ **Snapping**. You can set **Move** to Off, 1, 2, 5 or 10 mm, and **Rotate** to Off, 5°, 15°, 45° or 90°.

When you select several parts, the gizmo appears at their shared center and moves them all together. Locked parts stay where they are. A real component keeps its size when you use **Scale**.

## Type an exact position or angle

1. Select the part.
2. In the Inspector, click the **X**, **Y** or **Z** field under **Position** or **Rotation**.
3. Type the value and press [[↩]].

Position is the part's center, in millimeters. Y points up.

Fields accept math, so you can type something like `40/2` or `12+3.5`. You can also change a value in these ways:

- To step the value up or down, press [[↑]] or [[↓]]. Hold [[⇧]] to step 10 times as far, or [[⌥]] to step a tenth as far.
- To scrub the value, drag the field's label left or right.
- To restore the value you started with, press [[Esc]].

Other fields are labeled with a letter too, such as **W** under **Size**. Hold the pointer over a letter to see what it stands for.

Click a **90°** button under **Rotation** to turn the part a quarter turn around X, Y or Z. To set all three angles back to 0, click **Reset rotation** in the section's header. You can also choose **Reset Rotation** from the part's right-click menu or from [[⌘K]].

## Place a part against the floor or another part

- **Drop to floor** ([[F]]) sets the part on the floor.
- **Stack on part below** ([[S]]) sets the part on top of the part underneath it.
- **Center on origin** sets the part's X and Z to 0.

You'll find all three in the header of **Position**, in the part's right-click menu and in [[⌘K]].

To line up several parts with each other, see [Align and spread parts](/help/align-and-spread-parts).
