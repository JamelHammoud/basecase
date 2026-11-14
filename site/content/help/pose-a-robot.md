---
title: Pose a robot
date: 2026-11-13
updated: 2026-11-13
collection: engineer
type: task
order: 1
keywords:
  - pose
  - posing
  - joint angle
  - slider
  - rest pose
  - save pose
  - forward kinematics
  - articulate
  - bend
  - turn joint
related:
  - joints-and-kinematics
  - animate-a-robot
covers:
  - src/components/PosePanel.tsx
  - src/components/pose/PosesSection.tsx
  - src/components/pose/JointRow.tsx
  - src/utils/usePosing.ts
  - src/workspace/RightPanelTabs.tsx
  - src/workspace/sceneCommands.tsx
---

Turn a robot's joints to see how it moves, then save the poses you want to come back to. Posing never edits parts, so the pose you modeled stays the design. Learn more in [Joints and kinematics](/help/joints-and-kinematics).

1. Click any part of the robot on the canvas.
2. Press [[P]] to open the **Pose** tab in the right panel.
3. Click a part to pick the joint that turns it.
4. Drag the ring that appears on the joint's axis. For a sliding joint, drag the arrow instead.
5. To save the pose, click **Save pose** beside **Poses**, then type a name.

The ring turns in steps of 1°, and the arrow slides in steps of 1 mm. To move a joint without steps, hold [[⇧]] while you drag.

You can also set joints in the limb sections below **Poses**, such as **Head** or **Left arm**. Drag a joint's slider, or type its value. Click a row to select the parts that joint turns.

## Go back to a pose

- To apply a saved pose, click it. Right-click a pose to **Apply**, **Rename** or **Delete** it. Basecase asks before it deletes a pose.
- To return to the pose you modeled, click **Rest pose** beside **Save pose**.

Every pose change is a step you can undo with [[⌘Z]]. Changes made within 0.7 seconds of each other undo together, so one drag undoes in one step.

**Note:** The **Pose** tab shows only while a robot is selected, and picking a tool in the bottom toolbar leaves the tab. In [[⌘K]], you can find **Show Pose**, **Rest Pose**, and **Apply** followed by each saved pose's name.
