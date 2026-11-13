---
title: Export STEP assemblies
date: 2026-11-13
image: /changelog/export-step-assemblies/cover.png
---

STEP Assembly, in the Export menu and as Export STEP in ⌘K, saves the whole design as one STEP file that Fusion, Onshape and SolidWorks open, each part a named, coloured body in its group. Parts the agent modelled in replicad and basic shapes arrive as exact solids; catalog parts and meshes arrive faceted.

## Where it is

Click Export at the top right and choose STEP Assembly, between 3MF Plates and Basecase Scene. It's also Export STEP in ⌘K. It runs in the desktop app, not the web demo, and asks where to save the file.

![The Export menu open over a base plate with a Feetech STS3215 on it, STEP Assembly fourth in the list](/changelog/export-step-assemblies/cover.png)

![⌘K with Export STEP typed and the command highlighted](/changelog/export-step-assemblies/command.png)

While the file is built, a toast says Exporting STEP…. A three-part scene takes about 3 seconds. The CAD kernel builds it in its sandbox, off the main thread.

![The Exporting STEP… toast above the toolbar](/changelog/export-step-assemblies/exporting.png)

## What's in the file

One assembly in millimetres, Z up. Each visible part is its own body with its name and colour, placed where it sits in the scene, and each group becomes a sub-assembly with its parts inside.

Parts the agent wrote in replicad, most basic shapes, and Union, Subtract and Intersect results made from them come out as exact solids, with true curves and flat faces you can pick and dimension. Catalog parts, imported meshes and everything else come out as faceted solids built from their triangles, simplified to about 6,000 triangles each. A faceted Feetech STS3215 adds about 5 MB.

## What's left out

Cutouts, hidden parts and reference images aren't exported, and parts are exported as modelled, not as posed. If a part can't be built, the rest still export and a toast says Exported STEP without 1 part, so nothing goes missing silently. An export that runs past 5 minutes stops; hiding the largest parts gets it under.
