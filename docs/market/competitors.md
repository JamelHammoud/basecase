# Competitors

Tools a Basecase user could pick instead. Entry format and rules: [README](README.md).

## CAD

### Onshape

- **Link:** https://www.onshape.com
- **Checked:** 2026-11-15
- **Better than Basecase:** browser CAD with built-in branching, merging and collaboration. Its home page lists the 30 October release's URDF Merge Fastened feature ([home](https://www.onshape.com/en/)). Native URDF export targets robotics tools ([announcement](https://forum.onshape.com/discussion/30410/improvements-to-onshape-march-13-2026)), and 1.215 added frames, tool center points and adjustable STL and GLTF tessellation ([release](https://www.onshape.com/en/resource-center/what-is-new/mate-connectors-explicit-lights-render-studio-advanced-urdf-mate-limit-support-robotics-applications)).
- **Worse than Basecase:** Free is for non-commercial work and makes documents public. Standard costs $1,500 per user per year and includes private storage, while Professional costs $2,500 ([pricing](https://www.onshape.com/en/pricing)). Basecase combines robot motion, training and print preparation in the desktop app ([Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate through the existing assembly-link importer, which reads mates and their limits ([Joints and motion](../guide/joints-and-motion.md)). Compare native URDF output with that reader before changing import paths ([integration](integrations.md#onshape)).

### Fusion

- **Link:** https://www.autodesk.com/products/fusion-360/overview
- **Checked:** 2026-11-15
- **Better than Basecase:** combines CAD, CAM, CAE and PCB tools, with configurations, a bill of materials, automated drawings and cloud simulation in the paid product ([comparison](https://www.autodesk.com/products/fusion-360/personal)).
- **Worse than Basecase:** personal use is restricted to non-commercial projects and individuals generating less than $1,000 annually, with limited CAM, drawings and import/export formats ([comparison](https://www.autodesk.com/products/fusion-360/personal)). Basecase connects a robot's design to motion training and print plates ([Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate through the existing readers: Import takes STEP files, and Import Robot takes exported robot packages ([Inspector](../guide/inspector-and-selection.md), [integration](integrations.md#fusion), [Joints and motion](../guide/joints-and-motion.md)). The fetched comparison does not enumerate personal-use export formats, so it does not establish whether a particular format is included.

### Shapr3D

- **Link:** https://www.shapr3d.com
- **Checked:** 2026-11-15
- **Better than Basecase:** opens models directly in Bambu Studio, OrcaSlicer and PrusaSlicer on Mac and Windows, preserving colors, and offers browser slicing through Prusa EasyPrint with a Printables account ([home](https://www.shapr3d.com/)).
- **Worse than Basecase:** Basic holds two projects and exports basic-resolution STL and 3MF. Pro adds STEP and other formats for $299 per editor seat billed annually, excluding VAT ([pricing](https://www.shapr3d.com/pricing)). Those mesh exports can already enter Basecase, where the robot gets joints and a simulation ([Inspector](../guide/inspector-and-selection.md), [Simulate](../guide/simulate.md)).
- **Basecase should:** integrate using those exports and retain the existing multi-material slicer handoff. Basecase already opens one unsliced project with plates and per-part filament assignments, so that handoff does not need rebuilding ([Printing](../guide/printing.md)).

## Simulation and training

### MuJoCo Playground

- **Link:** https://playground.mujoco.org
- **Checked:** 2026-11-15
- **Better than Basecase:** Playground 1.0 uses PyTorch with MuJoCo or MuJoCo Warp, provides system identification from hardware trajectories and runs the same task and policy with sim or real mode. Its teleoperation workflow logs episodes as MCAP ([site](https://playground.mujoco.org)).
- **Worse than Basecase:** the showcased robot workflows start from SO-101, YAM Pro, WidowX AI and Unitree G1 assets ([site](https://playground.mujoco.org)). Basecase generates MJCF from the robot being designed ([Simulate](../guide/simulate.md)). This is a workflow comparison, not evidence that Playground cannot accept custom robots.
- **Basecase should:** integrate around the MJCF and recorded data Basecase already produces ([Simulate](../guide/simulate.md), [Cases](../guide/cases.md)). Treat a runnable Playground environment as more than a model export because its task and observation interfaces must also match.

### Genesis World

- **Link:** https://github.com/Genesis-Embodied-AI/genesis-world
- **Checked:** 2026-11-15
- **Better than Basecase:** combines rigid, FEM, MPM, particle and IPC physics, three camera rendering paths and a compiler targeting CUDA, ROCm, Apple Metal, Vulkan, x86 and ARM64. The repository includes depth, IMU, lidar, tactile and contact-force sensor examples ([repository](https://github.com/Genesis-Embodied-AI/genesis-world)).
- **Worse than Basecase:** its Python simulation interface loads assets such as URDF, MJCF, OBJ, GLB and USD ([repository](https://github.com/Genesis-Embodied-AI/genesis-world)). Basecase designs and checks the robot before generating its MJCF ([Simulate](../guide/simulate.md), [Build](../guide/build.md)).
- **Basecase should:** integrate through MJCF when a task needs these solvers, while testing model behavior rather than assuming that accepting the same format gives matching physics ([Simulate](../guide/simulate.md)).

### Isaac Lab

- **Link:** https://isaac-sim.github.io/IsaacLab/main/index.html
- **Checked:** 2026-11-15
- **Better than Basecase:** its 3.0 documentation describes shared scene, asset and sensor APIs across PhysX, OvPhysX and Newton, with RTX and Newton Warp rendering. Newton can run standalone without a full Isaac Sim installation and supports soft bodies, cloth and experimental cables ([docs](https://isaac-sim.github.io/IsaacLab/main/index.html)).
- **Worse than Basecase:** imitation learning, including Mimic and SkillGen, remains under Experimental Features in the fetched documentation ([docs](https://isaac-sim.github.io/IsaacLab/main/index.html)). Basecase records demonstrations from Cases and exports them with their task instructions ([Cases](../guide/cases.md)). The current landing page does not establish whether the latest tagged release is a beta.
- **Basecase should:** beat it on taking a new robot design into a recorded Case, and integrate where RTX rendering or a different physics backend serves a concrete task ([Cases](../guide/cases.md), [Simulate](../guide/simulate.md)).

### Zeromatter

- **Link:** https://zeromatter.com
- **Checked:** 2026-11-15
- **Better than Basecase:** describes an in-house physics and sensor engine with rolling shutter, lens distortion, lidar, radar and infrared, plus programmatic tooling ([home](https://zeromatter.com/)). Its robotics page compares sensor placement and end-effectors before procurement, expands demonstrations into variations and runs policy evaluations in reproduced facilities and CI ([robotics](https://zeromatter.com/use-cases/robotics)). These are vendor claims, not independently measured results.
- **Worse than Basecase:** the fetched pages offer a contact flow rather than public self-serve pricing ([home](https://zeromatter.com/), [robotics](https://zeromatter.com/use-cases/robotics)). Basecase connects editable robot parts to simulation, build checks and printing ([Simulate](../guide/simulate.md), [Build](../guide/build.md), [Printing](../guide/printing.md)). The pages alone do not establish that Zeromatter lacks CAD or build features.
- **Basecase should:** beat it on measurable evidence for a robot someone can build, using the existing Case outcomes and joint calibration records ([Cases](../guide/cases.md), [Robot runtime](../guide/robot-runtime.md)). Keep vendor sim-to-real claims separate from measured performance when comparing designs ([home](https://zeromatter.com/)).

## Robot learning

### LeRobot

- **Link:** https://huggingface.co/docs/lerobot/index
- **Checked:** 2026-11-15
- **Better than Basecase:** provides a hardware-agnostic Python robot interface, synchronized video and action/state datasets, Hub streaming, and ACT, SmolVLA and other policies. LeLab exposes calibration, recording and training in a browser, and the Dataset Visualizer plays Hub datasets without installation ([docs](https://huggingface.co/docs/lerobot/index)).
- **Worse than Basecase:** its real-robot path starts after assembly and calibration, although it also offers training and evaluation without hardware ([docs](https://huggingface.co/docs/lerobot/index)). Basecase designs the robot and records demonstrations in its Case world ([Cases](../guide/cases.md)).
- **Basecase should:** integrate using the v3 export and Hub publication that already ship, with the v2.1 copy retained for GR00T ([Cases](../guide/cases.md), [integration](integrations.md#lerobot)).

## Robot data

### Roboflow

- **Link:** https://docs.roboflow.com/
- **Checked:** 2026-11-14
- **Better than Basecase:** Roboflow manages computer vision datasets, annotation and model training, and exports versioned datasets through its web app, SDK, REST API or CLI in COCO, YOLO, Pascal VOC and other formats ([dataset exports](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data)).
- **Worse than Basecase:** its exported dataset versions are training snapshots with compressed images ([export behavior](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data#export-behavior)). Basecase also makes labeled training images from a robot's own Case, with camera metadata and radial depth, then keeps imported and generated images in the same versioned datasets ([Cases](../guide/cases.md#training-images)).
- **Basecase should:** integrate, as it does: Import Robot reads a project or version link through Roboflow's COCO export, with the API key in Settings ▸ Accounts. Local COCO, YOLO and Pascal VOC exports also import into Library with image and class counts ([Cases](../guide/cases.md#imported-image-datasets)).

### Foxglove

- **Link:** https://foxglove.dev
- **Checked:** 2026-11-15
- **Better than Basecase:** supports MCAP, ROS 1, ROS 2, Protobuf, JSON and FlatBuffers through files and WebSocket. Free includes 10 GB, three users, five devices and one project. Pro starts at $20 per month plus usage, with 1 TB and three developer seats, then $42 per additional seat. Academic is free with 1 TB for eligible students, researchers and educators ([pricing](https://foxglove.dev/pricing)).
- **Worse than Basecase:** Foxglove's format and connection tools focus on robot data ([pricing](https://foxglove.dev/pricing)). Basecase also replays imported joint data on the robot's design, exposes topics on its timeline and reconstructs Case worlds from recorded scans ([Imported tries](../guide/cases.md#imported-tries), [Scan maps](../guide/cases.md#scan-maps)).
- **Basecase should:** integrate through the existing LeRobot v3 export, rather than add another dataset writer ([writer](../../src/datasets/lerobotExport.ts), [integration](integrations.md#lerobot)). LeRobot documents Foxglove playback over WebSocket through its dataset viewer ([viewer](https://huggingface.co/docs/lerobot/lerobot-dataset-v3#other-formats-and-implementations)).

## Vision

### Roboflow

- **Link:** https://roboflow.com
- **Checked:** 2026-11-14
- **Basecase today:** imports Roboflow project and version links as COCO image datasets through the desktop account key ([Imported image datasets](../guide/cases.md#imported-image-datasets)). It trains local detection, segmentation, keypoint and classification models from frozen image datasets, compares them on held-out real images and retains a model only after a strict score increase within recorded task limits ([Vision training](../guide/cases.md#vision-training)). Local camera detections feed Case signals and Routines ([Cameras](../guide/cameras.md)).
- **Better than Basecase:** Inference runs detection, classification and segmentation on camera streams, with tracking, counting and composable Workflows. It hosts fine-tuned and foundation models, monitors predictions and connects results to external systems ([Inference](https://github.com/roboflow/inference)). Basecase's training and comparison history stay local ([Vision training](../guide/cases.md#vision-training)).
- **Plans:** Free includes 10 monthly credits, private projects and unlimited admin seats. Core starts at $39 per month, billed monthly, for 20 total monthly credits. Enterprise has custom pricing. Self-hosted inference is included on every plan, while hosted inference, training and AI labeling consume credits ([pricing](https://roboflow.com/pricing)).
- **Worse than Basecase:** its quickstart installs an inference server and connects cameras to it ([Inference quickstart](https://github.com/roboflow/inference#-quickstart)). Basecase already holds the robot's camera mounts, lenses and Case world, and renders those camera views inside the simulation ([Cameras](../guide/cameras.md)).
- **Basecase should:** connect retained models' real-image evidence with the Case and Routine contracts that consume their detections ([Vision training](../guide/cases.md#vision-training), [Routines](../guide/routines.md#ml-nodes)).

## Operate

### Viam

- **Link:** https://www.viam.com
- **Checked:** 2026-11-14
- **Better than Basecase:** `viam-server` runs on a robot's computer, with Linux arm64 and x86_64 installation paths. Its agent manages the server and machine software as a service ([server reference](https://docs.viam.com/operate/reference/viam-server/manage-viam-server/)). The developer platform includes sensor data storage, fleet management, remote access, OTA updates, modular drivers and SDKs ([pricing](https://www.viam.com/pricing)).
- **Pricing:** the first $5 of monthly cloud services is free. Published usage rates include $0.25/GB/month for tabular data, $0.05/GB/month for non-tabular storage, $0.15/GB uploaded and $0.25/GB downloaded ([pricing](https://www.viam.com/pricing)).
- **Worse than Basecase:** Viam's installation starts from a machine and its configuration ([Pi setup](https://docs.viam.com/reference/device-setup/rpi-setup/)). Basecase already holds the robot's design, joint mapping and calibration, and can export those files together ([Robot runtime](../guide/robot-runtime.md)). Its local emulator, mode ladder and fault matrix run without a cloud account. Real motors remain locked, so this is evidence from emulation rather than a hardware comparison ([Robot runtime](../guide/robot-runtime.md)).
- **Basecase should:** beat it on taking the same design through simulation, training, installation and operation. Use the design's joint map and calibration for deployment, retain the robot-side watchdog, and bring measured runs back into the same tries store ([Robot runtime](../guide/robot-runtime.md)).

## Printing

### Bambu Studio

- **Link:** https://github.com/bambulab/BambuStudio
- **Checked:** 2026-11-15
- **Better than Basecase:** 2.9.1, released 3 November, adds H3C support and mixed nozzle diameters within regions of one model, each using its appropriate layer height. This release supports that feature on the H3C first ([release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.01.70)).
- **Worse than Basecase:** its slicing workflow starts from models ([release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.01.70)). Basecase arranges a robot's parts by material and build order, chooses print orientation and can leave printed parts off the plates ([Printing](../guide/printing.md)).
- **Basecase should:** integrate through the existing CLI slicing and GUI project handoff. Open in Bambu Studio already includes all plates and per-part filament assignments in one unsliced project, while CLI slicing stays per material because it cannot take per-object filaments with 3MF input ([Printing](../guide/printing.md)). The catalog importer is pinned to this release ([importer](../../tools/printers/import.mjs)).

### OrcaSlicer

- **Link:** https://github.com/OrcaSlicer/OrcaSlicer
- **Checked:** 2026-11-15
- **Better than Basecase:** 2.5.0, released 7 November, adds Python plugins, belt printing, color mixing and an experimental parametric Design tab. Toolhead collision volumes keep arrangement, brims and travel clear of bed clips and tool docks ([release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.0)).
- **Worse than Basecase:** plugin permissions are not a sandbox ([release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.0)). Basecase keeps print preparation connected to the robot's build order and printed inventory ([Printing](../guide/printing.md)).
- **Basecase should:** integrate Orca's obstacle definitions into plate checks and packing because Basecase currently reads only bed_exclude_area polygons and arranges its own plates before slicing with arrangement disabled ([reader](../../tools/printers/catalog.mjs), [Printing](../guide/printing.md)). Extend the catalog importer and shared fit path with collision geometry and its required clearances, checked with a clip and a tool-dock fixture ([Orca release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.0)).
