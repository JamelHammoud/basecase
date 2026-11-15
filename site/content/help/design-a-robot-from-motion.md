---
title: Design a robot from a motion clip
date: 2026-11-14
collection: design
type: task
related:
  - edit-a-robot-skeleton
  - design-a-robot-with-the-agent
covers:
  - src/workspace/useMotionDesign.ts
  - src/workspace/usePoseActions.ts
  - src/components/MotionDesignSheet.tsx
  - src/utils/motionSkeleton.ts
  - src/motion/motionServos.ts
  - src/motion/motionBuild.ts
hub_the_design_agent_order: 120
hub_the_design_agent: |
  Give the agent a BVH motion clip, the robot's height and a path tolerance in mm. It fits the skeleton before designing the body, places a catalog servo per joint and opens Edit Skeleton. The clip can be an attachment or a public URL. This creates the skeleton and servos, without body parts or physics playback. See [Design a robot from a motion clip](/help/design-a-robot-from-motion).
---

Turn a BVH motion clip into a scaled skeleton with a catalog servo picked for each joint.

1. Press [[⌘K]].
2. In the command menu, choose **Design From Motion**.
3. In the file picker, choose your BVH file.
4. In **Height**, enter the robot's height in mm.

   ![The Design From Motion sheet with Height set to 300 mm](/help/design-a-robot-from-motion/height.png)

5. In **Design From Motion**, click **Design Skeleton**.
6. In the **Pose** tab, check the margin beside each joint.

   ![The wave skeleton and catalog servos with Edit Skeleton on in the Pose tab](/help/design-a-robot-from-motion/skeleton.png)

7. On the canvas, drag a joint ball to adjust the layout.

You can also drop a BVH onto a scene without movable robot joints. A scene with movable robot joints opens the animation import sheet instead.

Path error is limited to 2 mm at every source frame, and the skeleton stays in place instead of following the clip's root translation.
Servo sizing uses [estimated link masses and peak loads](/help/servo-torque-and-sizing).
This creates a skeleton and servos, without printed links or physics playback.

To remove the skeleton and its servos together, press [[⌘Z]] before editing them.
If a path can’t fit or no catalog servo can replay a joint, the sheet names it and places nothing.

Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton) or [design the body with the agent](/help/design-a-robot-with-the-agent).
