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

You can start a robot from a BVH clip of the motion you want it to make. Basecase finds the fewest joints that can replay the clip and picks a servo for each one.

1. Open a scene that doesn't have a robot in it.
2. Press [[⌘K]] and choose **Design From Motion**.
3. Pick a `.bvh` file. The sheet shows the clip's name and length.
4. In **Height**, enter how tall the robot stands, in mm.

   ![The sheet for a 2 s wave clip with a 300 mm height](/help/design-a-robot-from-a-motion/sheet.png)

5. Click **Design From Motion**. The skeleton appears with a servo on each joint, and the Pose tab opens on the skeleton.

   ![A shoulder and an elbow fitted to a wave, with each joint's margin in the Pose tab](/help/design-a-robot-from-a-motion/skeleton.png)

6. Check each joint's margin in the Pose tab. To give a joint more torque, click its row and choose the stronger servo.

A limb gets only the joints that move its end. For example, in a wave the arm gets a shoulder and an elbow, and the legs and head get none. The end of every limb stays within 1% of the height of its path in the clip, and Basecase checks this on up to 240 frames spread across the clip. Each joint's range is the clip's sweep plus 10%. For each joint, Basecase picks the cheapest servo on the chosen bus that can hold the joint at its fastest speed in the clip. To remove the skeleton and servos in one step, press [[⌘Z]].

If a limb can't follow the clip that closely, the sheet names the limb and Basecase places nothing. If no servo is fast or strong enough for a joint, that joint gets the strongest servo on the bus, and a message names the joint. If no set of servos fits the joints, Basecase places the skeleton without servos and a message tells you. The margins in the Pose tab grade only the torque needed to hold each joint, and they ignore the clip's speed.

The clip's body becomes the robot's base, so Basecase doesn't fit motion where the whole body walks or turns. It reads only BVH files and doesn't place any links. The skeleton is the plan the agent builds the body on.

You can also open the same sheet by dropping a `.bvh` on a scene with no robot, or by choosing **File** ▸ **Import**. If the scene already has a robot, a `.bvh` moves that robot instead, as described in [Animate a robot](/help/animate-a-robot). The agent fits a skeleton the same way when you attach a BVH and tell it how tall the robot is.

Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton).
