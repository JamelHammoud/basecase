---
title: Add your printer
date: 2026-11-13
covers:
  - src/components/settings/PrintersPane.tsx
  - src/components/settings/PrinterEditor.tsx
  - src/data/printers.ts
  - src/data/printerCatalog.ts
  - electron/print/slicers.mjs
---

Tell Basecase which printer you own, so plates are laid out on its bed and sliced with its own profiles.

1. Press ⌘, and click Printers.
2. Click Add Printer.
3. Pick your printer in Model. The list holds over a hundred printers, including Bambu Lab's and Prusa's CORE One, MK4S and XL. If yours isn't there, pick Custom printer and type its build volume.
4. Give it a name, and pick the nozzle if it takes more than one.
5. In Send prints with, pick how plates reach the printer: Bambu Studio, Bambu Connect or Bambu LAN (Developer Mode) for a Bambu Lab printer, PrusaLink for a Prusa, Klipper (Moonraker) or OctoPrint for the rest. Leave it on Export only to send them yourself.
6. For PrusaLink, Klipper or OctoPrint, type the printer's address and its API key, then click Test Connection.

![Settings ▸ Printers with a Prusa CORE One sending through PrusaLink](/help/add-your-printer/printers.png)

The first printer you add becomes the default, and every scene prints on it unless you pick another in Print mode. Press ⌘P to see the plates on its bed.

![Print mode with a part on the CORE One's 250 × 220 mm bed](/help/add-your-printer/print-mode.png)

Bambu Lab printers slice with Bambu Studio, or OrcaSlicer if that's what you have. Prusa's CORE One, MK4, MK4S, MK3.5, MINI IS and XL slice with OrcaSlicer, so install it before you slice for them. The XL is its single-tool version; the 5-tool XL and printers with an MMU aren't in the list.
