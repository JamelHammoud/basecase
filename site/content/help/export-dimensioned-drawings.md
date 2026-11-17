---
title: Export dimensioned drawings
date: 2026-11-17
collection: build-and-print
type: task
covers:
  - src/sheet/drawings.ts
  - src/workspace/DrawingExportSheet.tsx
  - src/workspace/drawingExport.ts
related:
  - export-a-robot-kit
  - cut-parts-from-sheet
---

Export a fabricated part's measured geometry as PDF and editable vector sheets to send to a workshop.

You can include feature dimensions for flat profiles that face the chosen front plane. For other solids, you get views with outlines alone. Use Latin characters in PDF names.

1. In **Layers**, select the fabricated part.
![The rover deck selected in Layers](/help/export-dimensioned-drawings/selection.png)

2. At the top right, click **Export**.
3. Choose **Drawings**.
![Drawings in the Export menu](/help/export-dimensioned-drawings/menu.png)

4. In **Parts**, choose **Selection** or **Whole Design**.
5. In **Frame**, choose **Part** for local axes or **Scene** to keep the part's rotation.
6. In **Front plane**, choose the plane that faces the profile.
7. In **Scale**, choose the drawing scale.
![The drawing frame, front plane and scale controls](/help/export-dimensioned-drawings/options.png)

8. Click **Export**.
9. In your downloads, unzip `<scene>-drawings.zip`.
10. Open `drawings.pdf`.

![The rover after downloading its drawings](/help/export-dimensioned-drawings/exported.png)

![The exported rover deck drawing with orthographic views and measured features](/help/export-dimensioned-drawings/drawing.png)

You can edit the SVG files as vectors. On each sheet, you can find the name of its matching source STL in millimeters, with Z up. In the JSON file, you can find source identity, geometry hashes and quantities. Parts with identical geometry and material share a sheet.

The part keeps its supplied material and declared print material. If the part has no material, Basecase leaves it unspecified.

Basecase measures hole centers from the declared datum and marks an approximate circle fit with a `~` before its diameter. You can find the numerical allowances on the drawing. Basecase omits unsupported hole dimensions. These allowances describe measurement and do not specify a machining tolerance.

Print the PDF at actual size to preserve its declared scale. If the chosen scale can’t fit A4, choose a smaller scale and export again.

If you edit the part or change the scene, Basecase discards the drawing preparation. Click **Cancel** in the progress toast to stop preparation. You can export drawings without changing your scene.

If you change the part’s width, Basecase updates its dimensions and geometry fingerprint on the next export.

![The rover deck resized to 100 mm in Inspect](/help/export-dimensioned-drawings/resized.png)

You can choose **Drawings** from [[⌘K]]. [Export a robot kit](/help/export-a-robot-kit) includes the same drawing preparation with the kit's selected frame and scale.
