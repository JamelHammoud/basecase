---
title: Make an assembly cradle
date: 2026-11-20
collection: build-and-print
covers:
  - src/components/build/CradleSheet.tsx
  - src/components/build/CradleBarActions.tsx
  - src/workspace/useAssemblyCradle.ts
  - src/workspace/assemblyCradleActions.ts
  - src/print/cradleJob.ts
---

Make temporary tooling to hold an assembly at a step, then export its plate without adding anything to the robot.

1. In **Build**, click **Build Along**.
2. Above the canvas, click **Make Assembly Cradle**.
3. In **Subassembly**, choose a part or a declared rigid body.
4. In **Resting face**, choose the face to rest on the cradle's base.
5. In **Clearance**, enter the space around the assembly.
6. In **Base thickness**, enter the base's thickness.
7. In **Support depth**, enter how far the walls rise around the assembly.
8. Click **Make Assembly Cradle**.
9. Click **Print**.
10. Press [[⌘K]], then choose **Export 3MF Plates**.
11. Press [[Esc]] to return to the same assembly step.
12. Above the canvas, click **Show Removal**.

![The cradle options with a subassembly and resting face selected](/help/make-an-assembly-cradle/options.png)

You can see the cradle's dimensions in the prepared result. If you change an option, you clear that result. Make the cradle again before opening Print.

![The prepared cradle with its dimensions and Print action](/help/make-an-assembly-cradle/prepared.png)

In Print, you have one temporary cradle. Its 3MF retains the source scene, assembly step, selected part identities and dimensions.

![The temporary assembly cradle on its Print plate](/help/make-an-assembly-cradle/print.png)

Click **Show Removal** to move the tooling away from the assembly. Click **Use Cradle** to restore its working position.

![The cradle moved below the subassembly to show removal](/help/make-an-assembly-cradle/removal.png)

There are no measurements of holding strength or physical printer fit. You can't establish either through geometric checks.

The cavity clears the assembly's convex footprint, so you may find extra space in concave recesses. You won't get locating pins in internal holes.

For driver clearance, Basecase uses the guide's reference tool envelopes.

Choose a face with enough planar support. Basecase refuses undercuts, unsupported source geometry, blocked insertion or driver paths, unresolved tools and plates that don't fit.

You clear the tooling if you edit the source, switch scenes or move to another assembly step. If you close the options during generation, you stop that work without changing the robot.

You can access the same action through [[⌘K]] as **Make Assembly Cradle** while Build Along has a current step. Continue with [Print a robot's parts](/help/print-a-robots-parts).
