---
title: Export STEP assemblies
date: 2026-11-13
image: /changelog/export-step-assemblies/cover.png
---

You can now export your whole design as one STEP file. Fusion, Onshape and SolidWorks open it with each part as a named, colored body.

## Where it is

Click Export at the top right and choose STEP, between 3MF Plates and Scene. In ⌘K, it's Export STEP.

Export runs in the desktop app and asks where to save the file. The web demo can't export STEP.

![The Export menu open over a base plate with a Feetech STS3215 on it, STEP fourth in the list](/changelog/export-step-assemblies/cover.png)

![⌘K with Export STEP typed and the command highlighted](/changelog/export-step-assemblies/command.png)

The CAD kernel builds the file in its sandbox, off the main thread. While it works, a toast shows Exporting STEP… above the toolbar. A three-part scene takes about 3 seconds.

![The Exporting STEP… toast above the toolbar](/changelog/export-step-assemblies/exporting.png)

## What's in the file

You get one assembly, in millimeters, with Z up. Each visible part is its own named, colored body at its place in the scene, and each group becomes a sub-assembly.

Parts the agent wrote in replicad export as exact solids, and so do most basic shapes and booleans of them. You can pick their true curves and faces and dimension them.

Everything else, including catalog parts and imported meshes, exports as faceted solids. Basecase builds each one from its triangles and simplifies it to about 6,000 triangles. A faceted Feetech STS3215 adds about 5 MB.

## What's left out

Cutouts, hidden parts and reference images stay out of the file. Each part exports in its modeled state, whatever pose it's in.

If the kernel can't build a part, it exports the rest, and a toast says Exported STEP without 1 part.

An export stops after 5 minutes. To finish under that, hide the largest parts.

Read [Export a STEP file](/help/export-a-step-file) in the help center for the steps.
