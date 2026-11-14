---
title: Printer won't connect or refuses a print
date: 2026-11-13
updated: 2026-11-13
collection: troubleshooting
type: troubleshooting
order: 5
keywords:
  - bambu lan
  - developer mode
  - lan only
  - access code
  - serial number
  - api key
  - klipper
  - moonraker
  - prusalink
  - octoprint
  - printer offline
related:
  - add-a-printer
  - print-a-robots-parts
  - troubleshoot-build-slicing-fails
covers:
  - electron/print/connectors/
  - electron/print/index.mjs
  - src/app/settingsPanes.ts
  - src/components/settings/PrinterEditor.tsx
  - src/components/print/PrinterLive.tsx
---

If Basecase can't reach a printer or send it a plate, you'll see a message under **Test Connection** or in Print mode. Find your message below and follow its steps.

## “Couldn’t reach the printer at …”

The printer is off or asleep, it's on a different network, or its address has changed.

1. Make sure the printer is on, and that it's on the same network as your computer.
2. Find the printer's address on its screen. Compare it with **Address** in **Settings** ▸ **Printers**.
3. Click **Test Connection**.

When the connection works, the row shows “Connected to” and the printer's name. If the printer drops off later, Print mode shows “Can’t reach the printer”.

## “The printer refused the connection. Turn on LAN Only and Developer Mode on the printer.”

Bambu LAN needs both modes turned on. You can turn them on only from the printer's own screen.

1. On the printer, turn on LAN Only and Developer Mode.
2. Click **Test Connection** again.

**Note:** Bambu doesn't support Developer Mode. To leave both modes off, change **Send prints with** to **Bambu Studio**.

## “Check the access code on the printer: Settings → LAN Only.”

The access code you entered is wrong.

1. On the printer, open **Settings** ▸ **LAN Only** and find the code.
2. Enter it in **Access code**, then press [[↩]].
3. Click **Test Connection**.

## “The printer didn’t answer as …”

The serial number you entered doesn't match the printer at that address.

1. On the printer, open **Settings** ▸ **Device** and find the serial number.
2. Enter it in **Serial number**, then click **Test Connection**.

## “The printer couldn’t save the file. Check its SD card is in and has space.”

Bambu printers save each print to their SD card. Put a card in the printer, or delete old files from the card to make room. Then send the plate again.

## The API key is wrong

The message tells you where to make a new key. Where you go depends on how you connect:

| Connection | Where to find the key |
|---|---|
| Klipper (Moonraker) | Mainsail or Fluidd, under **Settings** ▸ **Authorization** |
| PrusaLink | The printer, under **Settings** ▸ **Network** ▸ **PrusaLink** |
| OctoPrint | OctoPrint, under **Settings** ▸ **Application Keys** |

Paste the new key in **API key**, press [[↩]], then click **Test Connection**.

## The printer is busy, or out of storage

While a print is running, you'll see “The printer is busy. Wait for it to finish.” When its storage is full, you'll see “The printer is out of storage. Delete some files on it.” On Klipper, “Moonraker answered, but Klipper isn’t ready.” means the printer itself needs attention.

## “Add the printer in **Settings** ▸ **Printers**.”

The printer you chose under **Printer** in Print mode is no longer in Settings. This happens when you remove a printer in Settings while Print mode is open.

1. Click **Open** in the message to go to **Settings** ▸ **Printers**.
2. Add the printer again, following [Add a printer](/help/add-a-printer).
3. Back in Print mode, choose the printer under **Printer** and send the plate again.

## “Install Bambu Studio to send prints” or “Install Bambu Connect from bambulab.com.”

The option you chose in **Send prints with** hands plates to another app, and that app isn't installed. Install it, or choose a different option in **Send prints with**.
