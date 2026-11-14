---
title: Shape a robot as a stick figure
date: 2026-11-13
collection: design
type: task
covers:
  - src/workspace/useSkeletonEdit.ts
  - src/components/pose/SkeletonSection.tsx
  - src/components/pose/SkeletonServoMenu.tsx
  - src/three/viewport/skeletonOverlay.ts
  - src/utils/skeletonMargins.ts
  - src/agent/skeletonDrag.ts
---

You can lay out a robot's joints and limbs before any part exists and see how hard each servo works as you go. When the layout is done, hand it to the agent to build around.

1. Press [[⌘K]] and run Edit Skeleton. The Pose tab opens, and the Edit Skeleton switch is on in the Skeleton section at the top.
2. If the scene has no skeleton, click Arm or Biped.
   - Arm starts a desk arm with 4 joints.
   - Biped starts two legs. Each leg has a hip roll, hip pitch, knee and ankle.

   Every joint starts on a Feetech STS3215.
3. Check the margin beside each joint's name. The margin is the share of the servo's stall torque that's left at its hardest load, either standing or holding the limb out. Green passes, amber is a warning, and red fails. The balls on the canvas use the same colors.
4. Drag a joint ball on the canvas to move that joint and everything below it. The joint moves in 1 mm steps.
   - To move freely, hold [[⇧]] while you drag.
   - To move only that joint, hold [[⌥]] while you drag. The bones on both sides of the joint change length.

   The matching joint on the other side mirrors the move, and the margins update as you drag.
5. To undo a whole drag in one step, press [[⌘Z]].
6. To give a joint more torque, click its ball or its row, then choose the stronger servo in the menu.
7. Open the Agent tab and ask the agent to build the robot around the skeleton. If the agent places a part on a joint, that part moves with the joint when you drag it later.

![The Skeleton section in the Pose tab, offering Arm and Biped](/help/edit-a-robot-skeleton/templates.png)

![A biped skeleton on the canvas, with each joint's margin in the Pose tab](/help/edit-a-robot-skeleton/biped.png)

![Both knees after dragging the left knee down 20 mm with ⌥: the knees now show 90%](/help/edit-a-robot-skeleton/dragged.png)

![Clicking the left knee offers the Feetech STS3250](/help/edit-a-robot-skeleton/servo-menu.png)

![After picking the STS3250, the left knee shows 94%](/help/edit-a-robot-skeleton/stronger.png)

To hide the skeleton, turn off the Edit Skeleton switch. The plan stays in the scene, and you can still use the Pose tab with it.
