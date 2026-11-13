---
title: Import Onshape assemblies as robots
date: 2026-11-12
image: /changelog/import-onshape-assemblies/pose.png
---

You can now paste an Onshape assembly's link into Import Robot and get a robot. Its revolute and slider mates come in as joints with their limits.

First add an Onshape API key with read access in Settings ▸ Accounts. Basecase keeps the access and secret keys encrypted and sends them only to cad.onshape.com. Your Onshape account name shows once both are saved.

![The Accounts pane in Settings with the Onshape access key and secret key saved, and the account name under Secret key](/changelog/import-onshape-assemblies/accounts.png)

Then copy the assembly tab's link, choose Import Robot in ⌘K and paste it. The same field takes URDF, MJCF, GitHub and zip links.

![Import Robot with an Onshape assembly link pasted into the link field](/changelog/import-onshape-assemblies/link.png)

Parts held by a fastened mate or a mate group fuse into one, so a bracket and its screws move as one. Each joint runs along its mate connector's Z axis, within the mate's limits. Its 0 is wherever the assembly sat on import. So a mate limited to -90° to 45°, on an arm modelled turned by 30°, comes in as -120° to 15°.

Your fixed part becomes the base. Parts with an Onshape material bring their mass and centre of mass; parts without one have none. The message that announces the robot has a Pose button.

Cylindrical, ball, pin slot and planar mates are held fixed. Checks in the Build tab lists each under Fixed Mates, so you can add the joint by hand. A mate that closes a loop, like a four-bar linkage's last pin, is left out without a note.

An import reads the assembly once, so changes in Onshape need another import. It takes up to 300 different parts. A part linked from another document comes in only when the link points at a version. Importing from Onshape needs the desktop app.

Steps are in [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly).
