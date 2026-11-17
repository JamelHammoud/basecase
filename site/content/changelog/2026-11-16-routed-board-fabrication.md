---
title: Bring routed boards back into the robot
date: 2026-11-16
image: /changelog/routed-board-fabrication/cover.png
---

You can import a routed KiCad board and export fabrication files tied to the current robot. You'll need KiCad 9.0.6 for native validation and fabrication output.

Use **Import Board** in the board Inspector, then **Schematic** in **Export** to get the checked package. For a dual-bus arm, you can keep both connector footprints and route their copper connections in KiCad.

On import, Basecase checks exact footprint, pad, net and mounting identities. It keeps copper and manufacturing settings through scene saves and history. If you change the supply or geometry, prior evidence becomes stale.

After a supported pass, you get seven Gerber layers, separate plated and non-plated drills, the editable board, file hashes and native reports. The package keeps source references and declared manufacturing limits with those files.

The first subset supports two copper layers, straight tracks and through vias. Basecase refuses external placement changes, zones, arcs and external assets. DRC doesn't establish current capacity or thermal performance. You can still see existing robot blockers in Checks.

Read [Import a routed board](/help/import-a-routed-board) and [Export board fabrication files](/help/export-board-fabrication-files) for the steps.
