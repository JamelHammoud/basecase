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

Lay out a robot's joints and limbs before any part exists, see how hard each servo works, and hand the result to the agent to build around.

1. Press ⌘K and run Edit Skeleton. The Pose tab opens with the Edit Skeleton switch on, in the Skeleton section at the top.
2. In a scene with no skeleton, click Arm or Biped. Arm starts a desk arm with 4 joints, and Biped starts two legs with hip roll, hip pitch, knee and ankle on each. Every joint starts on a Feetech STS3215.
3. Read each joint's margin beside its name: the share of the servo's stall torque left at its hardest load, standing or holding the limb out. Green passes, amber is a warning and red fails. The balls on the canvas use the same colors.
4. Drag a joint ball on the canvas to move that joint and everything below it, in 1 mm steps. Hold Shift to move freely. Hold ⌥ to move only that joint, so the bones on both sides change length. The joint on the other side moves the mirror way, and the margins update as you drag.
5. Press ⌘Z to undo a whole drag in one step.
6. To give a joint more torque, click its ball or its row and choose the stronger servo in the menu.
7. Open the Agent tab and ask the agent to build the robot around the skeleton. Parts it places on a joint move with that joint when you drag it later.

![The Skeleton section in the Pose tab, offering Arm and Biped](/help/edit-a-robot-skeleton/templates.png)

![A biped skeleton on the canvas, with each joint's margin in the Pose tab](/help/edit-a-robot-skeleton/biped.png)

![Both knees after dragging the left knee down 20 mm with ⌥: the knees now show 90%](/help/edit-a-robot-skeleton/dragged.png)

![Clicking the left knee offers the Feetech STS3250](/help/edit-a-robot-skeleton/servo-menu.png)

![After picking the STS3250, the left knee shows 94%](/help/edit-a-robot-skeleton/stronger.png)

Turning the switch off hides the skeleton, but the plan stays in the scene, and the Pose tab stays available for it.
