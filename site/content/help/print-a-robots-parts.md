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

Lay the printed parts out on your printer's plates, slice them with Bambu Studio or OrcaSlicer, and send each plate to the printer.

1. Press [[⌘P]] to open Print mode.
2. Under **Printer**, pick your printer in **Printer**.
3. Set **Quality**, **Material** and **Infill**.
4. To change how a part sits, select it, click **Lay on Face**, then click the face it should rest on.
5. In the bar under the plate, click the plate to print, such as **1 PLA**.
6. Click **Send Plate 1**, or **Print Plate 1** when Basecase starts the print itself. A plate that isn't sliced is sliced first.

![Print mode with the printer settings, Plate 1 with Add Printer, and Parts](/help/get-a-robot-ready-to-build/print-mode.png)

If you haven't saved a printer, the plate's button reads **Add Printer** and opens Settings ▸ Printers. [Add a printer](/help/add-a-printer) covers the rest.

![Settings open at Printers after clicking Add Printer](/help/get-a-robot-ready-to-build/add-printer.png)

> [!WARNING]
> Do not start a print with anything on the bed. Clear the bed before the next step.

7. For Bambu LAN, Klipper, PrusaLink or OctoPrint, read the material line in the sheet that opens, then click **Start Print**.
8. When the plate is done, click **Mark Printed** if it doesn't already read Printed.

With Bambu Studio, the plate opens there and you start the print in Bambu Studio. Bambu Connect works the same way.

Print mode also opens from **File** ▸ **Print**, from **Print** in the Build tab, and from [[⌘K]]. **Slice Plates** in [[⌘K]] slices every plate at once; a toast shows the progress, with **Stop**.

## On the plate

- Drag a part to move it. Press [[F]] to lay it on a face, or [[R]] to turn it 90°.
- Press [[←]] or [[→]] to go to the previous or next plate.
- **Copies** prints more than one of the selected part. **Don't print** leaves it off the plates.
- Plates follow the build guide's order. The number beside the box icon in the bottom bar is the step that first needs the plate.
- **Auto Arrange** in the bottom bar packs the plates of that material again.
- **Parts** lists every part with its size, time and plate. Parts with problems come first.
- **Merge** lists printed parts bolted together on one link that could print as one. [Merge printed parts into one print](/help/merge-printed-parts-into-one-print) has the steps.

After a print, a switch under **Printer**, such as Skip 3 printed parts, leaves the parts you printed off the plates. It starts on. Edit one bracket, and the next plate holds only that bracket.

With two or more printers that report their state, each idle one gets **Start Next**. [Print plates on several printers](/help/print-plates-on-several-printers) has the steps.

Press [[Esc]] or click **Done** to go back to the scene. Next, [make a build guide](/help/make-a-build-guide) for putting the parts together.
