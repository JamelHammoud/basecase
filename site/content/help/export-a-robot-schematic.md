---
title: Export a robot schematic
date: 2026-11-16
collection: build-and-print
type: task
keywords:
  - KiCad
  - schematic
  - wiring
  - electrical
related:
  - build-checks
  - import-and-export-formats
hub_checks_and_blockers_order: 20
hub_checks_and_blockers: |
  **Electrical connections** checks documented pins, declared supplies and ground relationships. Missing pin maps, unknown loads and unresolved source requirements remain blockers.

  A clean KiCad electrical rules check doesn't clear those blockers or establish measured hardware performance. [Export a robot schematic](/help/export-a-robot-schematic) keeps the unresolved requirements with the editable project.
covers:
  - src/workspace/useSchematicExport.ts
  - src/workspace/schematicExport.ts
  - src/wiring/electricalPackage.ts
  - src/wiring/electricalChecks.ts
  - src/wiring/electricalModules.ts
  - src/wiring/boardPackage.ts
  - src/wiring/boardPcb.ts
---

Export the robot’s documented connections and unresolved electrical requirements to KiCad.

Treat each package as a draft. Cable lengths and quantities stay in Build. Resolve the package’s requirements before connecting hardware. A clean KiCad electrical rules check doesn’t establish board routing, power integrity, or measured hardware performance.

1. In the right panel, click **Build**.
2. In **Checks**, open **Electrical connections**.
3. In the title bar, click **Export**.
4. In the export menu, choose **Schematic**.

![The Schematic export menu above a gripper’s electrical requirements](/help/export-a-robot-schematic/export.png)

5. From Downloads, extract the ZIP.
6. In KiCad, open `robot/robot.kicad_pro` from the extracted folder.

Read `robot/requirements.json` alongside the schematic. You’ll find unresolved interfaces, source-backed terminal references, supply requirements, and unknown loads. In `robot/source.json`, you can review the electrical inputs used for the fingerprint.

If the scene contains a board definition, the ZIP also includes `robot.kicad_pcb`, local footprints and `placement.json`. Read the placement requirements alongside the PCB. Copper remains unrouted. The export doesn’t establish assembly fit or electrical performance. [Fit an electronics board](/help/fit-an-electronics-board) describes placement and mechanical checks.

For a tethered robot, use **Servo voltage** and **Supply current** in **Checks** to change the declared volts and amps. Those controls don’t change a selected product’s ratings.

![Electrical connections reports a supply setting that disagrees with the selected module](/help/export-a-robot-schematic/supply.png)

You can choose **Schematic** in [[⌘K]].

The project targets KiCad 9.0.6. The bundled README lists validation commands for the exported draft. You can find documentation for these commands in the [KiCad CLI manual](https://docs.kicad.org/9.0/en/cli/cli.html).
