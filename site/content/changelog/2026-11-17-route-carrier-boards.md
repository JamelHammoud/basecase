---
title: Route carrier boards locally
date: 2026-11-17
image: /changelog/route-carrier-boards/cover.png
---

You can now route supported carrier-board connections inside Basecase and download editable copper with checked fabrication files. You run the router on your computer in the desktop app.

Select a board to find **Route Board** in its Inspector. Before routing, you can set manufacturing inputs, with separate declarations for conductor dimensions and the two-layer stackup.

Until now, after placing a rover's headers and regulator, you had to transfer files to route their copper elsewhere. With the local router, you keep their placement, pad nets, mounting holes and source identities through KiCad validation.

You can route on two copper layers with straight tracks and through vias. You need KiCad 9.0.6 and the pinned local routing tools. If the board has existing copper, missing declarations or unsupported special requirements, you can't start routing and the board stays unchanged. If you cancel routing or edit the scene, you discard unfinished results.

You still export through **Schematic**. Before you can include fabrication files, Basecase reruns native DRC, connectivity and schematic parity checks. You can reopen a saved scene and export its copper for editing in KiCad. You still need to resolve unknown loads and electrical requirements in **Checks**.

Steps are in [Route a carrier board](/help/route-a-carrier-board).
