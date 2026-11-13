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

Turn a robot's joints to see how it moves, then save the poses you want to come back to, without changing the design.

1. Click any part of the robot on the canvas.
2. Press [[P]] to open the **Pose** tab in the right panel.
3. Click a part to pick the joint that turns it.
4. Drag the ring that appears on the joint's axis, or the arrow on a sliding joint.
5. To save the pose, click **Save pose** beside **Poses** and type a name.

The ring turns in steps of 1°, and an arrow slides in steps of 1 mm. Hold [[⇧]] while you drag to move freely.

You can also drag a joint's slider, or type its value, in the limb sections below **Poses**, such as **Head** or **Left arm**. Clicking a row selects the parts that joint turns.

## Go back to a pose

- Click a saved pose to apply it. Right-click it to **Apply**, **Rename** or **Delete**; deleting asks first.
- Click **Rest pose**, beside **Save pose**, to return to the pose you modeled.

Every pose change is a step you can undo with [[⌘Z]]. Changes made within 0.7 seconds of each other undo together, so one drag undoes in one step.

The **Pose** tab shows only while a robot is selected, and picking a tool in the bottom toolbar leaves it. [[⌘K]] has **Show Pose**, **Rest Pose**, and **Apply** followed by each saved pose's name.

Posing never edits parts: the modeled pose stays the design, as [Joints and kinematics](/help/joints-and-kinematics) explains.
