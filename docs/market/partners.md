# Partners

Companies Basecase could work with: listing their parts, sending prints to their printers, or selling their kits. Entry format and rules: [README](README.md).

## Part makers

Makers with the most parts in the catalog (`src/data/components.ts`).

### Feetech

- **Link:** https://ftservo.github.io/ftservo-wiki/
- **Checked:** 2026-11-15
- **Better than Basecase:** publishes Python, Linux, Arduino, ESP32 and STM32 integration guides, packet protocols and series register tables ([wiki](https://ftservo.github.io/ftservo-wiki/)). Its ST-3215-C001 page identifies the STS3215 and document revision A/0, links a datasheet and dimension drawing, and explicitly flags inconsistent voltage bounds between the website and PDF ([model page](https://ftservo.github.io/ftservo-wiki/products/models/st-3215-c001/main/)).
- **Worse than Basecase:** that model page marks STEP, model-specific firmware/register documentation and raw test data as missing ([model page](https://ftservo.github.io/ftservo-wiki/products/models/st-3215-c001/main/)). Basecase carries a Waveshare model checked against Feetech drawings, separate C001, C018, C044 and C046 actuator records, and a byte-level STS3215 emulator with a provenance ledger ([catalog](../../src/data/components.ts), [Robot runtime](../guide/robot-runtime.md)).
- **Basecase should:** integrate the model-specific references while preserving suffix, document revision, voltage and test conditions, because the maker page itself reports conflicting specifications ([model page](https://ftservo.github.io/ftservo-wiki/products/models/st-3215-c001/main/)). Use that evidence to resolve catalog and runtime assumptions rather than replacing variant data with the family summary ([catalog](../../src/data/components.ts), [Robot runtime](../guide/robot-runtime.md)).

### ROBOTIS

- **Link:** https://docs.robotis.com
- **Checked:** 2026-11-15
- **Better than Basecase:** the XL330-M288-T reference publishes 0.52 N·m stall torque and 103 rpm no-load speed at 5 V, operating modes, control tables and STEP, DWG, PDF and moment-of-inertia downloads ([e-manual](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/)). The e-manual now points to ROBOTIS Docs for the latest references ([migration notice](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/), [current portal](https://docs.robotis.com/)).
- **Worse than Basecase:** ROBOTIS's model reference documents the servo and its controls ([reference](https://emanual.robotis.com/docs/en/dxl/x/xl330-m288/)). Basecase already places exact Dynamixel models in a robot, simulates their actuator parameters and calibrates individual joints through its runtime ([catalog](../../src/data/components.ts), [Simulate](../guide/simulate.md), [Robot runtime](../guide/robot-runtime.md)).
- **Basecase should:** integrate the current documentation portal as a source for exact model records, retaining old model links until their replacements are verified ([portal](https://docs.robotis.com/), [catalog](../../src/data/components.ts)). Keep published motor specifications separate from each joint's fitted dynamics and their provenance ([Robot runtime](../guide/robot-runtime.md)).

### Pololu

- **Link:** https://www.pololu.com
- **Checked:** 2026-11-15
- **Better than Basecase:** the catalog's #4753 50:1 encoder gearmotor has a maker-hosted STEP bundle, dimension drawings and datasheet. Its page lists $60.95 for one and $56.07 each at five, and currently offers backorders ([product and resources](https://www.pololu.com/product/4753/resources)).
- **Worse than Basecase:** Pololu's page describes and supplies the individual motor ([product](https://www.pololu.com/product/4753/resources)). Basecase already records its exact product number, maker model source, 200 rpm speed, 21 kg·cm stall torque, 5.5 A stall current and encoder resolution in the robot catalog ([catalog](../../src/data/components.ts)).
- **Basecase should:** integrate through those exact maker links and preserve the distinction between list price and a checked purchase price ([Build](../guide/build.md)). Do not count an offered backorder as immediate stock because Pololu ships it when available and can hold an entire order for it ([ordering](https://www.pololu.com/ordering)).

### To check

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
- **Checked:** 2026-11-15
- **Better than Basecase:** Bambu Studio 2.9.1 supports the H3C and assigns different nozzle diameters and layer heights to regions of one model ([maker's release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.01.70)).
- **Worse than Basecase:** Bambu's release describes preparing a supplied model for printing ([release](https://github.com/bambulab/BambuStudio/releases/tag/v02.09.01.70)). Basecase also prepares all printed parts of a robot, in build order, with their materials and printed inventory ([Printing](../guide/printing.md)).
- **Basecase should:** integrate using the multi-material project handoff that already ships, with every plate and per-part filament assignment in one unsliced project ([Printing](../guide/printing.md), [Bambu Studio](competitors.md#bambu-studio)). Keep that distinct from Basecase's per-material CLI slicing when describing what a multi-tool printer can receive.

### To check

- Prusa Research
- Creality
- Elegoo

## Platforms

### Hugging Face

- **Link:** https://huggingface.co
- **Checked:** 2026-11-15
- **Better than Basecase:** hosts the shared datasets and policies used by LeRobot ([docs](https://huggingface.co/docs/lerobot/index)). PRO costs $9 per month with 10 times the private storage capacity, twice the public capacity and a private Dataset Viewer. Base storage rates are $12 per TB per month for public repositories and $18 for private repositories, with egress included ([pricing](https://huggingface.co/pricing)).
- **Worse than Basecase:** LeRobot's recording tutorial uses keyboard controls to keep or re-record episodes ([recording](https://huggingface.co/docs/lerobot/il_robots)). Basecase labels a simulated try with its Case contract and uses passed demonstrations for export ([Cases](../guide/cases.md)).
- **Basecase should:** integrate through the existing publication path, which writes v3 on main and tags v3.0, plus the v2.1 compatibility revision ([publisher](../../electron/hub/publishRepo.mjs), [Cases](../guide/cases.md)). Keep its dataset format and compatibility revision visible in integration guidance ([integration](integrations.md#lerobot)).

## Kit makers

### SO-101 kits

- **Link:** https://github.com/TheRobotStudio/SO-ARM100
- **Checked:** 2026-11-15
- **Better than Basecase:** The Robot Studio publishes printable parts, regional sourcing tables and links to kit sellers including Seeed Studio, WowRobo, RobotEd, Robonine and PartaBot. Its US table totals $121.94 for one follower and $229.88 for two arms, which are sourcing estimates rather than live kit quotes ([repository](https://github.com/TheRobotStudio/SO-ARM100)). The follower uses six STS3215 motors with 1/345 gearing, while the leader mixes 1/191, 1/345 and 1/147 ([assembly guide](https://huggingface.co/docs/lerobot/so101)).
- **Worse than Basecase:** the real-robot guide requires sourcing, motor configuration, assembly and calibration ([guide](https://huggingface.co/docs/lerobot/so101)). Basecase's SO-101 preset imports with joints for posing, animation and simulation before parts are bought ([Joints and motion](../guide/joints-and-motion.md), [Simulate](../guide/simulate.md)).
- **Basecase should:** integrate the maker's sourcing table and kit links beside the existing preset's BOM, keeping a complete kit distinct from its individual parts ([Build](../guide/build.md), [cart](../../src/components/build/cart.ts)). Preserve the leader/follower motor variants when relating a kit to the simulated arm ([assembly guide](https://huggingface.co/docs/lerobot/so101), [catalog](../../src/data/components.ts)).

### To check

- Pollen Robotics
- goBILDA

## Part suppliers

### DigiKey

- **Link:** https://developer.digikey.com
- **Checked:** 2026-11-15
- **Better than Basecase:** offers APIs for product lookup, quotes and MyLists ([developer portal](https://developer.digikey.com/)). MyLists exposes creating a list and adding parts to it ([API index](https://developer.digikey.com/products/mylists/mylists)).
- **Worse than Basecase:** API requests require an access token and application credentials ([documentation](https://developer.digikey.com/documentation)). Basecase's existing Amazon cart needs no connected account and uses the units left to buy after on-hand inventory ([Build](../guide/build.md), [cart](../../src/components/build/cart.ts)).
- **Basecase should:** integrate with a user-requested MyLists handoff for the BOM's DigiKey lines, using exact part identities and remaining quantities ([integration](integrations.md#digikey)). Creating a supplier list should not place an order.

### To check

- Mouser
- McMaster-Carr
- Amazon
