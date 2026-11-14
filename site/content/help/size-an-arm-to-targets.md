---
title: Size an arm to the points it must reach
date: 2026-11-13
collection: design
type: task
related:
  - servo-torque-and-sizing
  - joints-and-kinematics
covers:
  - src/utils/armSizing.ts
  - src/utils/armParts.ts
  - src/workspace/useArmSizing.ts
  - src/components/SizeArmSheet.tsx
  - src/workspace/skeletonCommands.tsx
---

Get a desk arm's link lengths and a servo for each joint from the points its wrist must reach and the weight it carries.

1. Place a small part, such as a sphere, at each point the wrist must reach. You can use up to 8.
2. Select those parts, right-click them and choose **Guide**.
3. With the guide parts still selected, press ⌘K and run **Size Arm to Targets**. The sheet lists each target's position in millimeters.
4. In **Payload**, enter the grams the arm carries at its wrist.
5. Click **Size Arm**. The arm appears with a servo on each joint, and the Pose tab opens with Edit Skeleton on.

![The Size Arm to Targets sheet with three targets and a 200 g payload](/help/size-an-arm-to-targets/sheet.png)

![The sized arm's servos and skeleton between the three targets, with each joint's margin in the Pose tab](/help/size-an-arm-to-targets/arm.png)

You can also right-click the selected guide parts and choose **Size Arm to Targets**. Press ⌘Z to remove the whole arm in one step.

The arm has 4 joints: base yaw, then shoulder, elbow and wrist pitch. Its base stands at the scene origin and turns to face the targets. The upper arm and forearm come in 5 mm steps from 75 to 300 mm, and the base can rise by up to 300 mm. You get the shortest arm that reaches every target within 2 mm, with every joint kept at least a tenth of its range from its limits.

When a target can't be reached, the sheet names it, says why and nothing is placed. A target can be too far, too close to the base, or outside the base's 176° turn from the others. When no servo is strong enough, the sheet names the joint. Servos come from the Feetech STS3215's size, so the printed links fit each one. In the desktop app the printed links are placed too; on the web you get the skeleton and servos.

To drag the joints and change servos afterward, see [Shape a robot as a stick figure](/help/edit-a-robot-skeleton). How the servos are rated is in [Servo torque and sizing](/help/servo-torque-and-sizing).
