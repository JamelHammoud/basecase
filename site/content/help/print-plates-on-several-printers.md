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

Send each idle printer the next plate your build needs, so the parts for the first guide steps come off the beds first.

You need two or more printers that report their state: Bambu LAN, Klipper, PrusaLink or OctoPrint. Printers that send through Bambu Studio or Bambu Connect don't report it. Start Next is in the desktop app only.

1. Add each printer in Settings ▸ **Printers**, as [Add a printer](/help/add-a-printer) shows.
2. Press ⌘P (Ctrl+P on Windows) to open Print mode.
3. Under **Printer**, find the printer you want to use. Each one shows its state, such as Ready.
4. Click **Start Next** beside a printer that reads Ready.

![Two printers under Printer, each Ready with Start Next](/help/print-plates-on-several-printers/printers.png)

> [!WARNING]
> Do not start a print with anything on the bed. Clear the bed before the next step.

5. Read the material line in the sheet that opens, then click **Start Print**.

![The Start Print sheet for plate 1 on Voron 2.4](/help/print-plates-on-several-printers/start-print.png)

6. Repeat for the next idle printer. It gets the next plate that isn't sent, printing or printed.

Start Next only offers a printer the plates its bed can hold. When a Bambu printer reports the filament it has loaded, it only gets plates of that material. A printer with a different bed or nozzle slices the plate with its own profile first.

The plates follow the build guide's order. In the bar under the plate, the number beside the box icon is the step that first needs the plate's parts, counted as Build Along counts.

![Plates 1, 2 and 3 in PLA, first needed at steps 1, 2 and 2](/help/print-plates-on-several-printers/plates.png)

When every printed part of a guide step is printed, the step shows a check in [Build Along](/help/build-along).
