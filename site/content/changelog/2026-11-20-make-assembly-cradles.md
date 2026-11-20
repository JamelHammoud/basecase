---
title: Make assembly cradles
date: 2026-11-20
image: /changelog/make-assembly-cradles/cover.png
---

You can now make a temporary cradle to hold a subassembly during the current Build Along step, then export it through Print. We haven't measured holding strength or physical printer fit.

In Build Along, choose **Make Assembly Cradle**, select a subassembly and resting face, then set clearance, base thickness and support depth.

A servo bracket can be awkward to hold while you approach its screws. Basecase uses the prepared assembly geometry to make the cradle and checks the step's insertion moves and required driver access before offering Print.

You get a cavity that opens at the top and a flat base. The cavity clears the assembly's convex footprint, with extra space around concave recesses rather than locating pins through holes.

The cradle stays outside the robot's mass, joints, bill of materials and readiness verdict. In the 3MF, you keep the source identities and dimensions. Close Print to return to the original assembly step, where you can see the tooling moved away in the removal presentation.

You can't make a cradle with undercuts, inadequate support, unresolved geometry, blocked access or oversized plates. If you change the source or assembly step, Basecase clears the temporary result.

Steps are in [Make an assembly cradle](/help/make-an-assembly-cradle).
