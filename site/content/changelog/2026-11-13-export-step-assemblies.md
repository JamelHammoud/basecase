---
title: Export STEP assemblies
date: 2026-11-13
image: /changelog/export-step-assemblies/cover.png
---

STEP saves the whole design as one file that Fusion, Onshape and SolidWorks open, with each part a named, coloured body. Agent-modelled parts and basic shapes arrive as exact solids; catalog parts and meshes arrive faceted.

## Where it is

Click Export at the top right and choose STEP, between 3MF Plates and Scene. It's also Export STEP in ⌘K. It runs in the desktop app, not the web demo, and asks where to save the file. Steps are in [Export a STEP file](/help/export-a-step-file).

![The Export menu open over a base plate with a Feetech STS3215 on it, STEP fourth in the list](/changelog/export-step-assemblies/cover.png)

![⌘K with Export STEP typed and the command highlighted](/changelog/export-step-assemblies/command.png)

While the file is built, Exporting STEP… shows in a toast. A three-part scene takes about 3 seconds. The CAD kernel builds it in its sandbox, off the main thread.

![The Exporting STEP… toast above the toolbar](/changelog/export-step-assemblies/exporting.png)

## What's in the file

One assembly in millimetres, Z up. Each visible part is its own named, coloured body, placed where it sits in the scene. Each group becomes a sub-assembly.

Parts the agent wrote in replicad come out as exact solids, and so do most basic shapes and booleans made from them. Their curves and faces stay true, so you can pick and dimension them. Catalog parts, imported meshes and everything else come out as faceted solids built from their triangles, simplified to about 6,000 triangles each. A faceted Feetech STS3215 adds about 5 MB.

## What's left out

Cutouts, hidden parts and reference images aren't exported, and parts are exported as modelled, not as posed. If a part can't be built, the rest still export and a toast says Exported STEP without 1 part, so nothing goes missing silently. An export that runs past 5 minutes stops; hiding the largest parts gets it under.
