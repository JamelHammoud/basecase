---
title: Study robot designs
date: 2026-11-13
image: /changelog/explore-servo-versions/cover.png
---

You can now compare combinations of servos, batteries and part sizes in Study, then apply a design in one undo step.

Study is in the Simulate tab and [[⌘K]]. It brings the former servo Explore and agent design sweep into one saved run. Each design keeps its Checks, cost and weight beside a plot with selectable metrics.

A quadruped's foot length and width can change together. Two lengths and three widths make six combinations, so you can compare their weight and stability before changing the robot. Named OpenSCAD dimensions can be combined with these choices too.

Each Study measures up to 64 combinations and takes a repeatable sample when the space is larger. With a Case open, every design also gets 8 seeded runs at its supply voltage. Hovering previews the design, and **Apply** changes the robot in one history step.

A Case must have one robot. Named dimensions require the desktop app. Results save with the scene, and later edits disable Apply until you run the Study again.

Read [Study design options](/help/study-design-options) for the steps.
