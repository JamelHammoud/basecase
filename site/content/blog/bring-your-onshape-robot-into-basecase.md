---
title: Bring your Onshape robot into Basecase
date: 2026-11-12
---

You can now bring a robot from Onshape into Basecase. Paste the link to an assembly tab into Import Robot, the same field you use for GitHub repos and zips, and you get a robot you can pose, check and simulate.

Until now, you had to export a URDF to see it move.

The first time, add your Onshape API key in **Settings** ▸ **Accounts**, with both the access key and the secret key. Basecase keeps them in the desktop app's encrypted store and sends them to cad.onshape.com and nowhere else.

## Parts and Joints

Basecase reads the assembly the way Onshape describes it. It exports each part as STEP, converts it in the same sandboxed converter that opens STEP files you drop on the canvas, and merges parts that are fastened together into one part.

Each revolute mate turns into a hinge and each slider mate into a slide, along the mate connector's axis, with the mate's limits as the range. Basecase measures those limits from where the assembly sits, so your robot starts in the pose you modeled.

The part you fixed in Onshape becomes the base. Parts with a material bring their mass and center of mass along for the engineering checks.

## Mates Without a Joint

Cylindrical, ball and pin slot mates have no joint to map to. Basecase holds them fixed and finishes the import without asking you. You'll find each one in the Build tab's Checks, under Fixed Mates on the part it holds.

## Why We Built It

The fastest way into the loop is to start from the CAD you already have. You design in Onshape, then pose, simulate and train in Basecase, and nothing has to convert the robot in between. You can import an assembly with up to 300 different parts in one go.

See the [changelog entry](/changelog/2026-11-12-import-onshape-assemblies) for what stays fixed and the limits. For the key and the import, read [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly) in the help center.
