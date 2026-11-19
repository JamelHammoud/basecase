---
title: Check dimensional tolerances
date: 2026-11-18
image: /changelog/check-dimensional-tolerances/cover.png
---

You can declare manufacturing deviations on shared dimensions and check a clearance stack you've authored before exporting parts. Set the deviations in **Edit Parameters** and see the results in **Build**.

A spacer can fit at its nominal size and still bind after manufacturing. A 30.3 mm opening and a 30 mm spacer have 0.3 mm nominal clearance. With asymmetric deviations you declare, that clearance can range from −0.05 to 0.55 mm.

For each requirement, you name the actual dimensions and acceptable interval. Checks combines repeated shared references before bounding variation, then calculates nominal, minimum and maximum values. Missing deviations leave the result unresolved. Edit a dimension to update its result, or use Undo to restore the earlier declarations.

In Drawings and Kit, you retain the same source declarations and stack results. To add a tolerance annotation, you need an unambiguous authored dimension. Mesh approximation error remains separate.

Passing a dimensional requirement establishes that requirement alone. Assembly, collision and engineering checks keep their existing authority. You still choose Fit Test coupons as part of your design.

Follow the steps in [Check dimensional tolerances](/help/check-dimensional-tolerances).
