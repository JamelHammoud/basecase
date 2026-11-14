---
title: Design a robot from a motion clip
date: 2026-11-14
collection: design
type: task
keywords:
  - bvh
  - motion capture
  - mocap
  - degrees of freedom
  - dof
  - how many joints
  - servo sizing
related:
  - edit-a-robot-skeleton
  - animate-a-robot
covers:
  - src/workspace/useMotionDesign.ts
  - src/workspace/usePoseActions.ts
  - src/components/MotionDesignSheet.tsx
  - src/utils/motionSkeleton.ts
  - src/utils/motionChains.ts
  - src/utils/motionAxes.ts
  - src/utils/motionReplay.ts
  - src/utils/motionDesign.ts
  - src/motion/motionBuild.ts
---

Start from a motion your robot must perform, and get a skeleton with the fewest joints that replay it and a servo picked for each joint.

1. Press [[⌘K]] and choose **Design From Motion**.
2. Pick a `.bvh` motion capture file. The sheet shows the clip's name and length.
3. In **Height**, enter how tall the robot stands, in mm. The performer is scaled to this height.

   ![The Import Wave sheet for a 2 s clip with a Height of 300 mm](/help/design-a-robot-from-a-motion-clip/sheet.png)

4. Press [[↩]] or click **Design From Motion**. The skeleton and a servo at each joint appear, and the **Pose** tab opens with **Edit Skeleton** on.

   ![A 3-joint right arm fitted to the wave, with a servo at each joint and each joint's margin in the Pose tab](/help/design-a-robot-from-a-motion-clip/skeleton.png)

5. Check each joint's margin in the **Pose** tab. To give a joint more torque, click its ball or its row and choose the stronger servo.

Each limb gets the fewest joints that keep every point of it within 1% of the robot's height on every frame of the clip. That's 3 mm for a 300 mm robot. A limb that holds still gets no joints, and a joint that barely turns merges into the joint next to it. The skeleton stands in the clip's first pose.

Each joint's range covers what the clip uses, plus 10% on each side. Each servo is the cheapest one in the catalog that holds its joint and turns faster than the clip needs at that joint. A faster clip gets faster servos.

The body between the hips and the chest gets no joints, so a clip that bends at the waist can't be fitted closely. If no set of joints can follow a limb within the tolerance, the sheet names the limb and doesn't place anything.

To remove the skeleton and servos in one step, press [[⌘Z]].

You can also drop a `.bvh` file on a scene with no joints, which opens the same sheet. With a robot in the scene, a dropped `.bvh` copies the motion onto the robot instead, as in [Animate a robot](/help/animate-a-robot). Next, [shape the skeleton as a stick figure](/help/edit-a-robot-skeleton) or ask the agent to build around it.
