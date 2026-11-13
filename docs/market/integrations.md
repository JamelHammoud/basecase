# Integrations

Imports, exports and services Basecase connects to, and how far each goes. Entry format and rules: [README](README.md).

## CAD import

### Onshape

- **Link:** https://onshape-to-robot.readthedocs.io/en/latest/
- **Checked:** 2026-11-13
- **Basecase today:** no Onshape link. Import Robot opens the URDF or MJCF an exporter writes, from a link, a GitHub repo, a zip or a folder, with each joint's axis and limits ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** onshape-to-robot exports an Onshape assembly as URDF, SDF or MuJoCo ([docs](https://onshape-to-robot.readthedocs.io/en/latest/)). A mate connector named `dof_…` becomes a joint: revolute or cylindrical mates give revolute joints, sliders give prismatic, fastened gives fixed, and `inv` flips the axis. `frame_…` adds a frame, written as a MuJoCo site, and `closing_…` closes a kinematic loop. "Other mates are not considered" ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)).
- **Worse than Basecase:** it is a command-line tool that needs Onshape API authentication ([docs](https://onshape-to-robot.readthedocs.io/en/latest/)), and the robot only works once the designer renames mate connectors ([design](https://onshape-to-robot.readthedocs.io/en/latest/design.html)). Basecase's Import Robot needs no account: it reads a URDF or MJCF from a link, a GitHub or Hugging Face repo, a zip or a dropped folder ([Joints and motion](../guide/joints-and-motion.md)).
- **Basecase should:** integrate. When Basecase reads Onshape assemblies, it should treat the `dof_`, `inv`, `frame_` and `closing_` names as onshape-to-robot does, so a robot already set up for it opens with the same joints.

### Fusion

- **Link:** https://github.com/syuntoku14/fusion2urdf
- **Checked:** 2026-11-13
- **Basecase today:** no Fusion link. Import Robot reads URDF and MJCF with STL meshes from a folder or zip ([Joints and motion](../guide/joints-and-motion.md)).
- **Better than Basecase:** fusion2urdf is a Fusion script that writes a ROS `{robot_name}_description` package: xacro, STL meshes per part, and launch files for RViz and Gazebo ([repository](https://github.com/syuntoku14/fusion2urdf)).
- **Worse than Basecase:** "Nested components are not supported", it "currently supports only "Rigid", "Slider" and "Revolute"" joints, it can silently write an abnormal URDF, and its last dated fix is from 2021 ([repository](https://github.com/syuntoku14/fusion2urdf)). Basecase keeps a robot's revolute and prismatic joints in the scene it was designed in ([Joints and motion](../guide/joints-and-motion.md)) and writes the MuJoCo model from that scene, so there is no export step to go wrong ([Simulate](../guide/simulate.md)).
- **Basecase should:** integrate. Its output is xacro, so Import Robot has to expand xacro before a fusion2urdf package opens with its joints.

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
- **Basecase today:** sends G-code to Prusa printers through PrusaLink on the local network, pulled from the sliced 3MF ([Printing](../guide/printing.md)).
- **Better than Basecase:** Prusa Connect is "a cloud service, available from anywhere", reached from the web, PrusaSlicer or the Prusa app. It runs whole print farms and keeps production statistics, it's free for Prusa printer owners with 1 GB of cloud storage, and it covers the CORE One family, MK4/S, MK3.9/S, MK3.5/S, XL, MINI/+ and more. PrusaLink "is accessible only within your local network" ([Prusa help](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)).
- **Worse than Basecase:** the article describes no way for another app to send to it, and xBuddy firmware older than 6.4.0 can't connect ([Prusa help](https://help.prusa3d.com/article/prusa-connect-and-prusalink-explained_302608)). Basecase lays out and slices its own plates and sends the G-code to PrusaLink from Print Plate N in the Print panel, with no cloud account ([Printing](../guide/printing.md)).
- **Basecase should:** integrate once Prusa documents a way in. Until then, PrusaLink covers a printer on the same network ([Printing](../guide/printing.md)).

### To check

- Bambu Lab
