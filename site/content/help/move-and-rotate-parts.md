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

You can move and turn a part by dragging the gizmo on the canvas. To place it exactly, type its position in millimeters and its angle in degrees in the Inspector.

## Drag with the gizmo

1. Click a part on the canvas to select it.
2. Press [[V]] for **Move**, [[E]] for **Rotate** or [[R]] for **Scale**.
3. Drag one of the gizmo's arrows, rings or handles.

Moves snap to 5 mm, and turns snap to 15°. Hold [[⇧]] while you drag to move or turn without snapping. The canvas shows **Snapping off** for as long as you hold the key.

To change how far each snap goes, open **Settings** ▸ **Canvas** ▸ **Snapping**. You can set **Move** to Off, 1, 2, 5 or 10 mm, and **Rotate** to Off, 5°, 15°, 45° or 90°.

If you select several parts, the gizmo appears at their shared center and moves them together. Locked parts stay where they are. A real component keeps its size when you use **Scale**.

## Type an exact position or angle

1. Select the part.
2. In the Inspector, click the **X**, **Y** or **Z** field under **Position** or **Rotation**.
3. Type the value, then press [[↩]].

Position is the part's center, in millimeters. Y points up.

Each field accepts math, such as `40/2` or `12+3.5`. You can also take any of these actions:

- To step the value up or down, press [[↑]] or [[↓]]. Hold [[⇧]] to step 10 times as far, or hold [[⌥]] to step a tenth as far.
- To scrub the value, drag the field's label left or right.
- To go back to the value you started with, press [[Esc]].

Other fields have letter labels too, such as **W** under **Size**. Hold the pointer over a letter to see what it stands for.

To rotate the part 90° around X, Y or Z, click a **90°** button under **Rotation**. To set all three angles back to 0, click **Reset rotation** in the section's header. Or choose **Reset Rotation** from the part's right-click menu or from [[⌘K]].

## Place a part against the floor or another part

- **Drop to floor** ([[F]]) sets the part down on the floor.
- **Stack on part below** ([[S]]) sets the part on top of the part underneath it.
- **Center on origin** sets the part's X and Z to 0.

You can find all three in the header of **Position**, in the part's right-click menu and in [[⌘K]].

To line up several parts with each other, see [Align and spread parts](/help/align-and-spread-parts).
