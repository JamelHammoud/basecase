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

With Sculpt, you push, pull and smooth the surface of a part with a brush. Use it for shapes you can't build from boxes or sketches, like a shell or a face.

Sculpt is off by default, so turn it on in Settings before you start.

1. Press [[⌘,]] and choose **Canvas**.
2. Under **Tools**, turn on **Sculpt** and close Settings.
3. Click **Sculpt** in the bottom toolbar.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule** or **Cylinder**. Basecase selects the new clay for you.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth** or **Pinch**.
6. Drag on the part to sculpt it.
7. Click **Done** or press [[Esc]] to go back to **Move**.

To sculpt a part that's already in the scene, select it and skip step 4. To swap **Inflate** and **Carve**, hold [[⌥]] while you drag. Once Sculpt is turned on in Settings, you can press [[C]] to choose it.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the opposite side of the part, from left to right. **Mirror Z** does the same from front to back.

When you select a sculpted part, **Subdivide** appears. It adds vertices so the brush can make finer detail, and a toast shows the new vertex count.

When you sculpt a box, shaft or other shape, Basecase turns it into a sculpted mesh. Each stroke counts as one step, so press [[⌘Z]] to undo the last stroke. After you turn the tool off, sculpted parts render, print and export as usual.
