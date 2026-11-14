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

1. Select the robot and press [[P]] to open the **Pose** tab.
2. Click **+** beside **Animations**.
3. Choose **Walk Cycle**.

Basecase names the new animation “Walk” and starts playing it. It sets the stride, foot lift and timing from the robot's leg length. Feet on the ground stay planted while the others swing.

**Note:** A walk cycle needs leg joints. On a robot without them, **+** offers only **Import BVH**.

You can also choose **New Walk Cycle** in [[⌘K]].

## Copy motion from a BVH file

1. In the **Pose** tab, click **+** beside **Animations** and choose **Import BVH**. On a robot with no legs, **+** skips the menu and takes you straight to choosing a file.
2. Pick a `.bvh` file.
3. In the sheet that opens, check the bone that drives each joint and fix any wrong match. Set a joint's row to **None** to keep it still.
4. To keep the robot where it stands, turn on **In place**. Then pick the **Frame rate**.
5. Click **Import**. The new animation appears under **Animations** and starts playing.
6. To play it on repeat, right-click the animation and choose **Loop**.

![The Animations + menu with Walk Cycle and Import BVH](/help/animate-a-robot/menu.png)

![The Import walk sheet for a 2 s recording, matching its arm and leg bones to the robot's joints](/help/animate-a-robot/retarget.png)

Basecase matches bones by name, so files from Mixamo, CMU, Daz and Unreal import as they are. It points each robot limb the same way as the performer's matching limb, so your robot's proportions can differ from the person's.

If the robot can't follow the performer to within 25 mm, a toast names the point that misses the most, for example “Left knee off by 40 mm”.

You can also start from **Import** in the **File** menu or [[⌘K]] and pick the `.bvh` file there.

## Play and edit an animation

- Click play on an animation's row to play it, or drag its timeline to scrub.
- When you pause, the robot holds the pose from the current frame.
- Right-click a row to turn **Loop** on or off, **Rename** the animation or **Delete** it.

![The right-click menu on an animation, with Play, Loop, Rename and Delete](/help/animate-a-robot/loop.png)

Each animation has its own command in [[⌘K]]: **Play** followed by the animation's name.
