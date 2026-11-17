---
title: Fit an electronics board
date: 2026-11-16
collection: build-and-print
type: task
keywords:
  - PCB
  - KiCad
  - connectors
related:
  - export-a-robot-schematic
  - build-checks
hub_checks_and_blockers_order: 21
hub_checks_and_blockers: |
  **Board fit** checks the board outline, mounting hardware, component clearance and plug access against prepared scene geometry. Missing geometry and unsupported footprints remain blockers.

  Electrical readiness stays separate. Exported placement starts without routed copper. [Fit an electronics board](/help/fit-an-electronics-board) covers placement and export.
covers:
  - src/workspace/useBoard.ts
  - src/components/build/BoardBuildAction.tsx
  - src/components/inspector/BoardSection.tsx
  - src/components/inspector/BoardPlacementFields.tsx
  - src/components/inspector/BoardHoleFields.tsx
  - src/components/inspector/BoardKeepoutFields.tsx
  - src/wiring/boardProducts.ts
  - src/wiring/boardPowerProducts.ts
  - src/wiring/boardPurchases.ts
  - src/wiring/boardPcb.ts
---

Place supported connectors and regulators inside your robot, then export their editable KiCad placement.

1. In the right panel, click **Build**.
2. In **Build**, click **Define Board**.
3. In the Inspector, edit the board’s dimensions and position.
4. In **Board**, set the component side and clearances.
5. In **Mounting holes**, edit the holes around your mounting points.
6. In a component’s section, edit **X**, **Z** and rotation.
7. In that section, turn on **Locked** to preserve its placement during arrangement.

![The rover board Inspector with dimensions and a locked JST B3B-EH-A connector](/help/fit-an-electronics-board/placement.png)

8. In the right panel, click **Build**.
9. In **Checks**, open **Board fit**.

![The rover’s Board fit check passes while electrical requirements remain unresolved](/help/fit-an-electronics-board/fit.png)

[Export a robot schematic](/help/export-a-robot-schematic) explains how to download and open the KiCad project. With a board definition, the package includes the PCB, schematic, local libraries, exact product references and placement requirements. The initial export stays unrouted. [Import a routed board](/help/import-a-routed-board) brings copper back after routing in KiCad. Placement alone doesn’t establish fabrication readiness or physical assembly fit.

You can start with JST B3B-EH-A headers for ROBOTIS XL330-M288 interfaces and Pololu D36V50F5, D36V50F6 and D36V50F12 regulators. These are the initial supported products. Other interfaces remain unresolved. Servos stay off the PCB.

The board starts at 100 × 80 × 1.6 mm with four M3 mounting holes, screws and 10 mm standoffs. Check its position against your robot. The initial position doesn’t establish usable enclosure space.

The app adds new connector quantities to the BOM and counts existing regulators and their supplied headers once. The regulator placement uses its supplied straight headers between the module and carrier, with their short tails in the carrier. You need to solder both boards.

If the outline is too small, **Board fit** reports a blocker. The app keeps the board size and every requested placement.

![Board fit reports mounting holes and components outside the shrunken outline](/help/fit-an-electronics-board/outline.png)

Use **Edit Board** in Build to return to the Inspector. **Auto Arrange** places unlocked components and adds supported endpoints introduced since you defined the board. It preserves unresolved requirements.

Use **Add Hole** or **Add Keepout** for more constraints. If you delete a mounting hole, the app asks for confirmation, then removes the hole and its linked screw and standoff.

You can choose **Define Board**, **Edit Board** and **Arrange Board** in [[⌘K]]. Save the scene to retain placement identities and locks.

[Export a robot schematic](/help/export-a-robot-schematic) explains the electrical requirements that remain beside the board.
