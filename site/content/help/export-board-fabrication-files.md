---
title: Export board fabrication files
date: 2026-11-16
collection: build-and-print
type: task
keywords:
  - Gerber
  - Excellon
  - KiCad
  - drill
related:
  - import-a-routed-board
  - build-checks
covers:
  - src/components/inspector/BoardFabricationFields.tsx
  - src/workspace/schematicExport.ts
  - src/wiring/boardRoutingPackage.ts
  - electron/electrical/validate.mjs
hub_checks_and_blockers_order: 23
hub_checks_and_blockers: |
  **Schematic** can include Gerbers, separate plated and non-plated drills, the routed source and validation hashes. [Export board fabrication files](/help/export-board-fabrication-files) covers the required process inputs.
---

Download fabrication layers and drills with source identities, hashes and current KiCad validation reports in the desktop app.

Install KiCad 9.0.6 on the computer running Basecase. Before you export, [import a routed board](/help/import-a-routed-board) with an explicit stackup. In the stackup, declare copper thicknesses and a dielectric's material, permittivity and loss tangent.

1. In [[⌘K]], choose **Edit Board**.
2. In the Inspector, open **Fabrication**.
3. In **Fabrication**, set **Source** to your board maker's manufacturing-rules URL.
4. In **Minimum clearance**, enter your process limit in millimeters.
5. In **Minimum track width**, enter your process limit in millimeters.
6. In **Minimum drill**, enter your process limit in millimeters.

![The board Inspector records a manufacturing source and three declared minimums](/help/import-a-routed-board/manufacturing.png)

7. In **Export**, choose **Schematic**.
8. From Downloads, extract the ZIP.

The example uses declared limits of 0.2 mm clearance, 0.25 mm track width and 0.3 mm drill diameter. Don't use these values as a current-capacity calculation. Use limits that meet your selected manufacturing process.

The package includes seven Gerbers, separate plated and non-plated Excellon drills, the Gerber job, and the editable routed board. You can find file hashes in `manifest.json` and the native report with its source binding in `validation.json`.

Basecase leaves fabrication files out if you have missing inputs, stale source, DRC violations, incomplete connections, schematic mismatches or board-fit blockers. You can still access the editable board and requirements.

You can't use DRC to establish current capacity, thermal performance or physical electrical behavior. Unknown electrical requirements remain blockers in **Checks**. Exporting fabrication files doesn't mean the whole robot is ready to build.
