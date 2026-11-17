---
title: Export mechanical drawings
date: 2026-11-17
image: /changelog/export-mechanical-drawings/cover.png
---

You can export measured drawings of fabricated parts as PDF and editable SVG sheets. Kit includes the same drawing preparation.

Select a part and choose Drawings in Export. Choose the projection frame, front plane and scale before downloading. Use the whole-design option to include visible solids.

To send a rover deck to a workshop, you need more than a silhouette. In its drawing, you get thickness, overall dimensions and supported through-hole diameters and center locations. You can see concave outlines and holes in the projected views, with dashed lines for hidden edges.

On each sheet, you get source identity, a geometry fingerprint and quantity, plus the name and file fingerprint of a matching source STL. Repeated matching geometry and material share a sheet. Supplied material and declared print material stay with the part. For bought catalog parts, you get supplier references without invented fabrication dimensions.

You can get feature dimensions for flat profiles facing the selected front plane. For other solids, you get outline-only views. Circle fits keep their approximate labels. You can find numerical allowances on the drawing. These are measurement limits, not machining tolerances. For PDF names, you need Latin characters.

You can cancel an export to stop it. If you change the scene during an export, Basecase discards the output. Exporting doesn’t change the scene or supply a Ready to build verdict.

Steps are in [Export dimensioned drawings](/help/export-dimensioned-drawings).
