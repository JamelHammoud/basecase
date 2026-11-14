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

Mark the points an arm's tool must reach and enter the grams it carries. You get exact link lengths and a servo picked for each joint.

1. Click **Shapes** in the bottom toolbar, then click **Sphere**.
2. Move the sphere to a point the arm's tool must reach. The arm stands at the origin.
3. Right-click the sphere and choose **Guide**. Guides are never printed.
4. Repeat for each point. You can add up to 8.
5. Select the guides, then right-click one of them and choose **Size Arm to Targets**. The sheet lists the center of each guide in mm.
6. In **Payload**, enter the grams at the wrist. This is the gripper plus whatever it holds.

   ![The Size Arm to Targets sheet listing Desk, Top Shelf and Bin with a 200 g payload](/help/size-an-arm-to-its-targets/sheet.png)

7. Press [[↩]] or click **Size Arm**. The arm appears at the origin, turned to face the targets, and the Pose tab opens on its skeleton.

   ![A 4-joint arm on the canvas beside its three targets, with each joint's margin in the Pose tab](/help/size-an-arm-to-its-targets/arm.png)

8. Check each joint's margin in the Pose tab. To try another length, drag a joint ball. The margins update as you drag.

The arm has four joints: base yaw, shoulder, elbow and wrist pitch. Link lengths start at 75 mm and go up in 5 mm steps, and you get the shortest set that reaches every target within 2 mm. At every target, each joint keeps at least 10% of its range spare. Each joint's servo is the cheapest one in the Feetech STS3215 outline that holds the joint with the payload.

To remove the whole arm in one step, press [[⌘Z]].

If no arm can reach a target, the sheet names that target and doesn't place anything.

![The sheet saying Far Shelf is out of reach](/help/size-an-arm-to-its-targets/out-of-reach.png)

Only the desktop app places links. The web studio places the skeleton and servos. Sizing doesn't check whether links clear the table or each other.

You can also run **Size Arm to Targets** from [[⌘K]], or describe the points and payload to the agent and ask it to size an arm. Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton) or have the agent build around it.
