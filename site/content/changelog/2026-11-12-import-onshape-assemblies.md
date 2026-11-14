---
title: Import Onshape assemblies as robots
date: 2026-11-12
image: /changelog/import-onshape-assemblies/pose.png
---

You can now import an Onshape assembly as a robot. Paste the assembly's link into Import Robot, and its revolute and slider mates come in as joints.

This needs the desktop app.

![Import Robot with an Onshape assembly link pasted into the link field](/changelog/import-onshape-assemblies/link.png)

Until now, you had to export an Onshape robot as a URDF before it could move in Basecase.

The first time you import, Basecase asks for an Onshape API key. You add it in **Settings** ▸ **Accounts**. Basecase keeps the key encrypted and sends it only to cad.onshape.com.

![The Accounts pane in Settings with the Onshape access key and secret key saved, and the account name under Secret key](/changelog/import-onshape-assemblies/accounts.png)

## Parts and Joints

Each part becomes its own mesh. Parts held together by a fastened mate or a mate group are fused into one, so a bracket and its screws move together. The part you fixed in Onshape is the base. A part with a material brings its mass and center of mass.

A joint turns or slides along its mate connector's Z axis, within the mate's limits. Zero is wherever the assembly sat when you imported it. So if a mate is limited to -90° to 45° and the arm was modeled turned by 30°, the joint comes in as -120° to 15°.

## What Moves

Only revolute and slider mates move. Cylindrical, ball, pin slot and planar mates are held fixed, and the Build tab's Checks list each one under Fixed Mates, on the part it holds.

A mate that closes a loop, like the last pin of a four-bar linkage, is left out. Each part hangs off exactly one joint.

## Update from Onshape

The robot stays linked to its assembly. When you change something in Onshape, right-click the robot's group in Layers, or any of its parts, and choose Update from Onshape. It's in ⌘K too.

Basecase fetches the assembly again and matches it to the robot by Onshape's own ids. A part you lengthened is replaced where it sits, and a part you deleted is removed. A new link comes in as a part, and its mate as a joint. Joint axes and limits follow their mates.

![The right-click menu of the Desk Arm group with Update from Onshape](/changelog/import-onshape-assemblies/update.png)

What you did in Basecase stays: the servo you gave a joint, colors, the screws and cameras you added, poses and calibrations. If you delete a mate in Onshape, its joint stays, and Checks lists it under Missing Mates.

One message tells you how many changes came in, and one ⌘Z undoes the whole update.

![The arm after the update, longer and with a new Wrist part, and the message 3 changes from Onshape](/changelog/import-onshape-assemblies/updated.png)

## Versions and Linked Parts

A link to a version always brings that version. To keep up with your edits, import from the workspace link instead.

An assembly can have up to 300 different parts. A part linked from another document only comes in when the link points at a version.

Read [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly) in the help center for the steps.
