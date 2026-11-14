---
title: Design a linkage from the path it traces
date: 2026-11-13
image: /changelog/design-a-linkage-from-a-path/cover.png
---

You can now draw the path a leg or finger should trace, and Basecase fits a four-bar linkage to it. The linkage lands as printable bars with a servo on the crank.

Path is the third mode in Sketch, beside Extrude and Revolve. Draw 5 to 12 points, and in under a second up to three linkages sweep over the sketch, each with its largest path error in mm. The same points always give the same linkages.

Pick one and Basecase adds Ground, Crank, Coupler and Rocker bars from the `four_bar` recipe, plus a Feetech STS3215 that turns the crank across the drawn path.

You design a walking leg by the curve its foot traces. The `four_bar` recipe could already build one, but someone had to guess its four link lengths and its coupler point. Now you draw the curve and pick a linkage.

## Like Any Joint

The servo goes through the same torque and sweep checks as every other joint, and Pose moves the whole linkage.

The agent fits linkages with the same solver, using its `synthesize_linkage` tool.

## Limits

Simulate doesn't model closed loops. There, the coupler rides the crank as one rigid arm.

Each link is 10 to 300 mm long, so points farther apart than that get no linkage.

Read [Design a linkage from a path](/help/design-a-linkage-from-a-path) in the help center for the steps.
