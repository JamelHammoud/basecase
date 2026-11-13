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
  - src/components/settings/PrinterEditor.tsx
  - src/components/print/PrinterLive.tsx
---

Each message below is what Basecase shows when a printer turns down a connection, under **Test Connection** or when you send a plate.

## “Couldn’t reach the printer at …”

The printer is off, asleep or on another network, or its address changed.

1. Check the printer is on and on the same network as your computer.
2. Read the printer's address on its screen and compare it with **Address** in Settings ▸ **Printers**.
3. Click **Test Connection**.

It worked when the row reads “Connected to” and the printer's name. A printer that drops off later shows “Can’t reach the printer” in Print mode.

## “The printer refused the connection. Turn on LAN Only and Developer Mode on the printer, then try again.”

Bambu LAN needs both modes on, from the printer's own screen. Bambu doesn't support Developer Mode.

1. On the printer, turn on LAN Only and Developer Mode.
2. Click **Test Connection** again.

To keep both off, change **Send prints with** to **Bambu Studio** instead.

## “Check the access code on the printer: Settings → LAN Only.”

The access code is wrong.

1. On the printer, open Settings ▸ LAN Only and read the code.
2. Type it in **Access code** and press Enter.
3. Click **Test Connection**.

## “The printer didn’t answer as …”

The serial number doesn't match the printer at that address.

1. On the printer, open Settings ▸ Device and read the serial number.
2. Type it in **Serial number**, then click **Test Connection**.

## “The printer couldn’t save the file. Check its SD card is in and has space.”

Bambu printers store each print on their card. Put a card in, or delete old files from it, then send the plate again.

## The API key is wrong

The message says where to make a key, and differs by connection:

| Connection | Where to find the key |
|---|---|
| Klipper (Moonraker) | Mainsail or Fluidd, under Settings ▸ Authorization |
| PrusaLink | The printer, under Settings ▸ Network ▸ PrusaLink |
| OctoPrint | OctoPrint, under Settings ▸ Application Keys |

Paste the new key in **API key**, press Enter, then click **Test Connection**.

## The printer is busy, or out of storage

“The printer is busy. Wait for it to finish, then try again.” means a print is running. “The printer is out of storage. Delete some files on it, then try again.” means its storage is full. With Klipper, “Moonraker answered, but Klipper isn’t ready.” means the printer itself needs attention.

## “Install Bambu Studio to send prints” or “Install Bambu Connect from bambulab.com, then try again.”

The app the connection hands plates to isn't installed. Install it, or pick another option in **Send prints with**.
