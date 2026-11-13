---
title: Animate a robot from motion capture
date: 2026-11-13
covers:
  - src/components/RetargetSheet.tsx
  - src/components/pose/AnimationsSection.tsx
  - src/workspace/usePoseActions.ts
  - src/utils/mocap.ts
  - src/utils/mocapRetarget.ts
---

Turn a BVH recording of a person moving into an animation your robot plays in the Pose tab.

1. Select the robot and press P to open the Pose tab.
2. Click + beside Animations and choose Import BVH, then pick a `.bvh` file. A robot without legs skips the menu and goes straight to the file. Import BVH is also in ⌘K.
3. Check the match in the Retarget sheet. Each row pairs a bone from the recording with the robot joint that follows it; Basecase fills in what it can from the names, and you can change any row or set it to None.
4. Turn on In place to keep the robot where it stands instead of travelling with the performer, and pick a frame rate.
5. Click Create Animation. The new animation appears under Animations and starts playing; the slider under it scrubs.
6. To play it on repeat, right-click the animation and choose Loop.

![The Animations + menu with Walk Cycle and Import BVH](/help/animate-a-robot-from-motion-capture/menu.png)

![The Retarget sheet matching a recording's legs to the robot's hips, knees and ankles](/help/animate-a-robot-from-motion-capture/retarget.png)

![The right-click menu on an animation, with Play, Loop, Rename and Delete](/help/animate-a-robot-from-motion-capture/loop.png)

Right-click also renames or deletes an animation. When the robot can't follow the performer to within 25 mm, the toast after Create Animation names the point that misses most, such as Left knee off by 40 mm.
