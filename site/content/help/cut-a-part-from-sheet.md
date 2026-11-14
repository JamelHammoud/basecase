---
title: Cut a part from sheet
date: 2026-11-13
collection: build-and-print
type: task
order: 6
covers:
  - src/sheet/detectSheet.ts
  - src/sheet/sheetStock.ts
  - src/data/sheetStock.ts
  - src/sheet/sheetDxf.ts
  - src/sheet/cutFiles.ts
  - src/components/inspector/MaterialField.tsx
  - src/workspace/useCutFilesExport.ts
  - src/components/ExportMenu.tsx
  - src/agent/agentSheet.ts
---

Make a flat part from aluminum, carbon fiber or acrylic instead of printing it, and export the DXF a cutting service takes.

Only a flat part offers it. It must have two flat parallel faces with nothing but through holes and cutouts between them, and be at most 13 mm thick.

1. Select the part.
2. In the Inspector, under **Appearance**, choose **Cut from sheet** in the material menu.
3. In the row below it, choose **6061 aluminum**, **Carbon fiber plate** or **Acrylic**.
4. Check the thickness beside it, and choose another stock size if you need one.
5. Click **Export** at the top right and choose **Cut Files**.

![The Appearance section with Cut from sheet, 6061 aluminum and 3.18 mm](/help/cut-a-part-from-sheet/material.png)

![The Export menu with Cut Files](/help/cut-a-part-from-sheet/export.png)

You can also press [[⌘K]] and choose **Export Cut Files**, or ask the agent to cut a part from sheet.

The part leaves the print plates and the filament count. Checks weigh it at the material's density: 2.7 g/cm³ for aluminum, 1.55 for carbon fiber and 1.19 for acrylic. The bill of materials lists it under **Sheet**, one line per material and thickness.

![The bill of materials with a Sheet line for 6061 aluminum, 3.18 mm](/help/cut-a-part-from-sheet/bill-of-materials.png)

Basecase starts at the stock thickness nearest the part's own. If you change the part's thickness later, choose the thickness again.

The download is a zip with one DXF per part, in millimeters, named by part, material and thickness. The outline and each hole are closed polylines. Bends and the cutting shop's rules for small holes aren't checked.

To print the part again, choose a printed material in the same menu. [Buy the parts for a robot](/help/buy-the-parts-for-a-robot) covers the rest of the bill of materials.
