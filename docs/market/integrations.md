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

### To check

- Bambu Lab
- Prusa Connect
