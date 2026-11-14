---
title: Design a linkage from a path
date: 2026-11-13
collection: design
type: task
order: 7
keywords:
  - linkage
  - four-bar
  - four bar
  - mechanism
  - path
  - crank
  - rocker
  - coupler
  - walking leg
  - gripper finger
  - synthesis
related:
  - draw-a-part-from-a-sketch-or-svg
  - pose-a-robot
covers:
  - src/components/studio/SketchPanel.tsx
  - src/components/studio/useSketchPath.ts
  - src/components/studio/SketchPathLayer.tsx
  - src/components/studio/LinkageChoices.tsx
  - src/utils/linkage.ts
  - src/linkage/linkageParts.ts
---

Draw the path you want a leg, finger or head to trace, and get a four-bar linkage that traces it, with a servo on its crank.

1. Click **Shapes** in the bottom toolbar, then choose **Sketch**.
2. Under **Outline**, choose **Path**.
3. Click on the plane to place each point of the path, in the order the tip should move. Place between 5 and 12 points.

   ![Four points of a foot path clicked on the Sketch plane in Path mode](/help/design-a-linkage-from-a-path/points.png)

4. Wait while Basecase draws the linkages over the plane. Each one sweeps its crank back and forth, and its row below the plane shows its largest path error in mm.
5. Hold the pointer over a row to draw its linkage in blue.

   ![Three linkages over a foot path, with their errors listed below the plane](/help/design-a-linkage-from-a-path/linkages.png)

6. Below the plane, click the row of the linkage you want to add.

Basecase adds the linkage on the sketch's plane as four printed bars: **Ground**, **Crank**, **Coupler** and **Rocker**. A Feetech STS3215 servo stands on the plane under the crank and turns it across the path you drew. To remove the linkage, press [[⌘Z]].

![The four bars and the servo added to the scene](/help/design-a-linkage-from-a-path/inserted.png)

Instead of clicking each point, you can drag across the plane to draw the path in one stroke. Basecase keeps 12 points along it. To move a point, drag it. To remove the last point, press [[⌫]]. To undo or redo a point, press [[⌘Z]] or [[⇧⌘Z]].

If no linkage fits your path, the plane's border turns red. Links stay between 10 and 300 mm long, so if your points are too far apart, you won't get a linkage.

The linkage moves in Pose. Simulate doesn't model closed loops, so there the coupler moves with the crank as one rigid arm.

To turn the crank, see [Pose a robot](/help/pose-a-robot). If you ask the agent for a mechanism that traces a path, it fits the same linkages.
