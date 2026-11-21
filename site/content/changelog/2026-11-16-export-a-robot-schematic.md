---
title: Export robot wiring to KiCad
date: 2026-11-16
image: /changelog/export-a-robot-schematic/cover.png
---

You can export your robot’s documented connections and power requirements as an editable KiCad project from **Export** ▸ **Schematic**. You can see unresolved interfaces in the draft.

For a six-servo arm with a bus order in Basecase, you used to have to enter its connector assignments again in KiCad. You can export the known pin maps with the design.

In each ZIP, you get the schematic, its symbol library, a requirements report, and a fingerprint of the electrical inputs. The exporter targets KiCad 9.0.6. Separate servo buses keep their own data nets, and supported components retain their catalog identities and terminal references.

You still need to resolve unknown loads, unsupported pin maps, fuse selection, and missing host connections. You open each package as a draft, and Checks remains the build verdict. A clean schematic ERC doesn’t establish board routing, power integrity, or measured hardware behavior.

Steps are in [Export a robot schematic](/help/export-a-robot-schematic).
