# Competitors

Tools a Basecase user could pick instead. Entry format and rules: [README](README.md).

## CAD

### Onshape

- **Link:** https://www.onshape.com
- **Checked:** 2026-11-12
- **Better than Basecase:** cloud-native CAD with "integrated version control with branching and merging built in" and "instant, secure collaboration across locations", with nothing to install ([home](https://www.onshape.com/en/)). The free plan is for non-commercial use ([pricing](https://www.onshape.com/en/pricing)).
- **Worse than Basecase:** on the free plan "All Onshape Documents are accessible to the public", and private data and commercial use need Standard at $1,500 or Professional at $2,500 per user per year ([pricing](https://www.onshape.com/en/pricing)). Basecase simulates, trains and lays out print plates in the same app ([Simulate](../guide/simulate.md), [Printing](../guide/printing.md)).
- **Basecase should:** integrate. Import Onshape documents, so a robot drawn there can be simulated, trained and printed in Basecase.

### Shapr3D

- **Link:** https://www.shapr3d.com
- **Checked:** 2026-11-13
- **Better than Basecase:** "CAD that's simple enough for beginners and powerful enough for engineers", with one-click rendering, and models go straight into Bambu Studio, OrcaSlicer or PrusaSlicer with their colours carried over, "so multicolor prints are ready to go" ([home](https://www.shapr3d.com)). It runs on macOS, Windows, iPadOS and visionOS; Pro is $299 a year per Editor seat ([pricing](https://www.shapr3d.com/pricing)).
- **Worse than Basecase:** the free Basic plan holds 2 projects and exports only low-resolution 3MF and STL; STEP export needs Pro ([pricing](https://www.shapr3d.com/pricing)). Its home page mentions no assemblies, joints, motion or simulation ([home](https://www.shapr3d.com)); Basecase rigs joints and simulates the robot ([Joints and motion](../guide/joints-and-motion.md), [Simulate](../guide/simulate.md)).
- **Basecase should:** beat it at the slicer hand-off. Basecase opens sliced plates in Bambu Studio one file per material ([Printing](../guide/printing.md)), so a multicolour robot arrives as several projects; opening it as one Bambu Studio project, each part with its own filament, matches what Shapr3D promises. Its 3MF and STEP exports already import into Basecase ([Inspector and selection](../guide/inspector-and-selection.md)).

### To check

- Fusion: autodesk.com answered 403 to every page fetched on 2026-11-13

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
- **Better than Basecase:** an AGPL-3.0 slicer, based on PrusaSlicer, with multi-plate management, auto-arrange and auto-orient, multi-material printing, settings per object and part, and remote control and monitoring through an optional networking plugin built on non-free libraries ([repository](https://github.com/bambulab/BambuStudio)). 2.9.1, released on 3 November, adds the H3C multi-nozzle printer and mixed nozzle diameter slicing, so "each nozzle print at its own appropriate layer height" ([releases](https://github.com/bambulab/BambuStudio/releases)).
- **Worse than Basecase:** it slices meshes it's given ([repository](https://github.com/bambulab/BambuStudio)). Basecase picks each part's print pose from the design, packs plates per material, and skips parts already printed until they change ([Printing](../guide/printing.md)).
- **Basecase should:** integrate. Basecase already slices with its CLI and opens plates in it ([Printing](../guide/printing.md)). Since it does multi-material printing, open a multicolour design there as one project rather than one per material.

### OrcaSlicer

- **Link:** https://github.com/SoftFever/OrcaSlicer
- **Checked:** 2026-11-13
- **Better than Basecase:** an AGPL-3.0 slicer for "Bambu Lab, Prusa, Creality, Voron, and more", with calibration towers for temperature, flow and retraction, and sending to Klipper, PrusaLink and OctoPrint ([repository](https://github.com/SoftFever/OrcaSlicer)). 2.5.0, released on 7 November, adds Python plugins, belt printers, toolhead collision volumes that keep Arrange clear of obstacles, an experimental Design tab, and the Bambu Lab H2C and A2L ([2.5.0](https://github.com/SoftFever/OrcaSlicer/releases/tag/v2.5.0)). Its Prusa profiles cover the CORE One, MK4S and XL ([profiles](https://github.com/SoftFever/OrcaSlicer/tree/main/resources/profiles/Prusa/machine)).
- **Worse than Basecase:** it slices meshes it's given ([repository](https://github.com/SoftFever/OrcaSlicer)); Basecase lays out plates from the design and tracks what's printed ([Printing](../guide/printing.md)).
- **Basecase should:** integrate further. Basecase slices with it for printers that aren't Bambu (`electron/print/jobs.mjs`), but its printer catalog comes from Bambu Studio's profiles only (`tools/printers/import.mjs`) and holds just two Prusa printers, the MINI and MK3S (`src/data/printerCatalog.ts`). Read OrcaSlicer's profiles too, so the CORE One, MK4S and XL get a real bed and presets.
