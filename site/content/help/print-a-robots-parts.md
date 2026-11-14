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

Lay out a robot's printed parts on your printer's plates, slice them with Bambu Studio or OrcaSlicer, then send each plate to the printer.

1. Press [[⌘P]] to open Print mode.
2. In the **Printer** section, choose your printer from the **Printer** menu.
3. Set **Quality**, **Material** and **Infill**.
4. To change how a part sits on the plate, select it and click **Lay on Face**. Then click the face it should rest on.
5. In the bar under the plate, click the plate you want to print, such as **1 PLA**.
6. Click **Send Plate 1**. If Basecase starts the print itself, the button reads **Print Plate 1** instead. If the plate isn't sliced yet, it's sliced first.

![Print mode with the printer settings, Plate 1 with Add Printer, and Parts](/help/get-a-robot-ready-to-build/print-mode.png)

If you haven't saved a printer, the plate's button reads **Add Printer**. Clicking it opens **Settings** ▸ **Printers**. To finish setting up your printer, see [Add a printer](/help/add-a-printer). If you don't have a printer at all, choose **Made by a Service** in **Printer** to [price printed parts from a print service](/help/price-printed-parts-from-a-print-service).

![Settings open at Printers after clicking Add Printer](/help/get-a-robot-ready-to-build/add-printer.png)

> [!WARNING]
> Don't start a print with anything on the bed. Clear the bed before you go on to the next step.

7. If you print with Bambu LAN, Klipper, PrusaLink or OctoPrint, read the material line in the sheet that opens, then click **Start Print**.
8. When the plate is done, click **Mark Printed** if it doesn't already say Printed.

If you use Bambu Studio, the plate opens in Bambu Studio and you start the print there. Bambu Connect works the same way.

You can also open Print mode from **File** ▸ **Print**, from **Print** in the Build tab, or from [[⌘K]]. To slice every plate at once, choose **Slice Plates** in [[⌘K]]. A toast shows the progress and includes **Stop**.

## On the plate

- To move a part, drag it. To lay it on a face, press [[F]]. To turn it 90°, press [[R]].
- To go to the previous or next plate, press [[←]] or [[→]].
- **Copies** prints more than one of the selected part. **Don't print** leaves the part off the plates.
- **Label parts** cuts each part's build guide letter into a hidden face. For details, see [Label printed parts with their guide letters](/help/label-printed-parts).
- Plates follow the order of the build guide. The number next to the box icon in the bottom bar is the step that first needs that plate.
- **Auto Arrange** in the bottom bar packs the plates for that material again.
- **Parts** lists every part with its size, time and plate. Parts with problems are listed first.
- **Merge** lists printed parts that are bolted together on one link and could print as one. To combine them, see [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).

After a print, a switch under **Printer** (such as Skip 3 printed parts) leaves the parts you already printed off the plates. The switch is on by default. For example, if you edit one bracket after a print, the next plate holds only that bracket.

If you have two or more printers that report their state, each idle printer gets **Start Next**. See [Print plates on several printers](/help/print-plates-on-several-printers).

To go back to the scene, press [[Esc]] or click **Done**. Next, [make a build guide](/help/make-a-build-guide) for putting the parts together.
