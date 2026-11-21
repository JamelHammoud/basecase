---
title: Compare robot revisions
date: 2026-11-20
image: /changelog/compare-robot-revisions/cover.png
---

You can freeze two robot revisions and compare their Case outcomes on identical seeds from the Basecase CLI. You get a portable JSON comparison, a static HTML report and recorded failures.

A rover with cheaper motors can look unchanged in the studio. Run paired trials to see which runs passed before the change and miss their goal after it. You get each revision's margin and named failures with the results.

Before execution, Basecase freezes scenes, geometry, world assets, controllers, calibration and engine identity. It runs offline and reuses prepared geometry. Basecase refuses to run with missing meshes and won't produce a matched comparison if the Case declarations or engines differ.

You can include up to 16 Cases and 32 seeds in a report, within 600 simulated seconds across both revisions. Basecase keeps up to eight failures within a 16 MiB recording budget. Import a failure to open its frozen source scene and the existing timeline.

Basecase refuses unsupported controllers. If you interrupt execution, you get incomplete evidence. Generated simulation outcomes make no claim about performance on a physical robot.

Steps are in [Compare robot revisions](/help/compare-robot-revisions).
