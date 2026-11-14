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

You can make a legged robot walk in place, or copy a person's movement from a BVH motion capture file onto its joints.

- Make a walk cycle
- Copy motion from a BVH file
- Play and edit an animation

## Make a walk cycle

1. Select the robot, then press [[P]] to open the **Pose** tab.
2. Click **+** next to **Animations**.
3. Choose **Walk Cycle**.

Basecase adds an animation called “Walk” and plays it. The stride, foot lift and timing are set from the robot's leg length. Feet on the ground stay planted while the others swing.

**Note:** A walk cycle needs leg joints. If the robot doesn't have any, **+** offers only **Import BVH**.

Or choose **New Walk Cycle** in [[⌘K]].

## Copy motion from a BVH file

1. In the **Pose** tab, click **+** next to **Animations**, then choose **Import BVH**. If the robot has no legs, **+** skips the menu and asks for the file.
2. Choose a `.bvh` file.
3. In the sheet that opens, check which bone drives each joint and fix any that are wrong. To keep a joint still, set its row to **None**.
4. Turn on **In place** if the robot should stay where it stands. Then choose the **Frame rate**.
5. Click **Import**. The new animation appears under **Animations** and starts playing.
6. To play the animation on repeat, right-click it and choose **Loop**.

![The Animations + menu with Walk Cycle and Import BVH](/help/animate-a-robot/menu.png)

![The Import walk sheet for a 2 s recording, matching its arm and leg bones to the robot's joints](/help/animate-a-robot/retarget.png)

Basecase matches bones by name, so files from Mixamo, CMU, Daz and Unreal work as they are. Each robot limb points the same way as the matching limb on the performer, so your robot doesn't need the performer's proportions.

If the robot can't follow the performer to within 25 mm, a toast names the point that misses by the most, such as “Left knee off by 40 mm.”

You can also start an import from the **File** menu or from [[⌘K]]. Choose **Import**, then pick the `.bvh` file.

If there's no robot in the scene, Basecase opens the `.bvh` file in **Design From Motion** instead. Learn more in [Design a robot from a motion](/help/design-a-robot-from-a-motion).

## Play and edit an animation

- To start an animation, click play on its row. To scrub, drag its timeline.
- When you pause, the robot holds the pose from the current frame.
- To turn **Loop** on or off, **Rename** an animation, or **Delete** it, right-click its row.

![The right-click menu on an animation, with Play, Loop, Rename and Delete](/help/animate-a-robot/loop.png)

Each animation has its own command in [[⌘K]]: **Play** followed by the animation's name.
