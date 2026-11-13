# Competitors

Tools a Basecase user could pick instead. Entry format and rules: [README](README.md).

## CAD

### Onshape

- **Link:** https://www.onshape.com
- **Checked:** 2026-11-12
- **Better than Basecase:** cloud-native CAD with "integrated version control with branching and merging built in" and "instant, secure collaboration across locations", with nothing to install ([home](https://www.onshape.com/en/)). The free plan is for non-commercial use ([pricing](https://www.onshape.com/en/pricing)).
- **Worse than Basecase:** on the free plan "All Onshape Documents are accessible to the public", and private data and commercial use need Standard at $1,500 or Professional at $2,500 per user per year ([pricing](https://www.onshape.com/en/pricing)). Basecase simulates, trains and lays out print plates in the same app ([Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate. Import Onshape documents, so a robot drawn there can be simulated, trained and printed in Basecase.

### Fusion

- **Link:** https://www.autodesk.com/products/fusion-360/overview
- **Checked:** 2026-11-13
- **Better than Basecase:** an established CAD tool whose free personal-use licence still exports STEP, STL, OBJ and FBX ([personal use](https://www-pt.autodesk.com/uk/products/fusion-360/personal)).
- **Worse than Basecase:** personal use allows "10 active and editable" documents and is for non-commercial users who make under $1,000 a year ([personal use](https://www-pt.autodesk.com/uk/products/fusion-360/personal)). Basecase simulates, trains and prints the robot in the same app ([Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate. See [integrations](integrations.md#fusion).

### Shapr3D

- **Link:** https://www.shapr3d.com
- **Checked:** 2026-11-13
- **Better than Basecase:** Parasolid-based CAD on Mac, iPad, iPhone and Windows, with Apple Pencil and SpaceMouse input. It imports and exports PRT, SLDPRT, CATPART, XT and STEP, and shares models through review links in the browser. Models go straight to Bambu Studio, OrcaSlicer or PrusaSlicer with their colours, "so multicolor prints are ready to go" ([home](https://www.shapr3d.com/)).
- **Worse than Basecase:** its home page names no assemblies, joints or motion ([home](https://www.shapr3d.com/)). The free Basic plan holds two projects and exports only "Basic resolution" STL and 3MF; Pro is $299 per seat per year ([pricing](https://www.shapr3d.com/pricing)). Basecase imports STL and 3MF as parts and STEP files as one part per body ([Inspector](../guide/inspector-and-selection.md)).
- **Basecase should:** beat it on the robot. Its free plan's STL and 3MF already import into Basecase, where the robot gets joints and a simulation ([Inspector](../guide/inspector-and-selection.md), [Simulate](../guide/simulate.md)); match its slicer hand-off too, since Basecase opens a multicolour robot in Bambu Studio as one file per material ([Printing](../guide/printing.md)).

## Simulation and training

### MuJoCo Playground

- **Link:** https://playground.mujoco.org
- **Checked:** 2026-11-12
- **Better than Basecase:** an Apache 2.0 suite of robot environments on MuJoCo or MuJoCo Warp, with large-batch GPU training and the same task layer in sim and on hardware, including zero-shot sim-to-real pick-cube on the SO-101 ([site](https://playground.mujoco.org)).
- **Worse than Basecase:** its robots are existing ones: SO-101 and i2rt YAM Pro in sim and real, Trossen WidowX AI and Unitree G1 in sim ([site](https://playground.mujoco.org)). Basecase writes the MJCF from a robot designed in it ([Simulate](../guide/simulate.md)).
- **Basecase should:** integrate. Basecase runs the same MuJoCo ([Simulate](../guide/simulate.md)); exporting a design as a Playground environment would let people train it on GPUs.

### Genesis

- **Link:** https://github.com/Genesis-Embodied-AI/Genesis
- **Checked:** 2026-11-12
- **Better than Basecase:** an Apache 2.0 simulation platform whose compiler targets CUDA, AMD ROCm, Apple Metal, Vulkan, x86 and ARM64, and that loads URDF, MJCF, OBJ, GLB and USD ([repository](https://github.com/Genesis-Embodied-AI/Genesis)).
- **Worse than Basecase:** it loads robot files made elsewhere ([repository](https://github.com/Genesis-Embodied-AI/Genesis)); Basecase writes the MJCF from a robot designed in it ([Simulate](../guide/simulate.md)).
- **Basecase should:** integrate. It reads MJCF, and Basecase writes MJCF from the scene ([Simulate](../guide/simulate.md)).

### Isaac Lab

- **Link:** https://isaac-sim.github.io/IsaacLab/main/index.html
- **Checked:** 2026-11-12
- **Better than Basecase:** a BSD-3-Clause robot learning framework with GPU physics (PhysX and Newton), Isaac Sim's photo-realistic RTX rendering, and workflows for reinforcement learning, learning from demonstrations and motion planning ([docs](https://isaac-sim.github.io/IsaacLab/main/index.html)).
- **Worse than Basecase:** imitation learning is still marked experimental ([docs](https://isaac-sim.github.io/IsaacLab/main/index.html)). Basecase records demonstrations from Cases and exports them as datasets ([Cases](../guide/cases.md)).
- **Basecase should:** beat it on the path from design to a trained policy, and integrate where its rendering matters.

### Zeromatter

- **Link:** https://zeromatter.com
- **Checked:** 2026-11-13
- **Better than Basecase:** one in-house engine for physics and sensors, with cameras, lidar, radar and infrared modeled down to rolling shutter, lens distortion and rain on the lens ([home](https://zeromatter.com/)). For robots it compares "sensor hardware, sensor placement, robot embodiment, and end-effectors" across competing designs before procurement, expands a few teleoperation demonstrations into "thousands of variations", replicates a facility from floor plans or lidar scans, and runs evaluations in CI ([robotics](https://zeromatter.com/use-cases/robotics)). It claims a "minimal sim-to-real gap, with receipts" from its own labs, and copilots, MCPs and CLIs so agents run scenarios as people do ([home](https://zeromatter.com/)).
- **Worse than Basecase:** sales-led, with "Talk to us" as the only way in and no public docs, pricing or benchmarks ([home](https://zeromatter.com/)). It has no CAD, parts, printing or build steps: a team brings its robot in. Basecase designs the robot, simulates and trains it, and prints and builds it in one app, self-serve ([Simulate](../guide/simulate.md), [Build](../guide/build.md), [Printing](../guide/printing.md)).
- **Basecase should:** beat it for people who build their own robots. Compare two designs of the same robot in the same Case (a different gripper, camera placement or servo) and show which passes more often. Multiply recorded demonstrations into varied ones for training ([Cases](../guide/cases.md)). Show the measured sim-to-real gap per joint from calibration as the receipt ([Robot runtime](../guide/robot-runtime.md)).

## Robot learning

### LeRobot

- **Link:** https://huggingface.co/docs/lerobot/index
- **Checked:** 2026-11-12
- **Better than Basecase:** a hardware-agnostic Python interface for real robots, from the SO-101 to humanoids, with teleoperation, recording, the LeRobotDataset format on the Hugging Face Hub, and policies from ACT to π₀ and SmolVLA; LeLab does the same in a browser GUI ([docs](https://huggingface.co/docs/lerobot/index)).
- **Worse than Basecase:** it starts from a robot that already exists; Basecase designs the robot and records demonstrations in simulation ([Cases](../guide/cases.md)).
- **Basecase should:** integrate. Basecase exports LeRobot datasets already ([Cases](../guide/cases.md)); see [integrations](integrations.md#lerobot).

## Robot data

### Foxglove

- **Link:** https://foxglove.dev
- **Checked:** 2026-11-12
- **Better than Basecase:** visualizes and manages multimodal robot data in MCAP, ROS 1, ROS 2, Protobuf, JSON and FlatBuffers. The Free plan has 10 GB, 3 users, 5 devices and 1 project; Pro starts at $20 a month plus usage ([pricing](https://foxglove.dev/pricing)).
- **Worse than Basecase:** it calls itself a data platform for visualizing and managing robot data ([pricing](https://foxglove.dev/pricing)); Basecase makes the robot and its data ([Cases](../guide/cases.md)).
- **Basecase should:** integrate. LeRobot can serve a dataset to Foxglove already ([LeRobotDataset v3](https://huggingface.co/docs/lerobot/lerobot-dataset-v3)), so a v3 export reaches it too.

## Printing

### Bambu Studio

- **Link:** https://github.com/bambulab/BambuStudio
- **Checked:** 2026-11-13
- **Better than Basecase:** Bambu's own slicer. 2.9.1, released 3 November, slices one model with different nozzle diameters per region, starting with the H3C. It also merges Color Split into Color Matching, adds conformal infill and shows how a 3MF's settings differ from the connected printer's ([2.9.1](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.01.70)).
- **Worse than Basecase:** it slices the parts it's given. Basecase picks each part's flat face, lays out plates per material and leaves parts that are already printed off the plates ([Printing](../guide/printing.md)).
- **Basecase should:** integrate, as it does: Basecase slices through Bambu Studio's command line and builds its printer catalog from Bambu Studio's machine profiles ([Printing](../guide/printing.md)). That catalog comes from Bambu Studio 2.8.4.61 (`src/data/printerCatalog.ts`) and has no H3C, so regenerate it from 2.9.1. Since it prints multi-material, open a multicolour design there as one project rather than one per material.

### OrcaSlicer

- **Link:** https://github.com/OrcaSlicer/OrcaSlicer
- **Checked:** 2026-11-13
- **Better than Basecase:** an AGPL-3.0 slicer for Bambu Lab, Prusa, Creality, Voron and more printers, with calibration prints and sending to Klipper, PrusaLink and OctoPrint ([repository](https://github.com/OrcaSlicer/OrcaSlicer)). 2.5.0, released 7 November, adds Python plugins, belt printers, colour mixing, an experimental Design tab for parametric parts, and the Bambu Lab H2C and A2L ([2.5.0](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.0)). Its Prusa profiles cover the CORE One, MK4S and XL ([profiles](https://github.com/OrcaSlicer/OrcaSlicer/tree/main/resources/profiles/Prusa/machine)).
- **Worse than Basecase:** its plugins "aren't a sandbox" ([2.5.0](https://github.com/OrcaSlicer/OrcaSlicer/releases/tag/v2.5.0)). It starts from finished parts; Basecase lays out the robot's printed parts and tracks which are printed ([Printing](../guide/printing.md)).
- **Basecase should:** integrate, as it does: Basecase slices with OrcaSlicer first for printers from other makers, and as the fallback for Bambu printers, and sends to Moonraker, PrusaLink and OctoPrint itself ([Printing](../guide/printing.md), `electron/print/jobs.mjs`). The printer catalog reads only Bambu Studio's profiles (`tools/printers/import.mjs`) and holds just the Prusa MINI and MK3S (`src/data/printerCatalog.ts`), so read OrcaSlicer's profiles too, giving the CORE One, MK4S and XL a real bed and presets.
