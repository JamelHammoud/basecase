---
title: Measure a part
date: 2026-11-12
covers:
  - src/components/MeasureToolbar.tsx
  - src/workspace/useMeasure.ts
  - src/three/viewport/measureTool.ts
  - src/three/viewport/scaleFigures.ts
---

Check the distance between two points in the scene, or stand a person or a dog beside your robot to see its real size.

1. Press D, or open Shapes ▾ in the bottom toolbar and choose Measure. Right-click a part and choose Measure From Here to start at the point you clicked.
2. Click the first point, then the second. Points snap to a part's corners, then its edges; hold ⇧ to place a point anywhere on a surface, or ⌥ to keep the second point straight above or below the first.
3. Read the distance on the label in the middle of the line. Click again to start a new measurement, or press Esc to clear it.
4. To compare with a person, click the figure icon next to the ruler, then click where they should stand. Change their height in the fields that appear. The dog icon places a Labrador at its real size.
5. Click Done, or press Esc with nothing measured, to go back to the usual toolbar.

![A measurement across the front of a cube](/help/measure-a-part/ruler.png)

![A person placed beside the cube, with their height in the toolbar](/help/measure-a-part/human.png)

Distances show in millimeters and meters, or in inches and feet when you pick Imperial in Settings ▸ Canvas ▸ Measure. They're never saved with the scene or exported.
