# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### Onshape

- **Link:** https://onshape-public.github.io/docs/api-adv/translation/
- **Checked:** 2026-11-13
- **Basecase today:** Import Robot takes an Onshape assembly tab's link in the desktop app, with API keys from Settings. It reads the assembly's mates, exports each distinct part as STEP and converts it, fuses fastened parts into one link, and makes revolute mates hinges and sliders slides with their limits. Limits come from the root assembly's features only, so a mate inside a subassembly imports with no range; cylindrical, ball, planar and other mates become fixed joints, listed in Checks as Fixed Mates ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** Onshape "exports natively to the Unified Robot Description Format (URDF)": one call to the assembly's `/translations` endpoint with `"formatName": "URDF"` and `"urdfMeshFormat": "GLTF"`, and a `configuration` in the same call exports a configured assembly ([forum, March 2026](https://forum.onshape.com/discussion/30410/improvements-to-onshape-march-13-2026)). Release 1.215 added frames, tool center points and mate limits to that export ([1.215](https://www.onshape.com/en/resource-center/what-is-new/mate-connectors-explicit-lights-render-studio-advanced-urdf-mate-limit-support-robotics-applications)). onshape-to-robot exports URDF, SDF or MuJoCo from mate connectors named `dof_…`, with revolute and cylindrical mates as revolute joints, `inv` flipping the axis, `frame_…` written as a MuJoCo site and `closing_…` closing a kinematic loop ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)).
- **Worse than Basecase:** Onshape's public translation docs don't list URDF yet, every call is authenticated ([translation](https://onshape-public.github.io/docs/api-adv/translation/)), and the forum names no documentation or mate-to-joint mapping for the export ([forum](https://forum.onshape.com/discussion/30410/improvements-to-onshape-march-13-2026)). onshape-to-robot is a command line tool that only exports a robot once the designer renames mate connectors ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)). Basecase needs no renaming: it reads the mates as they are ([Joints and motion](../guide/joints-and-motion.md)).
- **Basecase should:** integrate further. Ask Onshape for its own URDF of the same assembly beside the mate reader, and take its frames and tool center points as named points on the robot and its limits for mates inside subassemblies, which the current import leaves without a range ([Joints and motion](../guide/joints-and-motion.md)).

### Fusion

- **Link:** https://github.com/syuntoku14/fusion2urdf
- **Checked:** 2026-11-13
- **Basecase today:** a STEP file exported from Fusion imports as one part per body, without joints ([Inspector](../guide/inspector-and-selection.md)). Import Robot expands xacro before reading the URDF, naming fusion2urdf packages as one source, and keeps each revolute and prismatic joint's axis and limits ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** fusion2urdf exports a Fusion design's Rigid, Slider and Revolute joints, with their limits, as a ROS `{robot_name}_description` package with STL meshes per part and launch files for RViz and Gazebo ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)).
- **Worse than Basecase:** since 2020 it writes xacro instead of URDF, "Nested components are not supported", it can silently write an abnormal URDF, and its last dated change is from 2021 ([fusion2urdf](https://github.com/syuntoku14/fusion2urdf)). Basecase keeps a robot's revolute and prismatic joints in the scene it was designed in ([Joints and motion](../guide/joints-and-motion.md)) and writes the MuJoCo model from that scene, so there is no export step to go wrong ([Simulate](../guide/simulate.md)).
- **Basecase should:** integrate, as it does: the package fusion2urdf writes opens through Import Robot ([Joints and motion](../guide/joints-and-motion.md)). A Fusion assembly read directly, as Onshape's is, would skip the unmaintained exporter.

## Dataset export

### LeRobot

- **Link:** https://huggingface.co/docs/lerobot/lerobot-dataset-v3
- **Checked:** 2026-11-13
- **Basecase today:** Export Dataset writes a Case's passed tries as a LeRobot v2.1 dataset with GR00T's `meta/modality.json`, and Publish to Hugging Face pushes the same files to a Hub dataset repo tagged `v2.1` ([Cases](../guide/cases.md), [help](../../site/content/help/publish-a-dataset-to-hugging-face.md)).
- **Better than Basecase:** LeRobotDataset v3.0 ships with `lerobot` 0.4.0 and later. It stores many episodes per Parquet and MP4 file, resolves episodes through metadata, and streams from the Hub or an HF Storage Bucket with `--dataset.streaming=true`. A v3 dataset can also be stored as LanceDB tables, and `lerobot-dataset-viz` opens an episode in Rerun or, with `--display-mode foxglove`, in Foxglove ([LeRobotDataset v3](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)).
- **Worse than Basecase:** v2.1 datasets need converting first, with `python -m lerobot.scripts.convert_dataset_v21_to_v30` ([LeRobotDataset v3](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)). Basecase's datasets keep only the tries the Case's contract passed ([Cases](../guide/cases.md)).
- **Basecase should:** match it. Write v3 next to v2.1, which GR00T still reads ([Cases](../guide/cases.md)), and publish both to the Hub, so `lerobot-train` streams a Case's tries with no conversion and Foxglove plays them ([Foxglove](competitors.md#foxglove)).

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
- **Basecase today:** sends G-code, pulled from the sliced 3MF, to PrusaLink on the local network with the printer's API key, and reads status, pauses, resumes and cancels (`electron/print/connectors/prusalink.mjs`, [Printing](../guide/printing.md)). The printer catalog has the Prusa CORE One, CORE One L, MK4, MK4S, MK3.5, MINI, MK3S and XL from OrcaSlicer's and Bambu Studio's profiles ([Printing](../guide/printing.md)).
- **Better than Basecase:** Prusa Connect is a cloud service, free for Prusa owners with 1 GB of storage, that works "from anywhere" through the web, PrusaSlicer or the Prusa app, and tracks every printer in a farm with production statistics; PrusaLink works only on the local network. CORE One, MK4/S, MK3.9/S, MK3.5/S and XL have both built in ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Worse than Basecase:** the page says PrusaSlicer reaches Connect but doesn't describe an upload API for other apps, and xBuddy firmware older than 6.4.0 can't connect ([Prusa](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)). Basecase lays out and slices its own plates and sends the G-code to PrusaLink from Print Plate N in the Print panel, with no cloud account ([Printing](../guide/printing.md)).
- **Basecase should:** integrate once Prusa documents uploads to Connect, so a print reaches a printer that isn't on the same network; until then, PrusaLink covers one that is, and the catalog already has the printers that have it built in ([Printing](../guide/printing.md)).

### To check

- Bambu Lab
