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

Make a legged robot walk in place, or copy a person's movement from a BVH motion capture file onto your robot's joints.

## Make a walk cycle

1. Select the robot and press [[P]] to open the **Pose** tab.
2. Click **+** beside **Animations**.
3. Choose **Walk Cycle**.

The new animation is called “Walk”. Its stride, foot lift and timing start from the robot's leg length. Feet in contact with the ground stay planted while the others swing.

A walk cycle needs leg joints. Without them, **+** offers only **Import BVH**. **New Walk Cycle** in [[⌘K]] does the same as the menu.

## Copy motion from a BVH file

1. In the **Pose** tab, click **+** beside **Animations** and choose **Import BVH**. A robot without legs skips the menu and goes straight to the file.
2. Pick a `.bvh` file.
3. Check which bone drives each joint in the sheet that opens, and change any that are wrong. Set a row to **None** to leave that joint still.
4. Turn on **In place** to keep the robot where it stands, and pick the **Frame rate**.
5. Click **Import**. The new animation appears under **Animations** and starts playing.
6. To play it on repeat, right-click the animation and choose **Loop**.

![The Animations + menu with Walk Cycle and Import BVH](/help/animate-a-robot/menu.png)

![The Import walk sheet for a 2 s recording, matching its arm and leg bones to the robot's joints](/help/animate-a-robot/retarget.png)

Bones are matched by name, so files from Mixamo, CMU, Daz and Unreal work without changes. Each robot limb points the way the performer's limb points, so the robot's proportions can differ from the person's.

When the robot can't follow the performer to within 25 mm, a toast names the point that misses most, such as Left knee off by 40 mm.

You can also choose **Import** in **File** or [[⌘K]] and pick the `.bvh` file.

## Play and edit an animation

- Click play on an animation's row, and drag its timeline to scrub.
- Pause to keep the current frame as the robot's pose.
- Right-click the row to turn **Loop** on or off, **Rename** it or **Delete** it.

![The right-click menu on an animation, with Play, Loop, Rename and Delete](/help/animate-a-robot/loop.png)

[[⌘K]] has **Play** followed by each animation's name.
