---
title: Reuse an assembly in Cases
date: 2026-11-16
collection: simulate-and-train
type: task
related:
  - make-a-joint-passive
  - save-a-model-to-the-library
  - export-an-stl-file
covers:
  - src/cases/fixtureAssembly.ts
  - src/cases/fixtureCaptureClient.ts
  - src/cases/fixtureCaptureHandlers.ts
  - src/cases/fixtureCollision.ts
  - src/cases/householdGoals.ts
  - src/cases/chestGoal.ts
  - src/cases/reusedFixture.ts
  - src/components/cases/CaseFixtureChoice.tsx
  - src/components/cases/useCaseDraft.ts
hub_run_a_case_order: 80
hub_run_a_case: |
  ### Reusable assemblies

  Save a passive assembly, reuse it in another Case, and test opening, placing and closing. [Reuse an assembly in Cases](/help/reuse-an-assembly-in-cases).
---

Test a robot against your own articulated fixture, then change its design and run the same task again.

Use an assembly with passive hinges or sliders with limits, and select every connected part. Each moving joint needs its own linked parts. You can't use closed loops or powered fixture joints.

1. In **Layers**, select every part in the assembly.
2. In the selection's menu, choose **Save to Library**.

   ![The Toy chest assembly selected in Layers with Save to Library in its menu](/help/reuse-an-assembly-in-cases/selection.png)

3. Open the scene with your robot arm and gripper.
4. In **Play** ▸ **Cases**, click **New Case**.
5. Under **Goal**, choose **Put Away a Block**.
6. Under **Fixture**, choose the saved chest.
7. Set **Width** to 100 mm.

   ![New Case with Toy chest selected as the fixture and Width set to 100 mm](/help/reuse-an-assembly-in-cases/builder.png)

8. Click **Make Case**.
9. In **Try**, click **Try Reference**.
10. Under **Results**, open the saved try.

   ![The saved chest chore open on its recorded timeline](/help/reuse-an-assembly-in-cases/recorded-try.png)

To complete the chest task, your robot must open the lid, lift the block, place it inside and close the lid. If the robot drops the block or leaves the lid open, it fails the task.

Use **Depth**, **Height**, **Lower stop**, **Travel**, **Weight**, **Joint friction**, **Damping**, **Return spring** and **Rest position** to change the fixture. Hold the pointer over a physical value's unit to check whether you have a supplied value or an estimate. For weight estimates, Basecase uses bounding volume, including for hollow parts.

You can edit one Case without changing the saved model or other Cases. If you change the physics, earlier evidence is out of date. In recorded tries, you keep the original physics and motion.

To print or export the geometry, insert the saved model from **Library** into a scene. Use the existing [Export an STL file](/help/export-an-stl-file) and printing checks. You can't measure physical fit or force through simulation.

For a single interaction, choose a lid, cupboard, drawer, door, lever, knob, spring button, bin or gate goal. You can find **Save to Library** in [[⌘K]].
