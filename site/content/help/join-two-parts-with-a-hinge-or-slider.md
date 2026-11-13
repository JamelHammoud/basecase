---
title: Join two parts with a hinge or slider
date: 2026-11-12
covers:
  - src/joints/handJoint.ts
  - src/joints/axisFinder.ts
  - src/workspace/useHandJoints.ts
  - src/workspace/contextMenuItems.tsx
  - src/workspace/editCommands.tsx
  - src/components/PosePanel.tsx
  - src/components/pose/JointRangeFields.tsx
---

Turn separate parts, like the bodies of an imported STEP file, into something you can pose: a hinge turns one part about an axis, a slider moves it along one.

1. Click the part that stays put, then Shift-click the part that moves.
2. Right-click the selection and choose **Add Hinge** or **Add Slider**. They're in ⌘K too.
3. If the canvas shows a crosshair, click a round face on any part: a pin, a shaft, a bore or a servo horn. The joint takes that face's axis. Clicking a flat face does nothing, and Esc gives up. When the two parts already share a pin and its hole, the joint is made without a click.
4. The Pose tab opens on the new joint. Drag its slider, or the ring on the canvas, to turn the moving part.

![Add Hinge in the menu for two selected parts](/help/join-two-parts/menu.png)

![The Pose tab with the new hinge turned](/help/join-two-parts/pose.png)

A hinge turns 90° each way and a slider travels as far as the two parts overlap. To change that, right-click the joint's row in the Pose tab and open **Range**. **Delete** in the same menu removes the joint, and ⌘Z brings it back.
