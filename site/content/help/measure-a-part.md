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

You can check the distance between two points in the scene, or stand a person or a dog beside your robot to judge its real size.

1. Press [[D]] to start **Measure**.
2. Click the first point, then click the second.
3. Read the distance on the label in the middle of the line.
4. Click **Done** to go back to the usual toolbar.

![A measurement across the front of a cube](/help/measure-a-part/ruler.png)

Points snap to a part's corners first, then to its edges. To place a point anywhere on a surface, hold [[⇧]] while you click. To keep the second point straight above or below the first, hold [[⌥]]. Click empty space to measure on the floor.

To start a new measurement, click a third time. Press [[Esc]] to clear the line, then press [[Esc]] again to leave Measure.

You can also find Measure under **Shapes** in the bottom toolbar, or in [[⌘K]]. To start from a spot on a part, right-click it and choose **Measure from Here**.

## Compare with a person or a dog

1. While measuring, click **Human** in the toolbar.
2. Click where the person should stand.
3. Type their height in the fields that appear.

![A person placed beside the cube, with their height in the toolbar](/help/measure-a-part/human.png)

The person starts at 175.3 cm, or 5 ft 9 in if heights show in feet. **Dog** places a Labrador Retriever at its real size, 57 cm at the shoulder.

You can place each figure once. To move it, click again.

## Units

Distances show in millimeters and meters. To use inches instead, choose **Imperial** in **Settings** ▸ **Canvas** ▸ **Measure**. Imperial shows inches to the nearest sixteenth, then feet and inches.

**Note:** Measurements and figures stay out of the saved scene and out of every export.
