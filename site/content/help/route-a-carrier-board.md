---
title: Route a carrier board
date: 2026-11-17
collection: build-and-print
type: task
keywords:
  - autorouter
  - copper
  - Freerouting
related:
  - fit-an-electronics-board
  - export-board-fabrication-files
covers:
  - src/components/inspector/BoardRoutingFields.tsx
  - src/components/inspector/BoardFabricationFields.tsx
  - src/workspace/useBoardRouting.ts
  - src/workspace/useSchematicExport.ts
  - electron/electrical/route.mjs
hub_checks_and_blockers_order: 22
hub_checks_and_blockers: |
  Route supported carrier connections locally, then download editable copper and checked fabrication files. [Route a carrier board](/help/route-a-carrier-board) covers the required declarations and limits.
---

You can connect a placed carrier's supported pads with editable copper and download its checked fabrication files.

You need the desktop app to route a board.

Start by [fitting an electronics board](/help/fit-an-electronics-board). You can route with two copper layers, straight tracks and through vias. You can't use automatic routing with existing copper or special requirements, including differential pairs and controlled impedance.

Install KiCad 9.0.6 and the pinned local routing tools on the computer running Basecase. Follow the [Build installation instructions](https://github.com/JamelHammoud/basecase/blob/main/docs/guide/build.md#local-board-routing) for the installer and host configuration. You don't need an account or hosted service to route a board.

1. In [[⌘K]], choose **Edit Board**.
2. In the Inspector, open **Fabrication**.
3. In **Fabrication**, enter **Source**, **Minimum clearance**, **Minimum track width** and **Minimum drill** from your manufacturing requirements.
4. In the Inspector, open **Routing**.
5. In **Routing**, enter your electrical design evidence URL in **Source**.
6. In **Routing**, enter **Track width**, **Copper clearance**, **Via diameter**, **Via drill** and **Copper thickness** in millimeters.
7. In **Routing**, enter **Dielectric material**, **Dielectric permittivity** and **Dielectric loss tangent** from your declared stackup.

![The rover Inspector records fabrication minimums and separate routing dimensions and stackup properties](/help/route-a-carrier-board/requirements.png)

8. In **Board**, click **Route Board**.

![The routed rover retains electrical findings in Build after native validation](/help/route-a-carrier-board/routed.png)

9. In **Export**, choose **Schematic**.
10. From Downloads, extract the ZIP.

You can choose **Route Board** in [[⌘K]]. To stop routing and keep the previous board, click **Cancel**. If you edit the scene during routing, Basecase discards obsolete results. Use Undo to restore the unrouted board and redo to restore its copper.

Manufacturing minimums don't establish conductor current capacity. Declare separate routing dimensions using your electrical design evidence. You still need to resolve missing loads, thermal evidence and other electrical requirements in **Checks**.

If routing fails, Basecase leaves the board unchanged. Fix placement or missing requirements before you retry. For unsupported circuits or an existing routed board, use [Import a routed board](/help/import-a-routed-board).

See [Export board fabrication files](/help/export-board-fabrication-files) for the native checks and files in the ZIP. Use **Checks** for the whole robot's build verdict.
