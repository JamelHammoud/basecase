# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### To check

- Onshape
- Fusion

## Dataset export

### LeRobot

- **Link:** https://huggingface.co/docs/lerobot/lerobot-dataset-v3
- **Checked:** 2026-11-12
- **Basecase today:** Export Dataset writes a Case's passed tries as a LeRobot v2.1 dataset with GR00T's `meta/modality.json` ([Cases](../guide/cases.md)).
- **Better than Basecase:** LeRobotDataset v3.0 ships with `lerobot` 0.4.0 and later. It stores many episodes per Parquet and MP4 file, resolves episodes through metadata, and streams from the Hub ([LeRobotDataset v3](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)).
- **Worse than Basecase:** v2.1 datasets need converting first, with `python -m lerobot.scripts.convert_dataset_v21_to_v30` ([LeRobotDataset v3](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)).
- **Basecase should:** match it. Export v3 next to v2.1, which GR00T still reads ([Cases](../guide/cases.md)), and push to the Hub.

## Supplier carts

### To check

- Digi-Key
- Mouser
- Pololu
- Adafruit
- Amazon

## Printing

Sending to Bambu (Studio, Connect and LAN), Moonraker, PrusaLink and OctoPrint printers ships today ([Printing](../guide/printing.md)).

### Prusa Connect

- **Link:** https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608
- **Checked:** 2026-11-13
- **Basecase today:** sends plain G-code to a Prusa printer over PrusaLink on the local network, with the printer's API key, and reads status, pauses, resumes and cancels (`electron/print/connectors/prusalink.mjs`, [Printing](../guide/printing.md)). The printer catalog has two Prusa printers, the MINI and the MK3S (`src/data/printerCatalog.ts`).
- **Better than Basecase:** Prusa Connect is a free cloud service for Prusa owners, "available from anywhere", for print farms and production statistics, with 1 GB of storage. PrusaLink is built into the CORE One, MK4/S, MK3.9/S, MK3.5/S and XL, and runs on a Raspberry Pi for the MK3/S/+ ([Prusa help](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Worse than Basecase:** the article describes no API for another app to upload files or start prints through Connect ([Prusa help](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)), so a print sent from Basecase goes through PrusaLink.
- **Basecase should:** match the printers first. The Prusa printers with PrusaLink built in are missing from the catalog, so add them from OrcaSlicer's profiles ([OrcaSlicer](competitors.md#orcaslicer)); leave Connect until Prusa documents an upload API.

### To check

- Bambu Lab
