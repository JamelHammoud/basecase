---
title: Measure a part
date: 2026-11-12
updated: 2026-11-13
collection: design
type: task
order: 9
keywords:
  - ruler
  - distance
  - dimension
  - length
  - size
  - scale figure
  - human
  - person
  - dog
  - imperial
  - inches
related:
  - move-and-rotate-parts
  - add-a-reference-image
covers:
  - src/components/MeasureToolbar.tsx
  - src/workspace/useMeasure.ts
  - src/three/viewport/measureTool.ts
  - src/three/viewport/measureMath.ts
  - src/three/viewport/scaleFigures.ts
---

Check the distance between two points in the scene, or stand a person or a dog beside your robot to judge its real size.

1. Press [[D]] to start **Measure**.
2. Click the first point, then the second.
3. Read the distance on the label in the middle of the line.
4. Click **Done** to go back to the usual toolbar.

![A measurement across the front of a cube](/help/measure-a-part/ruler.png)

Points snap to a part's corners, then its edges. Hold [[⇧]] to place a point anywhere on a surface, or [[⌥]] to keep the second point straight above or below the first. A click on empty space measures on the floor.

A third click starts a new measurement. [[Esc]] clears the line, and a second [[Esc]] leaves Measure.

Measure is also under **Shapes** in the bottom toolbar and in [[⌘K]]. To start from a spot on a part, right-click it and choose **Measure from Here**.

## Compare with a person or a dog

1. While measuring, click **Human** in the toolbar.
2. Click where the person should stand.
3. Type their height in the fields that appear.

![A person placed beside the cube, with their height in the toolbar](/help/measure-a-part/human.png)

The person starts at 175.3 cm, or 5 ft 9 in where heights are given in feet. **Dog** places a Labrador Retriever at its real size, 57 cm at the shoulder. Each can be placed once; click again to move it.

## Units

Distances show in millimeters and meters until you choose **Imperial** in **Settings** ▸ **Canvas** ▸ **Measure**. Imperial shows inches to the nearest sixteenth, then feet and inches. Measurements and figures are never saved with the scene or exported.
