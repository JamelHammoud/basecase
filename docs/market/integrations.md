# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### Onshape

- **Link:** https://onshape-public.github.io/docs/api-adv/translation/
- **Checked:** 2026-11-13
- **Basecase today:** no Onshape link. A STEP file exported from Onshape imports as one part per body, without joints ([Inspector](../guide/inspector-and-selection.md)).
- **Better than Basecase:** Onshape's API exports a whole assembly as STEP, glTF or OBJ through `createAssemblyExportStep`, `createAssemblyExportGltf` and `createAssemblyExportObj`, and every call is authenticated ([translation](https://onshape-public.github.io/docs/api-adv/translation/)). onshape-to-robot exports an Onshape robot as URDF, SDF or MuJoCo: a mate connector named `dof_…` becomes a joint, revolute and cylindrical mates turn into revolute joints, sliders into prismatic ones, and Onshape's joint limits carry over ([onshape-to-robot](https://onshape-to-robot.readthedocs.io/en/latest/design.html)).
- **Worse than Basecase:** onshape-to-robot ignores every other mate type ([onshape-to-robot](https://onshape-to-robot.readthedocs.io/en/latest/design.html)). Basecase imports its URDF and MuJoCo output already ([Joints and motion](../guide/joints-and-motion.md)).
- **Basecase should:** integrate. Import the assembly through the API with its mates as joints, reading `dof_` names the way onshape-to-robot does, so robots built for it import unchanged.

### Fusion

- **Link:** https://github.com/syuntoku14/fusion2urdf
- **Checked:** 2026-11-13
- **Basecase today:** a STEP file exported from Fusion imports as one part per body, without joints ([Inspector](../guide/inspector-and-selection.md)). Import Robot reads URDF and MJCF, not xacro ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** fusion2urdf exports a Fusion design's Rigid, Slider and Revolute joints, with their limits, as a ROS `{robot_name}_description` package with STL meshes and Gazebo launch files ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)).
- **Worse than Basecase:** since 2020 it writes xacro instead of URDF, and its last dated change is from 2021 ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)).
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
- **Basecase today:** sends G-code to PrusaLink on the local network ([Printing](../guide/printing.md)).
- **Better than Basecase:** Prusa Connect is a cloud service, free for Prusa owners with 1 GB of storage, that works "from anywhere" and tracks every printer in a farm; PrusaLink works only on the local network. CORE One, MK4/S, MK3.9/S, MK3.5/S and XL have both built in ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Worse than Basecase:** the page says PrusaSlicer reaches Connect but doesn't describe an upload API for other apps ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Basecase should:** integrate once Prusa documents uploads to Connect, so a print reaches a printer that isn't on the same network; until then, PrusaLink covers one that is.

### To check

- Bambu Lab
