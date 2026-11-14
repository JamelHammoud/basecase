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
  - src/components/settings/CanvasPane.tsx
  - src/workspace/usePartEdits.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/partActions.tsx
---

You can drag a part on the canvas with the gizmo, or type its exact position in millimeters and its angle in degrees in the Inspector.

## Drag with the gizmo

1. Click a part on the canvas to select it.
2. Press [[V]] for **Move**, [[E]] for **Rotate** or [[R]] for **Scale**.
3. Drag one of the gizmo's arrows, rings or handles.

Moves snap to 5 mm and turns snap to 15°. To move or turn without snapping, hold [[⇧]] while you drag. The canvas shows **Snapping off** while you hold the key.

To change the snap steps, open **Settings** ▸ **Canvas** ▸ **Snapping**. Choose Off, 1, 2, 5 or 10 mm for **Move**, and Off, 5°, 15°, 45° or 90° for **Rotate**.

If you select several parts, the gizmo appears at their shared center and moves them together. Locked parts stay where they are.

**Note:** A real component keeps its size when you use **Scale**.

## Type an exact position or angle

1. Select the part.
2. In the Inspector, click the **X**, **Y** or **Z** field under **Position** or **Rotation**.
3. Type the value and press [[↩]].

Position is the part's center, in millimeters. Y points up.

A field accepts math, such as `40/2` or `12+3.5`. To step the value up or down, press [[↑]] or [[↓]]. Hold [[⇧]] to step 10 times as far, or hold [[⌥]] to step a tenth as far. Or drag the field's label left or right to scrub the value. To go back to the value you started with, press [[Esc]].

Other fields are labeled with a letter too, such as **W** under **Size**. To find out what a letter stands for, hold the pointer over it.

To turn the part a quarter turn around X, Y or Z, click a **90°** button under **Rotation**. To set all three angles back to 0, click **Reset rotation** in the section's header. Or choose **Reset Rotation** from the part's right-click menu or from [[⌘K]].

## Place a part against the floor or another part

- **Drop to floor** ([[F]]) sets the part on the floor.
- **Stack on part below** ([[S]]) sets the part on top of the part underneath it.
- **Center on origin** sets the part's X and Z to 0.

All three are in the header of **Position**, in the part's right-click menu and in [[⌘K]].

To line up several parts with each other, see [Align and spread parts](/help/align-and-spread-parts).
