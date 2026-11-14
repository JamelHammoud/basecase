---
title: Print a robot's parts
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 5
keywords:
  - print mode
  - plates
  - slice
  - slicer
  - bambu studio
  - orcaslicer
  - send to printer
  - build plate
related:
  - add-a-printer
  - print-plates-on-several-printers
  - printability-estimates
  - troubleshoot-build-slicing-fails
  - export-plates-as-3mf
  - merge-printed-parts-into-one-print
  - label-printed-parts
covers:
  - src/components/print/PrintPanel.tsx
  - src/components/print/PrintSettings.tsx
  - src/components/print/StartPrintSheet.tsx
  - src/components/print/PrintedSection.tsx
  - src/components/print/PlateBar.tsx
  - src/workspace/PlateCanvas.tsx
  - src/workspace/usePrinting.ts
  - src/workspace/usePrintJob.ts
  - electron/print/
---

In Print mode you lay out a robot's printed parts on your printer's plates, slice them with Bambu Studio or OrcaSlicer and send each plate to the printer.

1. Press [[⌘P]] to open Print mode.
2. In the **Printer** section, choose your printer from the **Printer** menu.
3. Set **Quality**, **Material** and **Infill**.
4. To change how a part sits on the plate, select it and click **Lay on Face**. Then click the face it should rest on.
5. In the bar under the plate, click the plate you want to print, such as **1 PLA**.
6. Click **Send Plate 1**. If you haven't sliced the plate, Basecase slices it first. If Basecase starts the print itself, the button reads **Print Plate 1**.

![Print mode with the printer settings, Plate 1 with Add Printer, and Parts](/help/get-a-robot-ready-to-build/print-mode.png)

If you haven't saved a printer, the plate's button reads **Add Printer**. Click it to open **Settings** ▸ **Printers**, and see [Add a printer](/help/add-a-printer) to finish the setup. If you don't have a printer at all, choose **Made by a Service** in **Printer** to [price printed parts from a print service](/help/price-printed-parts-from-a-print-service).

![Settings open at Printers after clicking Add Printer](/help/get-a-robot-ready-to-build/add-printer.png)

> [!WARNING]
> Make sure the bed is clear before you start a print.

7. If you print with Bambu LAN, Klipper, PrusaLink or OctoPrint, a sheet opens. Read the sheet's material line and click **Start Print**.
8. Click **Mark Printed** once the print finishes. Skip this step if the plate says Printed.

If you use Bambu Studio, the plate opens in Bambu Studio and you start the print there. Bambu Connect works the same way.

You can also open Print mode from **File** ▸ **Print**, **Print** in the Build tab or [[⌘K]]. To slice every plate at once, choose **Slice Plates** in [[⌘K]]. The progress toast has a **Stop** button.

## On the plate

- Drag a part to move it. Press [[F]] to lay it on a face, or [[R]] to turn it 90°.
- Press [[←]] or [[→]] for the previous or next plate.
- **Copies** prints more than one of the selected part. **Don't print** leaves the part off the plates.
- **Label parts** cuts each part's build guide letter into a hidden face. See [Label printed parts with their guide letters](/help/label-printed-parts).
- Plates follow the build guide's order. The number next to the box icon in the bottom bar is the step that first needs that plate.
- **Auto Arrange** in the bottom bar repacks the plates for that material.
- **Parts** lists every part with its size, time and plate. Problem parts are at the top.
- **Merge** lists printed parts that are bolted together on one link and could print as one. To combine them, see [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).

After a print, a switch under **Printer** (such as Skip 3 printed parts) keeps the parts you've printed off the plates. It's on by default, so if you edit one bracket after a print, the next plate holds only that bracket.

If you have two or more printers that report their state, each idle printer gets a **Start Next** button. See [Print plates on several printers](/help/print-plates-on-several-printers).

Press [[Esc]] or click **Done** to go back to the scene. Next, [make a build guide](/help/make-a-build-guide) for putting the parts together.
