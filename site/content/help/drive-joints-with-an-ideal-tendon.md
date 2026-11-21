---
title: Drive joints with an ideal tendon
date: 2026-11-20
collection: simulate-and-train
type: task
hub_the_design_agent: |
  Ask the agent to connect a catalog motor spool to passive joints. [Drive joints with an ideal tendon](/help/drive-joints-with-an-ideal-tendon) keeps motor actions separate from joint observations.
related:
  - make-a-joint-passive
  - try-a-case
covers:
  - src/components/pose/TendonEditor.tsx
  - src/components/pose/TendonLawFields.tsx
  - src/workspace/useTendonEdit.ts
  - src/joints/tendons.ts
  - src/sim/mjcfTendons.ts
---

Connect a catalog motor spool to passive joints, then simulate and record their separate motions.

In the [Remote elbow scene](/help/drive-joints-with-an-ideal-tendon/remote-elbow.basecase), you can connect a catalog motor spool to a passive elbow.

The motor needs a bounded hinge and one catalog actuator. Before you connect the tendon, [make the output joints passive](/help/make-a-joint-passive).

1. In **Pose**, right-click the motor spool joint.
2. Choose **Edit Tendon**.
3. In **Spool**, enter the spool's signed coefficient in mm/rad.
4. Set each output joint's signed coefficient in mm/rad for a hinge or mm/mm for a slider.
5. To add another passive output, click **Add Joint**.
6. In **Law**, choose **Fixed length** or **Elastic**.
7. Click **Save**.

![The Remote elbow tendon editor with signed spool and output coefficients](/help/drive-joints-with-an-ideal-tendon/editor.png)

8. In **Pose**, set the motor spool's starting angle.
9. In [[⌘K]], choose **Simulate**.

![The Remote elbow running in Simulate](/help/drive-joints-with-an-ideal-tendon/simulation.png)

To open the editor, you can select the motor joint and choose **Edit Tendon** in [[⌘K]].
Click **Delete** in the editor to delete the tendon after confirmation. Click **Cancel** to discard unsaved edits.

With a shared tendon, you constrain total excursion. Loads and springs determine how underactuated output joints share that motion.
You can use the model to predict ideal transmission behavior. It doesn’t account for routing, slack, friction or durability measurements.
You can't use these tendon declarations for training, IK or robot deployment.

[Try a Case](/help/try-a-case) to save motor actions and independent joint observations, then reopen the try from Results.
In Robot Package exports, you retain the MJCF coupling, with the URDF transmission extension marked as unsupported.
