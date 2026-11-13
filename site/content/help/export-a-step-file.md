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

Hand your design to Fusion, Onshape, SolidWorks or any CAD tool that opens STEP, for drawings, tolerancing or a machinist. STEP export runs in the desktop app.

1. Click **Export** at the top right.
2. Choose **STEP**.
3. Pick where to save the file.

![The Export menu with STEP](/help/export-a-step-file/export-menu.png)

You can also press ⌘K and choose **Export STEP**.

![Export STEP in ⌘K](/help/export-a-step-file/command.png)

The file is one assembly in millimetres, Z up. Each visible part is its own body with its name and colour, placed where it sits in the scene, inside a sub-assembly for its group. Cutouts, hidden parts and reference images are left out, and parts are exported as modelled, not as posed.

Parts the agent modelled in replicad, most basic shapes, and Union, Subtract and Intersect results made from them arrive as exact solids, with true curves and flat faces. Catalog parts, imported meshes and everything else arrive as faceted solids made from their triangles, simplified to about 6,000 triangles each. If a part can't be included, a message says how many were left out.
