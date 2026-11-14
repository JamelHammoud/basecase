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

You can lay out a robot's printed parts on your printer's plates, slice them with Bambu Studio or OrcaSlicer, and send each plate to the printer.

1. Press [[⌘P]] to open Print mode.
2. In the **Printer** section, choose your printer from the **Printer** menu.
3. Set **Quality**, **Material** and **Infill**.
4. To change how a part sits on the plate, select it and click **Lay on Face**. Then click the face you want it to rest on.
5. In the bar under the plate, click the plate you want to print, such as **1 PLA**.
6. Click **Send Plate 1**. If Basecase starts the print itself, the button reads **Print Plate 1** instead. If the plate hasn't been sliced, Basecase slices it before sending it to the printer.

![Print mode with the printer settings, Plate 1 with Add Printer, and Parts](/help/get-a-robot-ready-to-build/print-mode.png)

If you haven't saved a printer, the plate's button says **Add Printer**. Click it to open **Settings** ▸ **Printers**, then follow [Add a printer](/help/add-a-printer) to finish setting it up.

![Settings open at Printers after clicking Add Printer](/help/get-a-robot-ready-to-build/add-printer.png)

> [!WARNING]
> Clear the bed before you go on to the next step. Don't start a print with anything on it.

7. If you print with Bambu LAN, Klipper, PrusaLink or OctoPrint, check the material line in the sheet that opens, then click **Start Print**.
8. When the printer finishes the plate, click **Mark Printed**. If the plate already says Printed, skip this step.

If you use Bambu Studio or Bambu Connect, the plate opens in that app and you start the print there.

You can also open Print mode from **File** ▸ **Print**, from **Print** in the Build tab, or from [[⌘K]]. To slice all your plates in one pass, choose **Slice Plates** in [[⌘K]]. A toast shows the progress and has a **Stop** button.

## On the plate

- Drag a part to move it. Press [[F]] to lay it on a face, or [[R]] to turn it 90°.
- Press [[←]] or [[→]] to go to the previous or next plate.
- **Copies** prints more than one of the selected part. **Don't print** leaves the part off the plates.
- **Label parts** cuts each part's build guide letter into a hidden face. See [Label printed parts with their guide letters](/help/label-printed-parts).
- Basecase orders the plates by the build guide. The number next to the box icon in the bottom bar is the first step that needs that plate.
- **Auto Arrange** in the bottom bar repacks the plates for that material.
- **Parts** lists every part with its size, time and plate, with problem parts at the top.
- **Merge** lists printed parts bolted together on one link that you could print as one. To combine them, see [Merge printed parts into one print](/help/merge-printed-parts-into-one-print).

After a print, a switch under **Printer** (such as Skip 3 printed parts) leaves the parts you've printed off the plates. The switch is on by default. So if you edit one bracket after a print, the next plate holds only that bracket.

If you have two or more printers that report their state, each idle printer gets a **Start Next** button. See [Print plates on several printers](/help/print-plates-on-several-printers).

Press [[Esc]] or click **Done** to go back to the scene. Next, [make a build guide](/help/make-a-build-guide) for putting the parts together.
