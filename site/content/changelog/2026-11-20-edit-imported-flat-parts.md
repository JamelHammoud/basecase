---
title: Edit imported flat parts
date: 2026-11-20
image: /changelog/edit-imported-flat-parts/cover.png
---

You can turn an imported flat custom part into a Sketch extrusion and change its thickness without redrawing the outline or through-holes. Catalog products remain reference parts.

**Convert to Sketch** is in the command palette and the selected part's right-click menu. The converted outline opens in the ordinary Sketch editor.

If a downloaded mounting plate fits your robot's hole pattern but needs thicker stock, you can convert it and change the thickness. Basecase recovers the outline and keeps the part's identity, world placement, material and group. It retains the original mesh and saves the original scene in Scene History before replacing the geometry.

Basecase runs recognition in a worker you can cancel. Before replacing the geometry, it regenerates the Sketch and compares its surfaces, volume and hole topology against the prepared import. You see the measured reconstruction deviation in a toast. Basecase refuses conversion if the deviation exceeds 0.005 mm.

The first version supports one closed outer boundary and polygonal through-holes, with limits of 20,000 triangles and 512 profile points. Basecase stops conversion if it finds pockets, disconnected bodies or geometry references it can't preserve. This version doesn't support circular fitting or inferred constraints. You must resolve existing manufacturing declarations before converting a part. Checks decides build readiness after conversion.

Steps are in [Convert an imported flat part](/help/convert-an-imported-flat-part).
