---
title: Plates won't slice or send
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 4
keywords:
  - slicer not found
  - bambu studio
  - orcaslicer
  - prusaslicer
  - slicer profile
  - send greyed out
  - slice error
related:
  - print-a-robots-parts
  - add-a-printer
  - troubleshoot-build-printer-wont-connect
  - export-plates-as-3mf
covers:
  - electron/print/slicers.mjs
  - electron/print/jobs.mjs
  - electron/print/slice.mjs
  - src/workspace/usePrintJob.ts
  - src/workspace/usePrinting.ts
  - src/print/printBridge.ts
  - src/components/print/PrintPanel.tsx
  - src/components/settings/PrintersPane.tsx
---

Basecase slices with Bambu Studio or OrcaSlicer on your computer, so most slicing errors mean a missing slicer, profile or printer.

## “Slicing needs Bambu Studio or OrcaSlicer. Install one, then slice again.”

Neither slicer is where Basecase looks. On a Mac that's Applications, in your home folder or the main one. On Windows it's Program Files or your user's Programs folder.

1. Install Bambu Studio or OrcaSlicer in its default place.
2. Press ⌘, (Ctrl+, on Windows), choose **Printers** and find **Slicers**. The slicer should be listed there.
3. Slice again with **Slice Plates** in ⌘K.

PrusaSlicer shows under **Slicers** too, but Basecase doesn't slice with it. It worked when the plate shows a thumbnail and its time loses the ≈.

## The plate's button reads Add Printer

No printer is saved, so there's nowhere to send the plate. Clicking it opens Settings ▸ Printers.

1. Follow [Add a printer](/help/add-a-printer) from step 2.
2. Pick the printer under **Printer** in Print mode.

## The send button is greyed out

The plate is slicing or sending, or a printer is set but no slicer is installed. Wait for the progress line to finish, or install a slicer as above.

## A printer or material has no slicer profile

The messages read “⟨printer⟩ has no slicer profile. Export the 3MF and set it up in your slicer.” or “The slicer has no PLA profile for this printer. Pick another material.”, with your printer and material. Custom printers have no profile.

1. For a material, pick another one in **Material** under **Printer**.
2. For a printer, click **Export** and choose **3MF Plates**.
3. Open the 3MF in your slicer and pick your printer there.

A message ending “Update the slicer or pick another printer.” names a profile your slicer lacks. Update Bambu Studio or OrcaSlicer to its latest version.

## “No plates to print. Add printed parts first.”

No part in the scene prints. Components, screws and stand-ins are bought, not printed. So are parts whose **Material** in the Inspector is **CNC aluminum**, **Laser-cut sheet** or **Off-the-shelf**.

## “The slicer returned no plates. Slice again.”

The slicer finished without a result Basecase could read. The same goes for a message that a plate “isn’t in the sliced file”, and for “The slicer stopped without saying why. Slice again.”

1. Press ⌘K and choose **Slice Plates**.
2. If it fails again, read the slicer's own message under the plate. Basecase shows it as the slicer wrote it.
