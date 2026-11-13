---
title: Import Onshape assemblies as robots
date: 2026-11-12
image: /changelog/import-onshape-assemblies/pose.png
---

You can now paste an Onshape assembly's link into Import Robot and get a robot whose revolute and slider mates are joints. It needs the desktop app.

![Import Robot with an Onshape assembly link pasted into the link field](/changelog/import-onshape-assemblies/link.png)

Before, an Onshape robot had to leave as an exported URDF before it could move in Basecase.

The first import asks for an Onshape API key, added in Settings ▸ Accounts. Basecase keeps the key encrypted and sends it only to cad.onshape.com.

![The Accounts pane in Settings with the Onshape access key and secret key saved, and the account name under Secret key](/changelog/import-onshape-assemblies/accounts.png)

Each part becomes its own mesh. Parts held by a fastened mate or a mate group fuse into one, so a bracket and its screws move together. The part you fixed in Onshape is the base. A part with a material brings its mass and centre of mass.

A joint turns or slides along its mate connector's Z axis, within the mate's limits. Zero is wherever the assembly sat when you imported it. So a mate limited to -90° to 45°, on an arm modelled turned by 30°, comes in as -120° to 15°.

Only revolute and slider mates move. A cylindrical, ball, pin slot or planar mate is held fixed. The Build tab's Checks list each one under Fixed Mates, on the part it holds. A mate that closes a loop, like the last pin of a four-bar linkage, is left out. Each part hangs off exactly one joint.

An import reads the assembly once, so a change in Onshape needs another import. An assembly can have up to 300 different parts. A part linked from another document comes in only when the link points at a version.

Steps are in [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly).
