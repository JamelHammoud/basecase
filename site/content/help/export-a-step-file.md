---
title: Export a STEP file
date: 2026-11-13
collection: files-and-sharing
type: task
order: 7
covers:
  - src/workspace/useStepExport.ts
  - src/workspace/stepExport.ts
  - src/workspace/stepSolids.ts
  - src/components/ExportMenu.tsx
  - src/workspace/exchangeCommands.tsx
  - electron/cad-kernel/stepAssembly.mjs
---

You can export your design as a STEP file to open it in Fusion, Onshape, SolidWorks or any other CAD tool that reads STEP. Use it for drawings and tolerancing, or to send your design to a machinist. STEP export works in the desktop app.

1. Click **Export** at the top right.
2. Choose **STEP**.
3. Pick where to save the file.

![The Export menu with STEP](/help/export-a-step-file/export-menu.png)

Or press [[⌘K]] and choose **Export STEP**.

![Export STEP in ⌘K](/help/export-a-step-file/command.png)

The file contains one assembly, in millimeters with Z up. Each visible part is a separate body with its own name and color, placed where it sits in the scene, and parts in a group go into a sub-assembly for that group. Parts are exported as modeled, and poses aren't applied. Cutouts, hidden parts and reference images aren't included.

These parts arrive as exact solids, with true curves and flat faces:

- Parts the agent modeled in replicad
- Most basic shapes
- Union, Subtract and Intersect results made from those parts

Catalog parts, imported meshes and everything else arrive as faceted solids built from their triangles, each simplified to about 6,000 triangles. A basic shape with filleted or chamfered edges is exported this way too.

If a part can't be included, a message tells you how many parts were left out.
