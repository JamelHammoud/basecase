---
title: Design a linkage from the path it traces
date: 2026-11-13
image: /changelog/design-a-linkage-from-a-path/cover.png
---

You can now draw the path a leg or finger should trace, and Basecase fits a four-bar linkage to it. The linkage lands as printable bars with a servo on the crank.

Path is the third mode in Sketch, beside Extrude and Revolve. A walking leg is designed by the curve its foot traces. The `four_bar` recipe could build one, but someone had to guess its four link lengths and its coupler point.

From 5 to 12 points, up to three linkages sweep over the sketch in under a second. Each one lists its largest path error in mm, and the same points always give the same linkages. Picking one adds Ground, Crank, Coupler and Rocker bars from the `four_bar` recipe, plus a Feetech STS3215 that turns the crank across the drawn path. The servo goes through the torque and sweep checks like any joint, and Pose moves the whole linkage.

The agent fits linkages with the same solver through its `synthesize_linkage` tool.

Closed loops aren't simulated: in Simulate, the coupler rides the crank as one rigid arm. Links stay between 10 and 300 mm, so points farther apart than that get no linkage.

Steps are in [Design a linkage from a path](/help/design-a-linkage-from-a-path).
