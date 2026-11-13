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

The robot stays linked to its assembly. After a change in Onshape, right-click the robot's group in Layers, or any of its parts, and choose Update from Onshape. It's in ⌘K too.

Basecase fetches the assembly again and matches it to the robot by Onshape's own ids. A part you lengthened is replaced where it sits. A new link and its mate come in as a part and a joint, and a part you deleted goes. Joint axes and limits follow their mates.

![The right-click menu of the Desk Arm group with Update from Onshape](/changelog/import-onshape-assemblies/update.png)

What you did in Basecase stays: the servo you gave a joint, colours, screws and cameras you added, poses and calibrations. If you delete a mate in Onshape, its joint stays, and Checks lists it under Missing Mates. One message says how many changes came in, and one ⌘Z undoes the whole update.

![The arm after the update, longer and with a new Wrist part, and the message 3 changes from Onshape](/changelog/import-onshape-assemblies/updated.png)

A link to a version always brings that version, so import from the workspace link to keep up with your edits. An assembly can have up to 300 different parts. A part linked from another document comes in only when the link points at a version.

Steps are in [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly).
