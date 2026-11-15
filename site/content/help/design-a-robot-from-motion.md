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
---

Turn a BVH motion clip into a scaled skeleton with a catalog servo picked for each joint.

1. Press [[⌘K]] and choose **Design From Motion**.
2. In the file picker, choose your BVH file.
3. In **Height**, enter the robot's height in mm.

   ![The Design From Motion sheet with Height set to 300 mm](/help/design-a-robot-from-motion/height.png)

4. Click **Design Skeleton**.
5. In the Pose tab, check the margin beside each joint.

   ![The wave skeleton and catalog servos with Edit Skeleton on in the Pose tab](/help/design-a-robot-from-motion/skeleton.png)

6. Drag a joint ball to adjust the layout.

You can also drop a BVH onto an empty scene. A scene with a robot opens the animation import sheet instead.

The fit uses the fewest observed rotation axes per endpoint path that stay within 2 mm at every source frame.
It removes root translation and adds 10% of each fitted joint's span at both range ends.
Servo sizing uses estimated link masses and conservative peak loads.
This creates a skeleton and servos, without printed links or physics playback.

To remove the skeleton and its servos together, press [[⌘Z]] before editing them.
If a path can’t fit or no catalog servo can replay a joint, the sheet names it and places nothing.

Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton) or [design the body with the agent](/help/design-a-robot-with-the-agent).
