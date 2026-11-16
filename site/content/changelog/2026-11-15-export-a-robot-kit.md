---
title: Export your robot as a kit
date: 2026-11-15
image: /changelog/export-a-robot-kit/cover.png
---

You can export a robot's plates, build instructions and packing lists together through **Export** ▸ **Kit**. You get an archive with a servo sheet that includes the identities in `joint_map.json`.

A friend helping assemble your robot needs all the screws in each bag, including the ones you own. With Kit, you keep assembly quantities separate from the bill of materials' remaining purchases. In the packing sheets, you can find the module and guide step for each row. Supplies without a step stay marked as unassigned.

You get one 3MF per material, an illustrated HTML build guide and CSV packing and servo sheets. In the JSON manifest, you can find each printed part's plate, plus materials, infill, catalog variants and the freshness of existing Checks. The archive has a 256 MB limit before compression.

You can't export with sheet fabrication or missing identities. You retain the markings on unproven assembly steps. You don't change readiness or program servos by exporting. If you make an edit during preparation, Basecase discards the result.

Steps are in [Export a robot kit](/help/export-a-robot-kit).
