# Competitors

Tools a Basecase user could pick instead. Entry format and rules: [README](README.md).

## CAD

### Onshape

- **Link:** https://www.onshape.com
- **Checked:** 2026-11-28
- **Better than Basecase:** release 1.224 on 20 November adds a context panel for assembly references, folder-level configured suppression and identification of parts missing mass in assembly center-of-mass calculations ([changelog](https://www.onshape.com/en/changelog/), [release](https://forum.onshape.com/discussion/32165)).
- **Worse than Basecase:** Free remains non-commercial with public documents. Standard is $1,500 per user per year with private storage, and Professional is $2,500 ([pricing](https://www.onshape.com/en/pricing)). Basecase connects imported assemblies to robot motion, training and printing ([Joints and motion](../guide/joints-and-motion.md), [Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate through the existing mate reader and identity-preserving Update from Onshape, which already retains assigned servos and user-added parts ([Joints and motion](../guide/joints-and-motion.md)). The new context panel is a useful reference for explaining source changes, but is not evidence that Basecase needs another assembly importer ([release](https://forum.onshape.com/discussion/32165)).

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

### Foxglove

- **Link:** https://foxglove.dev
- **Checked:** 2026-11-15
- **Better than Basecase:** supports MCAP, ROS 1, ROS 2, Protobuf, JSON and FlatBuffers through files and WebSocket. Free includes 10 GB, three users, five devices and one project. Pro starts at $20 per month plus usage, with 1 TB and three developer seats, then $42 per additional seat. Academic is free with 1 TB for eligible students, researchers and educators ([pricing](https://foxglove.dev/pricing)).
- **Worse than Basecase:** Foxglove's format and connection tools focus on robot data ([pricing](https://foxglove.dev/pricing)). Basecase also replays imported joint data on the robot's design, exposes topics on its timeline and reconstructs Case worlds from recorded scans ([Imported tries](../guide/cases.md#imported-tries), [Scan maps](../guide/cases.md#scan-maps)).
- **Basecase should:** integrate through the existing LeRobot v3 export, rather than add another dataset writer ([writer](../../src/datasets/lerobotExport.ts), [integration](integrations.md#lerobot)). LeRobot documents Foxglove playback over WebSocket through its dataset viewer ([viewer](https://huggingface.co/docs/lerobot/lerobot-dataset-v3#other-formats-and-implementations)).

## Vision

### Roboflow

- **Link:** https://roboflow.com
- **Checked:** 2026-11-28
- **Basecase today:** imports project and version links as COCO datasets using Settings ▸ Accounts, then trains and compares local models against held-out real images ([Imported image datasets](../guide/cases.md#imported-image-datasets), [Vision training](../guide/cases.md#vision-training)). Camera detections already feed tracking, counting and Case signals ([Cameras](../guide/cameras.md)).
- **Better than Basecase:** Inference combines fine-tuned and foundation models, composable Workflows, stream processing and prediction monitoring ([repository](https://github.com/roboflow/inference)). Its export documentation now specifies HTTP 202 with progress while an export is being prepared ([export API](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data#http-api)).
- **Plans:** Free includes 10 monthly credits. Core starts at $39 monthly with 20 total credits. Plans include private workspaces, model-weight downloads and self-hosted inference, while Enterprise has custom pricing ([pricing](https://roboflow.com/pricing)).
- **Worse than Basecase:** its quickstart starts an inference server before connecting streams ([quickstart](https://github.com/roboflow/inference#-quickstart)). Basecase already renders the designed robot's mounted cameras inside its Case world ([Cameras](../guide/cameras.md)).
- **Basecase should:** refine the existing importer to recognize the documented pending-export response before treating a missing download link as a refused host. The current reader recognizes only `ready: false`, so a documented progress reply without that field falls through to archive URL validation ([reader](../../electron/roboflow/index.mjs), [integration](integrations.md#roboflow)).

## Operate

### Viam

- **Link:** https://www.viam.com
- **Checked:** 2026-11-28
- **Better than Basecase:** the current setup documentation separates the machine runtime from its supervisor. Linux and Windows install `viam-agent` and `viam-server`, while macOS uses the server alone. The agent restarts the server and applies cloud version updates ([runtime and agent](https://docs.viam.com/set-up-a-machine/viam-agent-and-server/)). The platform offers telemetry storage, remote access, OTA updates and modular components ([pricing](https://www.viam.com/pricing)).
- **Pricing:** the first $5 of monthly cloud services remains free. Tabular storage is $0.25/GB/month, non-tabular storage $0.05/GB/month, upload $0.15/GB and egress $0.25/GB. Hot data store adds $2.50/GB storage and $0.00125/second compute, so ordinary storage rates alone do not describe that path ([pricing](https://www.viam.com/pricing)).
- **Worse than Basecase:** Viam's runtime reads a machine configuration and exposes component APIs ([runtime](https://docs.viam.com/set-up-a-machine/viam-agent-and-server/)). Basecase also holds the design, joint map, calibration and recorded tries. Its default motor transports remain emulated, so this comparison does not establish real-hardware performance ([Robot runtime](../guide/robot-runtime.md)).
- **Basecase should:** beat it on carrying design and calibration evidence into operation through the existing network daemon and installer ([Robot runtime](../guide/robot-runtime.md)). Treat the supervisor's Windows support as a verified capability, without assuming the macOS installation uses that same service ([runtime and agent](https://docs.viam.com/set-up-a-machine/viam-agent-and-server/)).

## Printing

### Bambu Studio

- **Link:** https://github.com/bambulab/BambuStudio
- **Checked:** 2026-11-28
- **Better than Basecase:** 2.9.2, released 24 November, adds P3C support and mixed nozzle diameters on H2D. The preview identifies nozzle and filament per move and estimates time per filament ([release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.02.62)).
- **Worse than Basecase:** the release's slicing features operate on supplied models ([release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.02.62)). Basecase also arranges robot parts by material and build order and retains printed inventory ([Printing](../guide/printing.md)).
- **Basecase should:** integrate current profiles through the existing importer, still pinned to 2.9.1, while preserving its exclusion of unsupported multi-tool configurations ([importer](../../tools/printers/import.mjs), [Printing](../guide/printing.md)). Keep mixed-nozzle slicing in Studio through the existing project handoff until Basecase's own model supports those assignments ([integration](integrations.md#bambu-lab)).

### OrcaSlicer

- **Link:** https://github.com/OrcaSlicer/OrcaSlicer
- **Checked:** 2026-11-28
- **Better than Basecase:** 2.5.2, released 21 November, fixes missing STEP faces, arrangement of near-bed-size parts and slicing crashes. It corrects overhang-speed slots in CORE One and CORE One L presets and tightens Snapmaker U1 rod clearances ([release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.2)).
- **Worse than Basecase:** its release notes describe model slicing and printer presets ([release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.2)). Basecase connects print preparation with a robot's build order and printed inventory ([Printing](../guide/printing.md)).
- **Basecase should:** refresh the catalog's 2.5.0 source pin and verify the corrected Prusa overhang speeds with installed Orca 2.5.2 profiles, since slicing resolves process values from the installed slicer and the catalog retains preset names and layer heights ([importer](../../tools/printers/import.mjs), [catalog](../../tools/printers/catalog.mjs), [profile reader](../../electron/print/slice.mjs), [release](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.2)). Shared obstacle volumes and conservative clearances already feed packing, dragging and Checks, with unsupported per-extruder and toolhead-offset volumes refused ([Printing](../guide/printing.md), [parser](../../tools/printers/obstacles.mjs)).
