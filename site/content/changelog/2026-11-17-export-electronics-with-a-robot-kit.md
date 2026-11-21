---
title: Export electronics with a robot kit
date: 2026-11-17
image: /changelog/export-electronics-with-a-robot-kit/cover.png
---

You can export a generated carrier board’s electrical sources alongside your robot’s mechanical manufacturing files in one Kit archive. To include fabrication files, you need current native KiCad acceptance.

Choose **Export** ▸ **Kit** to prepare both outputs from the same frozen design. For a dual-bus arm, you keep the carrier, its two JST headers and mounting hardware attached to the same packing and guide identities.

In the electrical folder, you get the editable schematic, board sources, placements, requirements and available validation evidence. In its manifest, you get electrical artifact hashes and source, geometry and board fingerprints. In the Kit manifest, you get the link between that evidence and the design fingerprint.

We classify the carrier as PCB fabrication and keep it out of FDM plates. Connector stock reduces what you need to buy, while the packing list retains the total assembly demand.

You can export diagnostic editable sources for an unrouted, stale or unsupported board. In its manifest and the export confirmation, you get an explicit report of missing fabrication. Software validation doesn’t establish electrical performance or physical assembly fit. Use Checks for the build-readiness verdict.

Follow the steps in [Export a robot kit](/help/export-a-robot-kit). Find file references in [Robot kit contents](/help/robot-kit-contents).
