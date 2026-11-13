# Partners

Companies Basecase could work with: listing their parts, sending prints to their printers, or selling their kits. Entry format and rules: [README](README.md).

## Part makers

Makers with the most parts in the catalog (`src/data/components.ts`).

### Feetech

- **Link:** https://www.feetechrc.com
- **Checked:** 2026-11-13
- **Better than Basecase:** makes the STS3215 behind the SO-101: 19.5 kg·cm peak stall at 6 V, a 12-bit magnetic encoder over 360°, a half-duplex serial bus from 38400 bps to 1 Mbps with ids 0 to 253, and load, position, speed, voltage and current fed back. The product page has a datasheet PDF and a dimension drawing as an image, with no price and no CAD file ([STS3215](https://www.feetechrc.com/74v-19-kgcm-plastic-case-metal-tooth-magnetic-code-double-axis-ttl-series-steering-gear)). Its wiki, in Chinese, covers Python, Linux, Arduino, ESP32 and STM32, the FT-SCS, Modbus-RTU and CAN protocols and the register maps per series, and marks per model whether a STEP file exists yet ([wiki](https://ftservo.github.io/ftservo-wiki/)).
- **Worse than Basecase:** Feetech publishes no 3D model for the STS3215 on its page ([STS3215](https://www.feetechrc.com/74v-19-kgcm-plastic-case-metal-tooth-magnetic-code-double-axis-ttl-series-steering-gear)). Basecase's catalog carries a Waveshare model checked against Feetech's drawing, four STS3215 variants with their torque, speed and current, and the SCS0009 and STS3250 (`src/data/components.ts`), and its daemon speaks the Feetech bus to an emulated STS3215 byte for byte ([Robot runtime](../guide/robot-runtime.md)).
- **Basecase should:** integrate. Offer Feetech the catalog's checked STS3215 model and register ledger for its wiki's model pages, which mark STEP files as missing, in exchange for official models and the register dumps the runtime still marks as assumed ([Robot runtime](../guide/robot-runtime.md)).

### ROBOTIS

- **Link:** https://emanual.robotis.com
- **Checked:** 2026-11-13
- **Better than Basecase:** publishes everything a model needs for each Dynamixel. The XL330-M288-T's e-manual gives stall torque and no-load speed at 3.7, 5 and 6 V (0.52 N·m and 103 rev/min at 5 V), six operating modes from current to multi-turn and PWM, Protocol 2.0 at up to 4 Mbps, and downloads of its STEP, DWG and PDF drawings and its moment of inertia ([XL330-M288](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/)).
- **Worse than Basecase:** the e-manual describes one servo at a time ([XL330-M288](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/)); Basecase picks Dynamixels for a design's joints, checks their torque in the sim and drives them through the same daemon as Feetech servos ([Robot runtime](../guide/robot-runtime.md), `src/data/components.ts`).
- **Basecase should:** integrate. The catalog takes six Dynamixels' models from ROBOTIS's e-manual, but only the XL330 has a measured fit; the others' armature is estimated from their torque (`src/data/components.ts`, [Simulate](../guide/simulate.md)). Ask ROBOTIS for each Dynamixel's rotor inertia and friction, which the e-manual doesn't list, so those servos simulate from the maker's numbers.

### To check

- Pololu
- Adafruit
- Raspberry Pi
- Seeed Studio
- Intel RealSense
- Luxonis
- Unitree

## Printer makers

Bambu Lab printers are integrated already ([Printing](../guide/printing.md)).

### Bambu Lab

- **Link:** https://bambulab.com
- **Checked:** 2026-11-13
- **Better than Basecase:** launched the H3C on 3 November 2026 at $2,499 with the AMS 3H and nine PrintTools: each tool has its own filament path and heater, a change takes "less than six seconds", nozzles run 0.2 to 0.8 mm, and the bed is 330 × 320 × 325 mm ([3Dnatives](https://www.3dnatives.com/en/bambu-lab-h3c-03112026/)).
- **Worse than Basecase:** a printer prints the plates it's sent. Basecase lays out a robot's parts per material, picks each part's face and leaves already printed parts off ([Printing](../guide/printing.md)).
- **Basecase should:** integrate further. The catalog has the H3C from Bambu Studio 2.9.1 (`src/data/printerCatalog.ts`), but Basecase slices one job per material ([Printing](../guide/printing.md)), so a robot in PLA, PETG and TPU becomes three prints where a nine-tool printer could take one. Hand such a printer one project with each part's filament assigned ([Bambu Studio](competitors.md#bambu-studio)).

### To check

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
