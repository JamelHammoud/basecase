---
title: Design a robot from a motion
date: 2026-11-13
collection: design
type: task
keywords:
  - bvh
  - motion capture
  - mocap
  - degrees of freedom
  - how many joints
  - servo sizing
  - skeleton
related:
  - edit-a-robot-skeleton
  - animate-a-robot
  - size-an-arm-to-its-targets
covers:
  - src/workspace/useMotionDesign.ts
  - src/components/DesignFromMotionSheet.tsx
  - src/utils/motionSkeleton.ts
  - src/utils/motionFit.ts
  - src/utils/motionAxes.ts
  - src/utils/motionTree.ts
  - src/utils/motionServos.ts
  - src/fromMotion/motionBuild.ts
---

Start from a BVH clip of the motion, and get the fewest joints that replay it, with a servo picked for each.

1. Open a scene with no robot in it.
2. Press [[⌘K]] and choose **Design From Motion**.
3. Pick a `.bvh` file. The sheet shows the clip's name and length.
4. In **Height**, enter how tall the robot stands, in mm.

   ![The sheet for a 2 s wave clip with a 300 mm height](/help/design-a-robot-from-a-motion/sheet.png)

5. Click **Design From Motion**. The skeleton and a servo on each joint appear, and the Pose tab opens on the skeleton.

   ![A shoulder and an elbow fitted to a wave, with each joint's margin in the Pose tab](/help/design-a-robot-from-a-motion/skeleton.png)

6. Read each joint's margin in the Pose tab. To give a joint more torque, click its row and choose the stronger servo.

A limb only gets the joints that move its end. In a wave, the arm gets a shoulder and an elbow, and the legs and head get none. Every limb's end stays within 1% of the height of its path in the clip, in every frame. Each joint's range is the clip's sweep plus 10%. Each servo is the cheapest in the catalog that holds its joint at that joint's fastest speed in the clip. Press [[⌘Z]] to remove the skeleton and servos in one step.

When a limb can't follow the clip that closely, the sheet names the limb and nothing is placed.

The clip's body is the robot's base, so walking or turning the whole body isn't fitted. Only BVH files are read. No links are placed: the skeleton is the plan the agent builds the body on.

Dropping a `.bvh` on a scene with no robot, or choosing **Import** in **File**, opens the same sheet. With a robot in the scene, a `.bvh` moves that robot instead, as in [Animate a robot](/help/animate-a-robot). The agent fits a skeleton the same way when you attach a BVH and say how tall the robot is. Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton).
