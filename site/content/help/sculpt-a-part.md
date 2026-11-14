---
title: Sculpt a part
date: 2026-11-13
updated: 2026-11-13
collection: design
type: task
order: 7
keywords:
  - sculpt
  - clay
  - brush
  - organic
  - freeform
  - inflate
  - carve
  - smooth
  - symmetry
  - vertex
related:
  - draw-a-part-from-a-sketch-or-svg
  - cut-join-and-intersect-parts
covers:
  - src/components/studio/SculptPanel.tsx
  - src/workspace/usePartCreation.ts
  - src/workspace/useToolMode.ts
  - src/three/viewport/sculptInput.ts
  - src/three/sculptEngine.ts
  - src/components/SettingsWindow.tsx
---

You can use a brush to push, pull and smooth the surface of a part. Sculpt is for shapes you can't make with boxes and sketches, like a shell or a face. It's turned off by default.

1. Press [[⌘,]], then choose **Canvas**.
2. Under **Tools**, turn on **Sculpt**, then close Settings.
3. Click **Sculpt** in the bottom toolbar.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule** or **Cylinder**. Basecase selects the new clay.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth** or **Pinch**.
6. Drag on the part to sculpt it.
7. When you're done, click **Done** or press [[Esc]] to go back to **Move**.

To sculpt a part that's already in the scene, select it instead of adding clay. To swap **Inflate** and **Carve**, hold [[⌥]] while you drag. After you turn Sculpt on, you can also press [[C]] to choose it.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the other side of the part, from left to right. **Mirror Z** does the same thing from front to back.

**Subdivide** appears when a sculpted part is selected. It adds vertices so the brush can make finer detail. A toast shows the new vertex count.

A box, shaft or other shape becomes a sculpted mesh once you sculpt it. Each stroke counts as one step. To undo the last stroke, press [[⌘Z]]. Sculpted parts still render, print and export after you turn the tool off.
