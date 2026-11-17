---
title: Import a routed board
date: 2026-11-16
collection: build-and-print
type: task
keywords:
  - KiCad
  - PCB
  - copper
related:
  - fit-an-electronics-board
  - export-board-fabrication-files
covers:
  - src/workspace/useRoutedBoard.ts
  - src/components/inspector/BoardSection.tsx
  - src/wiring/boardRoutedSource.ts
  - src/wiring/boardReconcile.mjs
hub_checks_and_blockers_order: 22
hub_checks_and_blockers: |
  Import routed KiCad copper while keeping the robot's exact footprints, connections and mounting geometry. [Import a routed board](/help/import-a-routed-board) covers source matching and current findings.
---

Import routed copper from KiCad into your robot while keeping its footprint identities and mounting geometry.

You can import boards from KiCad 9.0.6 with two copper layers, straight tracks and through vias. You can't import zones, arcs or external assets. The board file limit is 8 MiB. Keep footprint placement, pads, outline, thickness and mounting holes unchanged.

1. In **Export**, choose **Schematic**.
2. From Downloads, extract the ZIP.
3. In KiCad, route `robot/robot.kicad_pcb`.
4. In KiCad, define the two-layer stackup with the exported board thickness.
5. In KiCad, save the routed `.kicad_pcb` file.
6. In [[⌘K]], choose **Edit Board**.
7. With **Import Board**, choose the routed `.kicad_pcb` file.

![The imported board's electrical requirements remain in Build](/help/import-a-routed-board/requirements.png)

Basecase runs KiCad DRC and schematic parity checks on import. You can review shorts and missing connections in the findings. If KiCad is missing, the checks remain unresolved. You keep the copper and its manufacturing settings in the scene when you save, reopen, undo or redo.

You can import a board with a shared coordinate translation if every footprint, hole and outline edge matches. You keep the robot and its modules in their original positions during import.

The source fingerprint must match the current electrical inputs and prepared geometry. If those inputs change, export a fresh board before rerouting it.

![Electrical connections reports stale routed-board evidence after a supply edit](/help/import-a-routed-board/stale.png)

Use [Export board fabrication files](/help/export-board-fabrication-files) to record manufacturing limits and check the output against the current robot.
