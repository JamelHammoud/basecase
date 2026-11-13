---
title: Import Onshape assemblies as robots
date: 2026-11-12
image: /changelog/import-onshape-assemblies/pose.png
---

Paste an Onshape assembly's link into Import Robot and it comes in as a robot, its revolute and slider mates as joints with their limits and its parts weighed by their Onshape materials.

## Where it is

Onshape needs to know it's you, so the first step is an API key. Create one in Onshape's developer portal with read access to your documents, then open Settings with ⌘, and choose Accounts. Paste the access key into Access key and the secret key into Secret key. Once both are saved, your Onshape account name shows under Secret key. Basecase keeps them encrypted and sends them only to cad.onshape.com.

![The Accounts pane in Settings with the Onshape access key and secret key saved, and the account name under Secret key](/changelog/import-onshape-assemblies/accounts.png)

Then open the assembly's tab in Onshape, copy the link from the address bar, press ⌘K, choose Import Robot and paste it. The same field already takes URDF, MJCF, GitHub and zip links.

![Import Robot with an Onshape assembly link pasted into the link field](/changelog/import-onshape-assemblies/link.png)

## How mates come in

Each Onshape part becomes its own mesh. Parts held together by a fastened mate or a mate group fuse into one part, so a bracket and its screws move as one. A revolute mate becomes a hinge and a slider mate a slide, along the mate connector's Z axis, with the mate's limits as the joint's range. 0 in Pose is wherever the assembly sat when you imported it, so a mate limited from -90° to 45° on an arm modelled turned by 30° comes in as -120° to 15°.

The part you fixed in Onshape is the robot's base. Parts with a material in Onshape bring their mass and centre of mass; parts without one keep none. When the robot is in, the message that says so has a Pose button, and the joints are there to drag.

![The Pose tab turning the imported Elbow hinge to 40°](/changelog/import-onshape-assemblies/pose.png)

## What stays fixed

Only revolute and slider mates move. A cylindrical, ball, pin slot or planar mate is held fixed, and the Build tab's Checks list each one under Fixed Mates on the part it holds, so you can add the joint by hand or ignore the note. A mate that closes a loop, like the last pin of a four-bar linkage, is left out without a note, because a rig is a tree and each part hangs off exactly one joint.

## Updating from Onshape

The robot stays linked to its assembly. When you change it in Onshape, right-click the robot's group in Layers, or any of its parts, and choose Update from Onshape, or find it in ⌘K. Basecase fetches the assembly again and matches it to the robot by Onshape's own ids: a part you lengthened is replaced where it sits, a new link and its mate come in as a part and a joint, and a part you deleted goes. Joint axes and limits follow their mates.

![The right-click menu of the Desk Arm group with Update from Onshape](/changelog/import-onshape-assemblies/update.png)

What you did in Basecase stays: the servo you gave a joint, colours, screws and cameras you added, poses and calibrations. If you delete a mate in Onshape, its joint isn't removed; Checks lists it under Missing Mates. One message says how many changes came in, and one ⌘Z undoes the whole update.

![The arm after the update, longer and with a new Wrist part, and the message 3 changes from Onshape](/changelog/import-onshape-assemblies/updated.png)

## What it doesn't do

A link to a version always brings that version, so import from the workspace link to keep up with your edits. An assembly can have up to 300 different parts, and a part linked from another document comes in only when that link points at a version. Importing from Onshape needs the desktop app.
