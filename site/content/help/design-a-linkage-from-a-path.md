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

Draw the path a leg, finger or head should trace, and get a four-bar linkage that traces it with a servo on its crank.

1. Click **Shapes** in the bottom toolbar and choose **Sketch**.
2. Under **Outline**, choose **Path**.
3. Click on the plane for each point of the path, in the order the tip should move. Place 5 to 12 points.

   ![Four points of a foot path clicked on the Sketch plane in Path mode](/help/design-a-linkage-from-a-path/points.png)

4. Wait for the linkages to draw over the plane. Each one sweeps its crank back and forth, and its row below the plane shows its largest path error in mm.
5. Point at a row to draw its linkage in blue.

   ![Three linkages over a foot path, with their errors listed below the plane](/help/design-a-linkage-from-a-path/linkages.png)

6. Click the row of the linkage you want to add it to the scene.

The linkage lands on the sketch's plane as four printed bars, **Ground**, **Crank**, **Coupler** and **Rocker**, with a Feetech STS3215 under the crank. The servo stands on the plane and turns the crank across the path you drew. Press ⌘Z to remove it.

![The four bars and the servo added to the scene](/help/design-a-linkage-from-a-path/inserted.png)

You can also drag across the plane to draw the path in one stroke, which keeps 12 points along it. Drag a point to move it, or press Delete to remove the last one.

When no linkage fits, the plane's border turns red. Links stay between 10 and 300 mm, so points too far apart get none. The linkage moves in Pose, but closed loops aren't simulated: in Simulate the coupler rides the crank as one rigid arm.

To turn the crank, see [Pose a robot](/help/pose-a-robot). The agent fits the same linkages when you ask it for a mechanism that traces a path.
