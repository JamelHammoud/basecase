---
title: Print plates on several printers
date: 2026-11-13
collection: build-and-print
type: task
order: 6
keywords:
  - print farm
  - several printers
  - start next
  - build order
  - klipper
  - moonraker
  - prusalink
  - octoprint
  - bambu lan
related:
  - print-a-robots-parts
  - add-a-printer
covers:
  - src/components/print/PrinterFleet.tsx
  - src/components/print/PlateBar.tsx
  - src/workspace/usePrintFleet.ts
  - src/workspace/usePrintStatus.ts
  - src/print/fleet.ts
  - src/print/plan.ts
---

You can send each idle printer the next plate your build needs, so the parts for the build guide's early steps print before the rest.

To use Start Next, you need the desktop app and two or more printers that report their state: Bambu LAN, Klipper, PrusaLink or OctoPrint. Printers that send through Bambu Studio or Bambu Connect don't report their state.

1. Add each printer in **Settings** ▸ **Printers**. To learn how, see [Add a printer](/help/add-a-printer).
2. Press [[⌘P]] to open Print mode.
3. Under **Printer**, find the printer you want to use. Each printer shows its state, such as Ready.
4. Click **Start Next** beside a printer that reads Ready.

![Two printers under Printer, each Ready with Start Next](/help/print-plates-on-several-printers/printers.png)

> [!WARNING]
> Don't start a print with anything on the bed. Clear the bed before you go on to the next step.

5. In the sheet that opens, read the material line, then click **Start Print**.

![The Start Print sheet for plate 1 on Voron 2.4](/help/print-plates-on-several-printers/start-print.png)

6. Repeat these steps for the next idle printer. That printer gets the next plate that isn't already sent, printing or printed.

Start Next offers a printer only the plates that fit on its bed. A Bambu printer that reports its loaded filament gets only the plates in that material. A printer with a different bed or nozzle slices the plate with its own profile before it prints.

Plates follow the order of the build guide. In the bar under each plate, the number beside the box icon is the first step that needs that plate's parts. Build Along numbers steps the same way.

![Plates 1, 2 and 3 in PLA, first needed at steps 1, 2 and 2](/help/print-plates-on-several-printers/plates.png)

Once all of a guide step's printed parts finish, that step shows a check in [Build Along](/help/build-along).
