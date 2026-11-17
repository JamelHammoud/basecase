---
title: Fit an electronics board
date: 2026-11-16
image: /changelog/fit-an-electronics-board/cover.png
---

You can fit supported connectors and regulators onto a board inside your robot, then export the placement for editing in KiCad. You still need to route the copper.

Your rover’s regulator can fit on its chassis while its plug still hits the battery. With board fit, you check scene geometry and declared plug access as separate checks from electrical readiness. You need the missing geometry before you can complete the fit.

The board starts as a 100 × 80 × 1.6 mm carrier with four mounting holes and catalog mounting hardware. Its dimensions, position, clearances and individual placements are editable in the Inspector.

Automatic placement keeps locked components in place and tries up to 50,000 candidate positions. If the search finds no fit, you keep every component and the original outline. Connector purchases join the existing BOM without duplicating modules.

You can start with JST B3B-EH-A headers for ROBOTIS XL330-M288 interfaces and Pololu D36V50F5, D36V50F6 and D36V50F12 regulators. For other interfaces, you retain the unresolved requirements.

With schematic export, you get the PCB, project-local footprints, product references and a source fingerprint. You keep the board’s identities and placement when you save and reopen. You still need to handle routing, fabrication and physical assembly validation as separate work.

Steps are in [Fit an electronics board](/help/fit-an-electronics-board).
