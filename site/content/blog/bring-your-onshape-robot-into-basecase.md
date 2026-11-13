---
title: Bring your Onshape robot into Basecase
date: 2026-11-12
---

If you design robots in Onshape, you no longer have to export a URDF to see them move in Basecase. Paste the link of an assembly tab into Import Robot, the same field that takes GitHub repos and zips, and the assembly comes in as a robot you can pose, check and simulate.

The first time, add an Onshape API key in Settings ▸ Accounts: the access key and the secret key. They stay in the desktop app's encrypted store and are only ever sent to cad.onshape.com.

Basecase reads the assembly the way Onshape describes it. Every part is exported as STEP and converted inside the same sandboxed converter that opens STEP files you drop on the canvas. Parts fastened together become one part. A revolute mate becomes a hinge and a slider mate a slide, along the mate connector's axis, with the mate's limits as the range, measured from where the assembly sits so the robot starts in the pose you modelled. The part you fixed in Onshape is the base, and parts with a material bring their mass and centre of mass, which feed the engineering checks.

Some mates have no joint to become. A cylindrical, ball or pin slot mate is held fixed, and Checks in the Build tab lists it under Fixed Mates on the part it holds, rather than stopping the import to ask.

We wanted this because the CAD you already have is the fastest way into the loop: design in Onshape, then pose, simulate and train in Basecase without a converter in between. An assembly with up to 300 different parts imports in one go.
