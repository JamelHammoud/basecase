---
title: Size an arm from the points it must reach
date: 2026-11-13
collection: design
type: task
keywords:
  - arm
  - reach
  - payload
  - link lengths
  - manipulator
  - servo sizing
  - so-101
related:
  - edit-a-robot-skeleton
  - design-a-robot-with-the-agent
covers:
  - src/workspace/useArmSizing.ts
  - src/components/ArmSizingSheet.tsx
  - src/utils/armSizing.ts
  - src/utils/armSearch.ts
  - src/utils/armReach.ts
  - src/utils/armServos.ts
  - src/arm/armBuild.ts
---

Mark where an arm's tool must reach and give the grams it carries, and get exact link lengths with a servo picked for each joint.

1. Click **Shapes** in the bottom toolbar and click **Sphere**.
2. Move the sphere to a point the arm's tool must reach. The arm stands at the origin.
3. Right-click the sphere and choose **Guide**, so it's never printed.
4. Repeat for each point, up to 8.
5. Select the guides, then right-click one and choose **Size Arm to Targets**. The sheet lists each guide's center in mm.
6. In **Payload**, enter the grams at the wrist: the gripper and what it holds.

   ![The Size Arm to Targets sheet listing Desk, Top Shelf and Bin with a 200 g payload](/help/size-an-arm-to-its-targets/sheet.png)

7. Click **Size Arm**. The arm appears at the origin, turned to face the targets, and the Pose tab opens on its skeleton.

   ![A 4-joint arm on the canvas beside its three targets, with each joint's margin in the Pose tab](/help/size-an-arm-to-its-targets/arm.png)

8. Read each joint's margin in the Pose tab. Drag a joint ball to try another length, and the margins update as you drag.

The arm has base yaw, shoulder, elbow and wrist pitch joints. Its links are the shortest set on a 5 mm grid, from 75 mm, that reach every target within 2 mm. Each joint keeps at least 10% of its range spare at every target. Each servo is the cheapest in the Feetech STS3215 outline that holds its joint with the payload. Press [[⌘Z]] to remove the whole arm in one step.

When no arm reaches a target, the sheet names it and nothing is placed.

![The sheet saying Far Shelf is out of reach](/help/size-an-arm-to-its-targets/out-of-reach.png)

Links are only placed in the desktop app; the web studio places the skeleton and servos. The sizing doesn't check that links clear the table or each other.

You can also run **Size Arm to Targets** from [[⌘K]], or ask the agent to size an arm from the points and payload you describe. Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton) or have the agent build around it.
