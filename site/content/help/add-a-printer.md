---
title: Add a printer
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: task
order: 4
keywords:
  - 3d printer
  - bambu lab
  - p1s
  - x1c
  - a1
  - klipper
  - moonraker
  - prusalink
  - octoprint
  - prusa
  - core one
  - mk4s
  - orcaslicer
  - lan mode
  - access code
related:
  - print-a-robots-parts
  - troubleshoot-build-printer-wont-connect
  - export-plates-as-3mf
covers:
  - src/components/settings/PrintersPane.tsx
  - src/components/settings/PrinterEditor.tsx
  - src/data/printers.ts
  - src/data/printerCatalog.ts
  - electron/print/printers.mjs
  - electron/print/connectors/
  - electron/print/slicers.mjs
---

Save your printer once, so Print mode lays parts out on its real bed and sends sliced plates to it from the desktop app.

1. Press [[⌘,]] to open Settings, then choose **Printers**.
2. Click **Add Printer**.
3. Type a name in **Name**.
4. Pick your printer in **Model**. For a printer that isn't listed, pick **Custom printer** and type its **Build volume** in millimeters.
5. In **Send prints with**, choose how Basecase reaches the printer. The table below says what each one needs.
6. If the connection asks for one, type the printer's **Address**, such as 192.168.1.40.
7. Type the **Access code** or **API key**, and for Bambu LAN the **Serial number**.
8. Click **Test Connection**. The row reads “Connected to” and the printer's name when it works.

**Model** lists over a hundred printers, from the profiles Bambu Studio and OrcaSlicer ship. On first launch, Basecase adds the printer you last chose in Bambu Studio, if you have it. **Find on Network** in the same pane lists Bambu Lab, Klipper and OctoPrint printers it can see; click **Add** on one.

## Prusa printers

Prusa's CORE One, MK4, MK4S, MK3.5, MINI IS and XL slice with OrcaSlicer, so install it before you slice for them. The XL is its single-tool version; the 5-tool XL and printers with an MMU aren't listed.

![Settings ▸ Printers with a Prusa CORE One sending through PrusaLink](/help/add-your-printer/printers.png)

## Connections

| Send prints with | What happens | It needs |
|---|---|---|
| Bambu Studio | Opens sliced plates in Bambu Studio, where you start the print with your own sign-in | Bambu Studio installed |
| Bambu Connect | Hands sliced plates to Bambu Connect, where you pick the printer and start | Bambu Connect installed |
| Bambu LAN (Developer Mode) | Starts prints from Basecase and shows progress, layers and time left | **Address**, **Serial number** and **Access code** |
| Klipper (Moonraker) | Uploads and starts the print, with live progress | **Address** and **API key** |
| PrusaLink | Uploads and starts the print, with live progress | **Address** and **API key** |
| OctoPrint | Uploads and starts the print, with live progress | **Address** and **API key** |
| Export only | Sends nothing; you print the files yourself | Nothing |

Bambu printers offer the three Bambu connections, and every other printer offers the other three.

> [!WARNING]
> Bambu LAN needs LAN Only and Developer Mode turned on in the printer's settings, which Bambu doesn't support. Use Bambu Studio if you don't want either on.

## Where to find codes and keys

- **Bambu access code:** on the printer, in **Settings** ▸ **LAN Only**.
- **Bambu serial number:** on the printer, in **Settings** ▸ **Device**.
- **Klipper API key:** in Mainsail or Fluidd, under **Settings** ▸ **Authorization**.
- **PrusaLink API key:** on the printer, in **Settings** ▸ **Network** ▸ **PrusaLink**.
- **OctoPrint API key:** in OctoPrint, under **Settings** ▸ **Application Keys**.

Codes and keys are encrypted on your computer and never saved in a scene. One printer is marked **Default**, and every scene that hasn't picked a printer uses it. **Make Default** on another printer changes it.

Next, [print a robot's parts](/help/print-a-robots-parts).
