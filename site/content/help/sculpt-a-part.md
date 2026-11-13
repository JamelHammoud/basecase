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
  - src/three/sculptAndBooleanEngine.ts
  - src/components/SettingsWindow.tsx
---

Push, pull and smooth a part's surface with a brush, for shapes like a shell or a face that boxes and sketches can't make.

Sculpt is off until you turn it on in Settings.

1. Press [[⌘,]] and choose **Canvas**.
2. Under **Experimental**, turn on **Sculpt tool**, then close Settings.
3. Click **Sculpt** in the bottom toolbar.
4. Under **Add clay**, click **Sphere**, **Block**, **Capsule** or **Cylinder**.
5. Under **Brush**, choose **Inflate**, **Carve**, **Grab**, **Flatten**, **Smooth** or **Pinch**.
6. Drag on the part to sculpt it.
7. Click **Done** to go back to **Move**.

To sculpt a part already in the scene, select it instead of adding clay. Hold [[⌥]] while you drag to swap **Inflate** and **Carve**. [[C]] picks Sculpt once it's on.

## Brush settings

| Setting | Range | Starts at |
|---|---|---|
| Size | 3 to 50 mm | 16 mm |
| Strength | 10 to 100% | 45% |
| Mirror X | On or off | On |
| Mirror Z | On or off | Off |

**Mirror X** repeats each stroke on the other side of the part, left to right, and **Mirror Z** front to back. **Subdivide**, shown while a part is selected, adds vertices so the brush can make finer detail; a toast gives the new count.

Sculpting a box, shaft or other shape turns it into a sculpted mesh. Each stroke is one step, so [[⌘Z]] takes back the last one. Sculpted parts still render, print and export after you turn the tool off.
