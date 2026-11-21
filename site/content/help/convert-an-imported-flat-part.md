---
title: Convert an imported flat part
date: 2026-11-20
collection: design
type: task
keywords:
  - mesh to sketch
  - stl
  - step
  - extrusion
  - thickness
related:
  - import-a-file
  - draw-a-part-from-a-sketch-or-svg
covers:
  - src/utils/sketch/importRecovery.ts
  - src/utils/sketch/recoveryComparison.ts
  - src/utils/sketch/recoverySource.ts
  - src/workspace/useImportRecovery.ts
  - src/workspace/importRecoveryReferences.ts
---

Change the thickness of an imported plate without redrawing its outline or through-holes.

1. In [[⌘K]], choose **Import**.
2. In the file picker, choose `Mounting plate.stl` or your flat part file.
3. On the canvas, click the imported part.
4. In [[⌘K]], choose **Convert to Sketch**.

![Convert to Sketch in the palette with Mounting plate selected](/help/convert-an-imported-flat-part/convert.png)

5. On the canvas, double-click the converted part.

![The recovered plate outline and polygonal holes in Sketch](/help/convert-an-imported-flat-part/sketch.png)

6. Under **Output**, set **Thickness** and press [[↩]].

![The same plate after changing Thickness to 6 mm](/help/convert-an-imported-flat-part/thickness.png)

You can right-click the selected part and choose **Convert to Sketch**. Press [[⌘Z]] to undo thickness editing or conversion.

To convert a part, choose a closed custom solid with constant thickness, one outer boundary and through-holes. You can't convert catalog products, pockets or disconnected bodies. Use files with no more than 20,000 triangles and 512 recovered polygon points. Set thickness from 0.1 to 250 mm. To import STEP files, use the desktop app.

Check the toast for the measured reconstruction deviation. You can't convert a part with a deviation above 0.005 mm. Basecase runs separate checks for surfaces, volume and hole topology. You keep polygonal holes after conversion. Basecase doesn't infer dimensions or constraints.

You can't convert a part with retained sheet declarations, published mass or local geometry references. You keep the original mesh in the saved part. Basecase saves the original scene in **Scene History** under the part's name.

Save the scene to keep editing in Sketch after you reopen it. See [Draw a part from a sketch or SVG](/help/draw-a-part-from-a-sketch-or-svg) for constraints and dimensions. After conversion, use **Checks** to determine whether the design is ready to build.
