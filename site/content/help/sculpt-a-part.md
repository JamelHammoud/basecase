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

Sculpt lets you push, pull and smooth the surface of a part with a brush. Use it for shapes you can't build from boxes and sketches, such as a shell or a face.

Sculpt is off by default, so turn it on in Settings first.

1. Press [[⌘,]], then choose **Canvas**.
2. Under **Tools**, turn on **Sculpt**. Then close Settings.
3. Click **Sculpt** in the bottom toolbar.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule** or **Cylinder**. Basecase selects the new clay.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth** or **Pinch**.
6. Drag on the part to sculpt it.
7. Click **Done** or press [[Esc]] to go back to **Move**.

To sculpt a part in the scene, select it instead of adding clay. To swap **Inflate** and **Carve**, hold [[⌥]] while you drag. Once Sculpt is on, you can press [[C]] to choose **Sculpt**.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the opposite side of the part, left to right, and **Mirror Z** repeats it front to back.

When you select a sculpted part, **Subdivide** appears. It adds vertices to the part so you can sculpt finer detail, and a toast shows the new vertex count.

Sculpting a box, shaft or other shape turns it into a sculpted mesh. Each stroke counts as one step, so press [[⌘Z]] to undo the last stroke. You can render, print and export sculpted parts after you turn the tool off.
