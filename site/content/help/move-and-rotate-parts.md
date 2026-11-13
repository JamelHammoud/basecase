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
---

Drag a part with the gizmo, or type its exact position in millimeters and its angle in degrees in the Inspector.

## Drag with the gizmo

1. Click a part on the canvas to select it.
2. Press [[V]] for **Move**, [[E]] for **Rotate** or [[R]] for **Scale**.
3. Drag an arrow, ring or handle of the gizmo.

Moves snap to 5 mm and turns to 15°. Hold [[⇧]] while you drag to move or turn freely; **Snapping off** shows on the canvas while you do. To change the steps, open **Settings** ▸ **Canvas** ▸ **Snapping**. **Move** takes Off, 1, 2, 5 or 10 mm, and **Rotate** takes Off, 5°, 15°, 45° or 90°.

With several parts selected, the gizmo sits at their shared center and moves them as one. Locked parts stay put, and a real component keeps its size under **Scale**.

## Type an exact position or angle

1. Select the part.
2. In the Inspector, click the **X**, **Y** or **Z** field under **Position** or **Rotation**.
3. Type the value and press [[↩]].

Position is the part's center in millimeters, with Y pointing up. Fields take math, so `40/2` or `12+3.5` work. [[↑]] and [[↓]] step the value; hold [[⇧]] for 10 times the step, or [[⌥]] for a tenth. You can also drag a field's label left or right to scrub it, and [[Esc]] puts back what you had. Hover a letter elsewhere, such as **W** under **Size**, to see what it stands for.

The **90°** buttons under **Rotation** turn the part a quarter turn around X, Y or Z. **Reset rotation**, in the section's header, sets all three back to 0.

## Place a part against the floor or another part

- **Drop to floor** ([[F]]) sets the part on the floor.
- **Stack on part below** ([[S]]) sets it on top of the part underneath.
- **Center on origin** puts its X and Z at 0.

The three are in the header of **Position**, and the first two are in the part's right-click menu.

To line up several parts with each other, follow [Align and spread parts](/help/align-and-spread-parts).
