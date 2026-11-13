---
title: Bring your Onshape robot into Basecase
date: 2026-11-12
---

If you design robots in Onshape, you no longer have to export a URDF to see them move in Basecase. Paste an assembly tab's link into Import Robot, the same field that takes GitHub repos and zips. The assembly comes in as a robot you can pose, check and simulate.

The first time, add an Onshape API key in Settings ▸ Accounts: the access key and the secret key. They stay in the desktop app's encrypted store and are only ever sent to cad.onshape.com.

Basecase reads the assembly the way Onshape describes it. Every part is exported as STEP and converted inside the same sandboxed converter that opens STEP files you drop on the canvas. Parts fastened together become one part.

A revolute mate becomes a hinge and a slider mate a slide, along the mate connector's axis. The mate's limits become the joint's range, measured from where the assembly sits, so the robot starts in the pose you modelled. The part you fixed in Onshape is the base. Parts with a material bring their mass and centre of mass, which feed the engineering checks.

Some mates have no joint to become. A cylindrical, ball or pin slot mate is held fixed rather than stopping the import to ask. Checks in the Build tab lists it under Fixed Mates on the part it holds.

We wanted this because the CAD you already have is the fastest way into the loop. Design in Onshape, then pose, simulate and train in Basecase without a converter in between. An assembly with up to 300 different parts imports in one go.

The [changelog entry](/changelog/2026-11-12-import-onshape-assemblies) lists what stays fixed and the limits, and [Import an Onshape assembly as a robot](/help/import-an-onshape-assembly) has the steps.
