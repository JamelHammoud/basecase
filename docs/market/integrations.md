# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### Onshape

- **Link:** https://onshape-public.github.io/docs/api-adv/translation/
- **Checked:** 2026-11-13
- **Basecase today:** no Onshape link. A STEP file exported from Onshape imports as one part per body, without joints ([Inspector](../guide/inspector-and-selection.md)). Import Robot opens the URDF or MJCF an exporter writes, from a link, a GitHub repo, a zip or a folder, with each joint's axis and limits ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** Onshape's API exports a whole assembly as STEP, glTF or OBJ through `createAssemblyExportStep`, `createAssemblyExportGltf` and `createAssemblyExportObj`, and every call is authenticated ([translation](https://onshape-public.github.io/docs/api-adv/translation/)). onshape-to-robot exports an Onshape robot as URDF, SDF or MuJoCo ([docs](https://onshape-to-robot.readthedocs.io/en/latest/)). A mate connector named `dof_…` becomes a joint: revolute and cylindrical mates turn into revolute joints, sliders into prismatic ones and fastened mates into fixed ones, `inv` flips the axis, and Onshape's joint limits carry over. `frame_…` adds a frame, written as a MuJoCo site, and `closing_…` closes a kinematic loop ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)).
- **Worse than Basecase:** onshape-to-robot is a command-line tool that needs Onshape API authentication ([docs](https://onshape-to-robot.readthedocs.io/en/latest/)), ignores every other mate type, and only exports a robot once the designer renames mate connectors ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)). Basecase imports its URDF and MuJoCo output already, with no account: Import Robot reads them from a link, a GitHub or Hugging Face repo, a zip or a dropped folder ([Joints and motion](../guide/joints-and-motion.md)).
- **Basecase should:** integrate. Import the assembly through the API with its mates as joints, reading the `dof_`, `inv`, `frame_` and `closing_` names the way onshape-to-robot does, so robots built for it import unchanged.

### Fusion

- **Link:** https://github.com/syuntoku14/fusion2urdf
- **Checked:** 2026-11-13
- **Basecase today:** a STEP file exported from Fusion imports as one part per body, without joints ([Inspector](../guide/inspector-and-selection.md)). Import Robot reads URDF and MJCF, not xacro ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** fusion2urdf exports a Fusion design's Rigid, Slider and Revolute joints, with their limits, as a ROS `{robot_name}_description` package with STL meshes per part and launch files for RViz and Gazebo ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)).
- **Worse than Basecase:** since 2020 it writes xacro instead of URDF, "Nested components are not supported", it can silently write an abnormal URDF, and its last dated change is from 2021 ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)). Basecase keeps a robot's revolute and prismatic joints in the scene it was designed in ([Joints and motion](../guide/joints-and-motion.md)) and writes the MuJoCo model from that scene, so there is no export step to go wrong ([Simulate](../guide/simulate.md)).
- **Basecase should:** integrate. Expand xacro on import, so the package fusion2urdf writes opens through Import Robot with its joints and limits ([Joints and motion](../guide/joints-and-motion.md)).

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
- **Basecase today:** sends G-code, pulled from the sliced 3MF, to PrusaLink on the local network with the printer's API key, and reads status, pauses, resumes and cancels (`electron/print/connectors/prusalink.mjs`, [Printing](../guide/printing.md)). The printer catalog has two Prusa printers, the MINI and the MK3S (`src/data/printerCatalog.ts`).
- **Better than Basecase:** Prusa Connect is a cloud service, free for Prusa owners with 1 GB of storage, that works "from anywhere" through the web, PrusaSlicer or the Prusa app, and tracks every printer in a farm with production statistics; PrusaLink works only on the local network. CORE One, MK4/S, MK3.9/S, MK3.5/S and XL have both built in ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Worse than Basecase:** the page says PrusaSlicer reaches Connect but doesn't describe an upload API for other apps, and xBuddy firmware older than 6.4.0 can't connect ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)). Basecase lays out and slices its own plates and sends the G-code to PrusaLink from Print Plate N in the Print panel, with no cloud account ([Printing](../guide/printing.md)).
- **Basecase should:** integrate once Prusa documents uploads to Connect, so a print reaches a printer that isn't on the same network; until then, PrusaLink covers one that is. First add the Prusa printers with PrusaLink built in to the catalog, from OrcaSlicer's profiles ([OrcaSlicer](competitors.md#orcaslicer)).

### To check

- Bambu Lab
