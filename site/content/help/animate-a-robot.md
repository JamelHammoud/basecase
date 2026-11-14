---
title: Animate a robot with a walk cycle or motion capture
date: 2026-11-13
updated: 2026-11-13
collection: engineer
type: task
order: 2
keywords:
  - animation
  - animate
  - walk
  - gait
  - walk cycle
  - bvh
  - mocap
  - motion capture
  - retarget
  - mixamo
  - keyframes
  - playback
related:
  - pose-a-robot
  - joints-and-kinematics
covers:
  - src/components/pose/AnimationsSection.tsx
  - src/components/RetargetSheet.tsx
  - src/workspace/usePoseActions.ts
  - src/utils/animation.ts
  - src/utils/mocap.ts
  - src/utils/mocapRetarget.ts
---

You can make a legged robot walk in place, or copy a person's movement from a BVH motion capture file onto your robot's joints.

## Make a walk cycle

1. Select the robot and press [[P]] to open the **Pose** tab.
2. Click **+** beside **Animations**.
3. Choose **Walk Cycle**.

The new animation is named “Walk” and starts playing right away. Basecase sets its stride, foot lift and timing from the robot's leg length. Feet that touch the ground stay planted while the other feet swing.

You can also choose **New Walk Cycle** in [[⌘K]].

**Note:** A walk cycle needs leg joints. If the robot doesn't have any, **+** offers only **Import BVH**.

## Copy motion from a BVH file

1. In the **Pose** tab, click **+** beside **Animations** and choose **Import BVH**. If the robot has no legs, there's no menu, and you go straight to choosing a file.
2. Pick a `.bvh` file.
3. In the sheet that opens, check which bone drives each joint, and change any that are wrong. To keep a joint still, set its row to **None**.
4. To keep the robot where it stands, turn on **In place**. Then pick the **Frame rate**.
5. Click **Import**. The new animation appears under **Animations** and starts playing.
6. To play it on repeat, right-click the animation and choose **Loop**.

![The Animations + menu with Walk Cycle and Import BVH](/help/animate-a-robot/menu.png)

![The Import walk sheet for a 2 s recording, matching its arm and leg bones to the robot's joints](/help/animate-a-robot/retarget.png)

Basecase matches bones by name, so files from Mixamo, CMU, Daz and Unreal work as they are. It points each of the robot's limbs the same way as the performer's, so your robot doesn't need the person's proportions.

If the robot can't follow the performer to within 25 mm, a toast names the point that misses the most, for example “Left knee off by 40 mm.”

You can also choose **Import** from the **File** menu or from [[⌘K]], then pick the `.bvh` file.

## Play and edit an animation

- To play an animation, click play on its row. To scrub, drag its timeline.
- When you pause, the robot holds the pose from the current frame.
- Right-click an animation's row to turn **Loop** on or off, **Rename** the animation or **Delete** it.

![The right-click menu on a playing animation, with Pause, Loop, Rename and Delete](/help/animate-a-robot/loop.png)

Each animation has its own command in [[⌘K]]. Type **Play** followed by the animation's name.
