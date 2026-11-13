# Partners

Companies Basecase could work with: listing their parts, sending prints to their printers, or selling their kits. Entry format and rules: [README](README.md).

## Part makers

Makers with the most parts in the catalog (`src/data/components.ts`).

### To check

- Pololu
- Adafruit
- Raspberry Pi
- ROBOTIS
- Feetech
- Seeed Studio
- Intel RealSense
- Luxonis
- Unitree

## Printer makers

Bambu Lab printers are integrated already ([Printing](../guide/printing.md)).

### To check

- Bambu Lab
- Prusa Research
- Creality
- Elegoo

## Platforms

### Hugging Face

- **Link:** https://huggingface.co
- **Checked:** 2026-11-13
- **Better than Basecase:** hosts the datasets and policies LeRobot trains on ([LeRobot docs](https://huggingface.co/docs/lerobot/index)). PRO is $9 a month with 10× private storage, and storage past that costs $12 per TB a month for public repositories and $18 for private ones, with egress included ([pricing](https://huggingface.co/pricing)).
- **Worse than Basecase:** LeRobot's recording tutorial records a real robot driven by a teleoperation device "such as a leader arm or keyboard", and the person keeps or re-records each episode by hand with the arrow keys ([recording](https://huggingface.co/docs/lerobot/il_robots)). Basecase records tries in simulation, driven with the keyboard or a gamepad, and Export Dataset and Publish to Hugging Face keep only the tries the Case's contract passed ([Cases](../guide/cases.md)).
- **Basecase should:** integrate further, as it already does: Publish to Hugging Face sends a Case's passed tries to a Hub dataset repo as LeRobot v2.1, tagged `v2.1` ([Cases](../guide/cases.md)), which LeRobot 0.4 and later convert to v3 before reading ([integrations](integrations.md#lerobot)). Write v3, so `lerobot-train` takes the published repo id with no conversion ([recording](https://huggingface.co/docs/lerobot/il_robots)).

## Kit makers

### SO-101 kits

- **Link:** https://github.com/TheRobotStudio/SO-ARM100
- **Checked:** 2026-11-13
- **Better than Basecase:** The Robot Studio publishes the SO-101's STL files and a sourcing table: $121.94 for one follower arm and $229.88 for a leader and follower in the US, with EU, RMB and JPY tables too. Kits come from Seeed Studio, WowRobo, RobotEd, Robonine, PartaBot, ForgeMotion Labs and others, some printed and some assembled ([repository](https://github.com/TheRobotStudio/SO-ARM100)). The follower uses six Feetech STS3215 servos at 1/345 and the leader mixes 1/191, 1/345 and 1/147 gearing ([LeRobot SO-101](https://huggingface.co/docs/lerobot/so101)).
- **Worse than Basecase:** LeRobot's SO-101 guide starts from bought parts, then assembles, wires and calibrates both arms before either moves ([LeRobot SO-101](https://huggingface.co/docs/lerobot/so101)). In Basecase the SO-101 is a preset that imports with its joints, ready to pose and animate in the Pose tab ([Joints and motion](../guide/joints-and-motion.md)), and the catalog lists the STS3215 ([`src/data/components.ts`](../../src/data/components.ts)).
- **Basecase should:** integrate. When the SO-101 preset is in a scene, the Build tab's bill of materials ([Build](../guide/build.md)) should offer The Robot Studio's sourcing table and these kit sellers as another source for the preset's parts, so someone can buy the arm they just simulated.

### To check

- Pollen Robotics
- goBILDA

## Part suppliers

### To check

- Digi-Key
- Mouser
- McMaster-Carr
- Amazon
