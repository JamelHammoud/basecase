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
  - src/components/print/PrinterFleet.tsx
  - src/print/fleet.ts
  - src/components/settings/PrintersPane.tsx
  - src/print/labels/partLabels.ts
---

Basecase slices your plates on your computer, using Bambu Studio or OrcaSlicer. Most slicing errors come from a missing slicer, profile or printer. If a plate won't slice or send, find the message or problem you're seeing below.

## “Slicing needs Bambu Studio or OrcaSlicer. Install one, then slice again.”

Basecase couldn't find either slicer. On a Mac, it looks in the main Applications folder and in the Applications folder inside your home folder. On Windows, it looks in Program Files and in your user's Programs folder.

1. Install Bambu Studio or OrcaSlicer in its default location.
2. Press [[⌘,]], choose **Printers** and find **Slicers**. Check that the slicer you installed is listed there.
3. Slice again with **Slice Plates** in [[⌘K]].

**Note:** **Slicers** also lists PrusaSlicer, but Basecase doesn't slice with it.

When slicing works, the plate shows a thumbnail, and its time no longer starts with ≈.

## The plate's button reads Add Printer

You haven't saved a printer yet, so Basecase has nowhere to send the plate. Click the button to open **Settings** ▸ **Printers**.

1. Follow [Add a printer](/help/add-a-printer) from step 2.
2. In Print mode, pick the printer under **Printer**.

## The send button is grayed out

This happens while the plate is slicing or sending, and when you've set up a printer but haven't installed a slicer. Wait for the progress line to finish, or install Bambu Studio or OrcaSlicer.

**Start Next** is grayed out while any plate is slicing or sending.

## A printer has no Start Next

**Start Next** appears only beside a printer that reads Ready and has a plate left that it can print. Basecase won't offer a plate that:

- Has already been sent, is printing or has printed
- Is too big for the printer's bed
- Is in a material other than the filament the printer reports

For the steps, see [Print plates on several printers](/help/print-plates-on-several-printers).

## A printer or material has no slicer profile

You'll see one of these messages, with your own printer and material named in it:

- “⟨printer⟩ has no slicer profile. Export the 3MF and set it up in your slicer.”
- “The slicer has no PLA profile for this printer. Pick another material.”

Custom printers don't have a profile.

1. If the message is about a material, pick another one in **Material** under **Printer**.
2. If the message is about a printer, click **Export** and choose **3MF Plates**.
3. Open the 3MF in your slicer and pick your printer there.

If the message ends with “Update the slicer or pick another printer.”, your slicer doesn't have the profile it names. Update Bambu Studio or OrcaSlicer to the latest version.

## “No plates to print. Add printed parts first.”

Your scene has no parts to print. Basecase counts components, screws and stand-ins as bought parts, along with any part whose **Material** in the Inspector is set to **Off-the-shelf** or **Cut from sheet**.

## “The slicer returned no plates. Slice again.”

The slicer finished, but Basecase couldn't read what it returned. Use the same steps if a message says a plate “isn’t in the sliced file”, or if it reads “The slicer stopped without saying why. Slice again.”

1. Press [[⌘K]] and choose **Slice Plates**.
2. If it fails again, read the slicer's own message under the plate. Basecase shows it exactly as the slicer wrote it.

## “Couldn’t cut the guide letters. Turn off Label parts to print without them.”

The tool that cuts each part's build guide letter didn't load, so Basecase didn't write any plates.

1. Press [[⌘P]] to open Print mode.
2. Under **Printer**, turn off **Label parts**.
3. Slice again with **Slice Plates** in [[⌘K]].

Your parts will print without letters. To learn more, see [Label printed parts with their guide letters](/help/label-printed-parts).
