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

You can push, pull, and smooth a part's surface with a brush in Sculpt. Use it for shapes a box or sketch can't make, like a shell or a face.

Sculpt is off by default, so turn it on in Settings first.

1. Press [[⌘,]], then choose **Canvas**.
2. Under **Tools**, turn on **Sculpt**, then close Settings.
3. Click **Sculpt** in the bottom toolbar.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule**, or **Cylinder**. Basecase selects the new clay.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth**, or **Pinch**.
6. Drag on the part to sculpt it.
7. To finish and go back to **Move**, click **Done** or press [[Esc]].

You can also:

- Select a part already in the scene to sculpt it instead of adding clay.
- To swap **Inflate** and **Carve**, hold [[⌥]] while you drag.
- Once you've turned Sculpt on, press [[C]] to choose it.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the other side of the part, left to right. **Mirror Z** does the same front to back.

When you select a sculpted part, you'll see **Subdivide**. It adds vertices so the brush can make finer detail, and a toast shows the new vertex count.

Sculpting a box, shaft, or other shape turns it into a sculpted mesh. Each stroke counts as one step, so [[⌘Z]] undoes the last stroke. Sculpted parts render, print, and export after you turn the tool off.
