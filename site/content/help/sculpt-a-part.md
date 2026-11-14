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
  - src/components/settings/CanvasPane.tsx
---

In Sculpt, you shape a part's surface with a brush that pushes it out, pulls it in, or smooths it. Use it for shapes you can't make from a box or a sketch, such as a shell or a face.

Sculpt is off by default, so turn it on in Settings first.

1. Press [[⌘,]], then choose **Canvas**.
2. Under **Tools**, turn on **Sculpt**, then close Settings.
3. In the bottom toolbar, click **Sculpt**.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule**, or **Cylinder**. Basecase selects the new clay.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth**, or **Pinch**.
6. Drag on the part to sculpt it.
7. When you're finished, click **Done** or press [[Esc]] to go back to **Move**.

You can also:

- Sculpt a part that's already in the scene. Select it instead of adding clay.
- Swap **Inflate** and **Carve** by holding [[⌥]] while you drag.
- Press [[C]] to choose Sculpt, once you've turned it on.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the other side of the part, from left to right. **Mirror Z** does the same from front to back.

When you select a sculpted part, **Subdivide** appears. Click it to add vertices so the brush can make finer detail. A toast shows the new vertex count.

Any part you sculpt, such as a box or a shaft, becomes a sculpted mesh. Each stroke is one undo step, so pressing [[⌘Z]] undoes the last stroke. Sculpted parts still render, print, and export after you turn the tool off.
