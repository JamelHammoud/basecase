---
title: Design gripper fingers
date: 2026-11-20
collection: design
type: task
order: 40
related:
  - pick-up-a-block-with-a-gripper
  - export-a-robot-kit
covers:
  - src/gripperFingers/
  - src/workspace/useGripperFingers.ts
  - src/workspace/gripperFingerCommands.tsx
  - src/cases/selectedPick.ts
  - src/cases/pickGoal.ts
---

Fit editable fingers to a rigid object, then record its approach, grasp, lift, placement and release in a Case.

Use the desktop app and an arm with two powered sliding carriages from the `gripper_finger_mount_m3` recipe. You can’t use other mounting interfaces.
Use an unedited box or circular cylinder resting on the floor, and supply its weight and friction.
A passed try is evidence of a simulated grasp. It makes no claim about physical performance.

1. In **Layers**, select one declared gripper carriage.
2. Hold [[⌘]] and click the object's row to add it to the selection.
3. Press [[⌘K]] and choose **Make V Fingers**.
4. In the Inspector's **Parameters**, change `finger_length` and press [[↩]].

![The Inspector with linked finger dimensions for the cylinder](/help/design-gripper-fingers/dimensions.png)

5. In **Layers**, select the object.
6. Press [[⌘K]] and choose **Test Grasp**.

![The selected cylinder's pickup Case in Simulate](/help/design-gripper-fingers/case.png)

7. Press [[⌘K]] and choose **Try Reference**.
8. In **Results**, click the saved try to inspect its recording.
9. On the timeline, click a point during the lift.

![The saved cylinder grasp try open on its timeline](/help/design-gripper-fingers/saved-try.png)

Choose **Make Flat Fingers** for flat gripping faces. With either profile, you keep the existing joints, actuator assignments and jaw travel.
The pair includes four M3 × 16 screws, four washers and four captive nuts.
Use Undo to remove the complete pair and its references together.

The Case keeps the selected object's dimensions, weight and friction. Basecase doesn’t shrink the object to make a grasp pass.
The reference eases the loaded lift when you use generated fingers.
Both jaws must hold the raised object until placement, then release it near the spot.
Palm contact alone and pushing without lifting don’t count as a grasp. Dropping the object before placement fails.
After changing finger dimensions, you must treat affected results as stale.

You can use generated fingers with the ordinary [Print and Kit outputs](/help/export-a-robot-kit).
