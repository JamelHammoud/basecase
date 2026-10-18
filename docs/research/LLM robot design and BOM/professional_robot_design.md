# Professional-Grade Robot CAD and Mechanical Design (printable hobby and research robots)

Research date: 2026-10-17. Sources are mostly 2025 papers, repos and product pages. Where a figure came only from a search snippet (not a fetched page), it is marked "(snippet)".

## 1. How well-regarded printable robots are actually designed

### Takeaway
The best printable robots share a few traits. Actuators are off-the-shelf bus servos or drone BLDCs. Printed parts are structure only, while bearings, metal shafts and fasteners carry the critical loads. Reproducibility is a hard requirement ("one person, at home, no special equipment"). Joints are supported on both sides. Calibration fixtures and modular, quickly swappable parts get explicit design attention. Costs run from about $120 (one SO-101 follower arm) to about $4.3k (Berkeley Humanoid Lite, US prices) and about $6k (ToddlerBot). In the humanoids, motors plus compute take about 90% of the cost.

### Cited Findings

**ToddlerBot (Stanford, arXiv 2502.00893, Feb 2025)**
- 30 active DoF: 7 per arm, 6 per leg, 2 neck, 2 waist. 0.56 m tall, 3.4 kg (3484 g measured). Torso 13×9×12 cm. Under $6,000 in total, with about 90% going to the computer and motors — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Actuators, as stall torque at 12 V: XC330-T288 1.0 Nm (neck, waist roll, hip yaw, gripper); XC430-T240BB 1.9 Nm (shoulder pitch, ankle roll); XM430-W210 3.0 Nm (knee and ankle pitch); 2XL430-W250 1.5 Nm (shoulder roll/yaw, elbow, wrist); 2XC430-W250 1.8 Nm (hip roll/pitch, two DoF in one housing) — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Torque budget, estimated for the hardest lower-limb tasks: knee 2.35 Nm, ankle pitch 2.66 Nm, hip pitch 1.77 Nm. The XM430 (3.0 Nm stall) was the only option with enough torque for the knee and ankle. That leaves a stall-to-required margin of only about 1.1–1.3× — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Joint support: on the hip yaw, a 1:1 spur-gear set moves the load onto a secondary axis with planar bearings and metal shafts, so the XC330's Teflon-bushed output shaft carries no transverse forces. The knee and neck pitch use parallel linkages with ball bearings. The knee motor sits higher to cut leg inertia. Two waist motors are coupled through bevel gears, because one XC330 is not enough — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Range of motion: joint geometry was optimized to avoid self-collision. Linkage joints usually stay under 160°. Knee pitch falls about 40° short of human range, which extra ankle pitch partly offsets. Shoulder roll is limited to 90° — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Serviceability: early iterations minimized screw types and kept tool access unobstructed. Parts are modular. A replacement part printed in 21 min, and the repair took 14 min including zero-point calibration. 3D-printed plug-in calibration jigs (color-coded per joint group) set the zero in under a minute. Swapping grippers takes under two minutes. An independent builder finished a full build in three days — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Structure: printed parts are justified because deflection scales with L², so miniature printed links can approach full-size aluminum stiffness. Metal would "reduce reproducibility with marginal gains". "Design has a greater impact than material choice" for strength. Printed parts break on impact: up to 7 falls before a part breaks — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Electronics: Jetson Orin NX 16GB, two fisheye cameras, chest IMU, speaker and two microphones. A custom power board carries 4× XT30, an E-stop terminal, 7× JST-EH TTL outlets and two 12 V buck converters. Battery input is 14–19 V, from a 2000 mAh LiPo (215 g) or a 4-cell 21700 pack at 5000 mAh (330 g). The computer and camera draw about 15 W, the motors about 50 W while walking, so 75 Wh gives about 1 h — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- Bus: full-state feedback from all 30 motors at 50 Hz over 2 Mbaud TTL. Backlash about 0.25°, encoder resolution 4096 counts/rev — [ToddlerBot paper](https://arxiv.org/html/2502.00893)

**Berkeley Humanoid Lite (arXiv 2504.17249, Apr 2025)**
- 0.8 m, 16 kg. Actuators per Table III: 10 × 6512 and 12 × 5010. Two 5-DoF arms with grippers. The torso is aluminum extrusion. 6S 4000 mAh LiPo gives about 30 min — [BHL paper](https://arxiv.org/html/2504.17249)
- 6512 actuator: printed (PLA) cycloidal gearbox driven by an M6C12 150KV drone BLDC, with a B-G431B-ESC1 driver and AS5600 encoder. A 6811ZZ bearing sets the actuator's size. A brass hex standoff embedded in the input shaft adds stiffness and transfers torque. Cycloidal gears were chosen because they "distribute loads over multiple teeth" and suit desktop printer resolution better than planetary gears — [BHL paper](https://arxiv.org/html/2504.17249)
- Printed-part strategy: through-screws and embedded brass hex stands guard against layer-line failure. Subcomponents are merged into single prints to avoid stress concentrations around fasteners. Every part fits a 200 × 200 × 200 mm build volume — [BHL paper](https://arxiv.org/html/2504.17249)
- Cost (US / China): 6512 actuator $188 / $157 (motor $129, bearings $23, printed parts $4 in the US). 5010 actuator $136 / $94. Full robot $4,312 / $3,236. All printed parts together cost only $200 / $84 — [BHL paper](https://arxiv.org/html/2504.17249)
- Measured: stiffness about 319.5 Nm/rad, against 1468 Nm/rad for a PA-CF cycloidal reducer, a gap the authors attribute to PLA. Efficiency about 90%. Backlash at most 0.0229 rad (about 1.3°). A 60 h durability test (0.5 kg at 0.5 m, 0.5 Hz) showed slight backlash growth. Six units from two printers stayed within ±0.5 Nm torque error. The locomotion policy used only about 30% of the actuator torque limit — [BHL paper](https://arxiv.org/html/2504.17249)
- Build: custom parts print within a week, assembly takes about three days, and broken actuators swap out — [BHL paper](https://arxiv.org/html/2504.17249)

**SO-100 / SO-101 arm (TheRobotStudio + Hugging Face LeRobot)**
- 6 × Feetech STS3215 per arm. The follower uses 6 × C001 (1/345 gearing). The leader mixes 1 × C001, 2 × C044 (1/191) and 3 × C046 (1/147), so it is easy to backdrive by hand. The 7.4 V variant is "16.5 kg·cm at 6 V". The 12 V variant is 30 kg·cm and needs a 12 V 5 A+ supply — [SO-ARM100 repo](https://github.com/TheRobotStudio/SO-ARM100)
- BOM: two arms about $229.88 US, one follower about $121.94 — [SO-ARM100 repo](https://github.com/TheRobotStudio/SO-ARM100)
- Printing: PLA+, 0.4 mm nozzle at 0.2 mm layers (or 0.6 at 0.4), 15% infill, supports except on slopes over 45°, and "no supports in the screw holes with horizontal axes". 14 STL files. Tools: Phillips #0 and #1 (the servos come with small self-tapping screws; the repo doesn't list sizes) — [SO-ARM100 repo](https://github.com/TheRobotStudio/SO-ARM100)
- SO-101 changes from SO-100: "improved wiring", "easier to assemble (no gear removal)", updated leader motors. A mount helper jig is offered for alignment — [SO-ARM100 repo](https://github.com/TheRobotStudio/SO-ARM100)

**Open Duck Mini v2 (Antoine Pirrone, sponsored by HF/Pollen)**
- A miniature of Disney's BDX droid, about 42 cm tall with legs extended. Full BOM "under $400". Raspberry Pi Zero 2W runtime. CAD is in Onshape, with an Onshape-to-MuJoCo pipeline — [Open_Duck_Mini repo](https://github.com/apirrone/Open_Duck_Mini)
- Hobby BDX-style builds use Waveshare ST3215 servos — [rubieluo Substack](https://rubieluo.substack.com/p/bdx-droid) (snippet)

**Disney BDX bipedal character (arXiv 2501.05204, Jan 2025)**
- 0.66 m (excluding antennas), 15.4 kg: torso 5.8 kg, neck and head 2.4 kg, each leg 3.6 kg. 5 DoF per leg and 4 DoF for neck and head — [Disney paper](https://arxiv.org/html/2501.05204)
- Hip ab/ad, hip flex and knee actuators: 34 Nm, 20 rad/s. Hip rotation, ankle and lower neck: 24 Nm, 30 rad/s. Head: 4.8 Nm, 6.3 rad/s, at a high gear ratio. Legs are quasi-direct drive with actuators at the joints. There is no ankle roll actuator; rounded foot soles give passive roll. Soles are molded urethane foam — [Disney paper](https://arxiv.org/html/2501.05204)
- Layout: the torso holds the communication board, battery module and IMU. The head holds the PC, radio and show-function board. Show functions (antennas, LED eyes, head lamp, speakers) are kept modular so they can be added or removed. The battery is removable and lasts at least 1 h. Philosophy: "not the best possible mechanical design, but a simple design which satisfies the creative intent". Animation tools feed joint positions, velocities and torques back into actuator selection and structural analysis — [Disney paper](https://arxiv.org/html/2501.05204)

**Reachy Mini (Pollen Robotics / Hugging Face, 2025)**
- About 28 cm tall (active), about 1.5 kg. 6-DoF head, 2 animated antennas, full-body yaw base, wide-angle camera, 4 microphones, 5 W speaker. Lite $399, Wireless $499 (Raspberry Pi, battery, Wi-Fi). Earlier pre-order prices were $299 / $449 — [Pollen announcement](https://pollen-robotics.com/reachy-mini/blog/reachy-mini-announcement/); [HF blog](https://huggingface.co/blog/reachy-mini)
- The head is a Stewart platform with 6 motors and 6 link rods on a main plate — [official assembly guide PDF](https://www.pollen-robotics.com/wp-content/uploads/2025/10/Reachy_Mini_Assembly_BETA_v2_LOW-compresse.pdf) (snippet). The head motors are reportedly Dynamixel XL330 and the base a custom XC330-M288-PG; these come from secondary sources and are not confirmed by Pollen — [tilnote article](https://tilnote.io/en/pages/6a2c9ce9da0e1b7feb506b1a), [robotsguide](https://robotsguide.com/robots/reachy-mini) (snippets)

**Petoi Bittle**
- "Interlocking frame as a puzzle with a few screws". 9 × custom P1S servos (8 legs + head pan, 270° range). About 200 × 110 × 110 mm, 280–290 g. Kits were $259–$439 at launch. The body takes about 40–60 min to assemble — [Petoi system overview](https://www.petoi.com/pages/petoi-programmable-quadruped-robot-system); [The Gadgeteer review](https://the-gadgeteer.com/?p=371685) (snippets)

**Stanford Pupper / Mini Pupper**
- 12 × JX CLS6336HV servos. Carbon-fiber routed plates, printed parts and a custom power-distribution PCB. $600–$1000 self-sourced — [Stanford Student Robotics](https://stanfordstudentrobotics.org/pupper) (snippet). MangDang found no 9 g servo up to the task, so Mini Pupper uses a custom servo. Under $500 — [Mini Pupper docs](https://minipupperdocs.readthedocs.io/en/latest/reference/Design.html) (snippet)

**HopeJR (TheRobotStudio + HF, announced May 2025)**
- Up to 66 actuated DoF. Estimated at about $3,000 — [Outlook Business](https://www.outlookbusiness.com/deeptech/tech/hugging-face-debuts-open-source-humanoid-robots-hopejr-and-reachy-mini-expands-robotics-push) (snippet). The repo mentions Robstride 02 motors for the humanoid, underactuated fingers, and an exoskeleton teleoperator with 1:1 joint mapping. Custom PCBs avoid soldering — [HOPEJr repo](https://github.com/TheRobotStudio/HOPEJr)
- The same press coverage says the cost estimate assumes "16 rotary actuators with harmonic reducers and 14 linear actuators with planetary roller screws". That doesn't fit a 3D-printed hobby humanoid and may be mis-attributed; treat it as unreliable.

**STS3215 reference data (the default hobby actuator)**
- About 45.2 × 24.7 × 35 mm, 55 g, 25-tooth spline, dual shaft (output plus a rear idler boss). 6 V: 19.5 kg·cm peak, 6.5 kg·cm rated continuous, 2 A stall. 12 V C018 variant: 30 kg·cm, 2.7 A stall — [Core Electronics listing](https://core-electronics.com.au/feetech-sts3215-smart-servo.html.plain.md); [servodatabase](https://servodatabase.com/servo/feetech/sts3215); [Eckstein](https://eckstein-shop.de/Motors?mf=1611) (snippets). Note: SO-ARM100 states 16.5 kg·cm at 6 V for its 7.4 V variant, so sources differ by variant.

### Inferences
- Standard archetypes: (a) bus-servo robots (STS3215, Dynamixel XL/XC/XM), where the servo case is the structure and printed brackets link servo to servo; (b) BLDC + printed reducer (BHL cycloidal) for 10 kg+ robots; (c) QDD actuators with printed connectors (Disney BDX, 15 kg).
- Rough sizing ladder: under 1 kg desktop (Reachy Mini, Bittle: XL330 / P1S class), 3–4 kg (ToddlerBot: XC/XM430, 1–3 Nm), 15–16 kg (BHL, BDX: 20–35 Nm BLDC).
- An agent should present cost, print time, servo count and an estimated assembly time as part of a "real product" design. Each reference project publishes these.

### Gaps
- No fetched source gave Open Duck Mini v2's servo count or part list (the BOM page returned 404). The Koch arm and Poppy weren't researched in this session.
- Exact part counts and print hours are missing for SO-101, ToddlerBot and BHL.
- Fastener sizes for SO-101 weren't on the fetched page.

## 2. Mechanical design practice (load paths, joints, torque, stability, serviceability)

### Takeaway
Professional joints never let a servo's output shaft carry the bending load alone. An idler bearing or second shaft on the far side, or a secondary axis on bearings and metal shafts, carries it. Actuators are sized from computed or simulated joint torques. ToddlerBot runs a tight 1.1–1.3× stall margin; BHL's policy used only about 30% of its limit. Printed structure is designed around layer-line weakness with through-bolts, embedded metal inserts and merged parts. Serviceability (modular swaps, calibration jigs, few screw types, tool access) is designed in from the start.

### Cited Findings
- Idler on the far side: Lynxmotion puts an idler horn "on the underside of the servo, in line with the driving output shaft", using a 3 × 8 mm flanged ball bearing — [Lynxmotion SES wiki](https://wiki.lynxmotion.com/info/wiki/lynxmotion/view/ses-v2/ses-v2-system/ses-v2-gearing-horn/?rev=36.1). ROBOTIS sells an idler horn set (HN12-I101) "mounted on the opposite side of the DYNAMIXEL output shaft", used for hinge frames — [RobotShop HN12-I101](https://ca.robotshop.com/products/robotis-idler-horn-set-hn12-i101-dynamixel-x-series-430-models) (snippet)
- A patent on a soft humanoid describes a bearing that "support[s] the servo output shaft when loaded to prevent excessive deflection and stress", and a double-direction thrust bearing that sends forces "down to the rigid mounting flanges of the servo housing" — [US Patent 9802314](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9802314) (snippet)
- ToddlerBot keeps transverse loads off servo shafts with a secondary axis on planar bearings and metal shafts. It uses ball bearings at the linkages and parallel linkages to move heavy motors closer to the hip — [ToddlerBot](https://arxiv.org/html/2502.00893)
- Torque budgeting examples: ToddlerBot's knee needs 2.35 Nm against a 3.0 Nm stall — [ToddlerBot](https://arxiv.org/html/2502.00893). BHL's locomotion used about 30% of the actuator limit — [BHL](https://arxiv.org/html/2504.17249). Disney sized actuators from animation-derived joint torques and velocities — [Disney paper](https://arxiv.org/html/2501.05204). STS3215 continuous rating is 6.5 kg·cm against 19.5 kg·cm peak at 6 V, so continuous is about a third of peak — [Core Electronics](https://core-electronics.com.au/feetech-sts3215-smart-servo.html.plain.md) (snippet)
- ToddlerBot's "power factor" metric is total motor torque / (height × weight), used to compare platforms — [ToddlerBot](https://arxiv.org/html/2502.00893)
- Stiffness and fatigue: a PLA cycloidal reducer reached about 319 Nm/rad against 1468 Nm/rad for PA-CF, and backlash grows with wear — [BHL](https://arxiv.org/html/2504.17249)
- Heat-set inserts: blind hole about 1 mm deeper than the insert. Install about 10–20 °C above print temperature (about 225 °C PLA, 245 °C PETG, 265 °C ABS). Size the hole so the insert "just pre-seats". Printed holes come out undersize, so print a test coupon — [CNC Kitchen](https://cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts). Hole guidance varies: about 0.4 mm under the insert OD ([PrintPal](https://printpal.io/resources/how-to-make-premium-3d-prints-with-heat-set-inserts)), or a 4.0 mm hole for an M3 insert with 4.6 mm OD ([Albany County Fasteners spec](https://www.albanycountyfasteners.com/media/64/3d/5a/1764619189/heat-set-insert-specs.pdf)). Wall recommendations range from about 2× insert diameter ([FacFox](https://facfox.com/docs/?p=167429)) to 1.6 mm minimum ([DigiKey FreeCAD tutorial](https://www.digikey.com/es/maker/tutorials/2025/intro-to-freecad-part-4-how-to-use-heat-set-inserts)) (snippets)
- Print orientation: no supports in horizontal screw holes (SO-101) — [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100)
- Stability: BDX uses rounded foot soles for passive ankle roll and foam soles to damp impact. Its removable battery sits in the torso — [Disney paper](https://arxiv.org/html/2501.05204). ToddlerBot carries 1484 g, about 40% of body weight — [ToddlerBot](https://arxiv.org/html/2502.00893)
- Thermal: BHL's efficiency drops at high torque and speed because of heat, and thermal effects on printed structure went unstudied — [BHL](https://arxiv.org/html/2504.17249). ToddlerBot lists motor overheating as a problem fixed in later iterations — [ToddlerBot](https://arxiv.org/html/2502.00893)
- Power distribution as a designed part: ToddlerBot's board has XT30 connectors, an E-stop terminal, JST-EH bus outlets and buck converters — [ToddlerBot](https://arxiv.org/html/2502.00893). HopeJR uses custom PCBs so no soldering is needed — [HOPEJr](https://github.com/TheRobotStudio/HOPEJr)

### Inferences (standard engineering relations; not sourced in this session, verify before quoting)
- Static joint torque: τ = m·g·r_com, summed over all distal mass. Example: an SO-101 shoulder holding about 0.6 kg of distal arm and payload at a 0.2 m COM gives 0.6 × 9.81 × 0.2 ≈ 1.18 Nm ≈ 12 kg·cm. That is under STS3215 peak (about 19.5 kg·cm at 6 V) but above its continuous rating (6.5 kg·cm). This is why arms like SO-101 run hot holding poses and why 12 V / 30 kg·cm variants exist.
- Recommended margin: required continuous torque ≤ 30–50% of stall. ToddlerBot's 1.1–1.3× knee margin is the floor, made acceptable by short duty cycles. The BHL figure (about 30% used) is the healthier target.
- Unit conversion: 1 kg·cm = 0.0981 Nm.
- Cantilever deflection δ = F·L³ / (3·E·I). PLA has E ≈ 3.5 GPa against about 69 GPa for aluminum, so a printed link needs roughly a 2.7× deeper section, or ribs and closed boxes, for the same stiffness. This is the reasoning behind ToddlerBot's scaling argument.
- Bearing pairing: STS3215 / XL430-class servos pair with 3 × 8 mm (693) or 4 × 13 mm idler bearings, or the maker's idler horn. Larger shafts use 608 (8 × 22 × 7) or thin-section 68xx (BHL's 6811).
- Static stability: keep the COM projection inside the support polygon with margin. Put batteries and compute low and central (ToddlerBot and BDX both put them in the torso, BDX's compute in the head). Mount heavy actuators proximally (ToddlerBot raises the knee motor) to cut leg inertia.

### Gaps
- No primary DFA/DFM checklist was found for hobby robots specifically. Boothroyd-Dewhurst style DFA guidance wasn't fetched.
- Cable-routing and strain-relief specifics from these projects weren't found; SO-101 only says "improved wiring".
- No sourced numeric hard-stop design guidance was found.

## 3. Industrial design markers of professional robots

### Takeaway
Sourced evidence here is thin. Reliable findings: professional robots get a deliberate outer cover (Spot's smooth yellow cover changed how people saw it), modular show features (BDX), and their character comes from proportion and motion as much as from mechanics (Disney put creative intent ahead of mechanical optimality). The Anki Vector teardown shows professional products spend heavily on multi-material housings and molds.

### Cited Findings
- Spot's smooth yellow cover gave it a distinctive look at its September 2019 launch; earlier uncovered versions "looked a bit spooky" — [Ceramics.org](https://ceramics.org/ceramic-tech-today/ceramic-video/video-novel-uses-of-robots-during-the-covid-19-pandemic/) (snippet)
- Boston Dynamics' industrial design lead Aaron Yabroff (about 25 years at design agencies) led Spot's design and later Atlas's — [Boston Dynamics webinar "Form & Function: enterprise humanoid design"](https://bostondynamics.com/webinars/form-function-enterprise-humanoid-design) (snippet)
- Spot's UX design brought in Rightpoint to make operation more approachable — [IoT World Today](https://iotworldtoday.com/robotics/boston-dynamics-spot-the-design-behind-the-robot-dog) (snippet)
- Anki Vector teardown: much of the cost goes to the number of materials, parts and molds. The head uses PC, ABS and PC/ABS, and the chassis has a heat-staked inner material — [Fictiv teardown](https://www.fictiv.com/teardowns/anki-vector-robot-teardown); [The Robot Report](https://www.therobotreport.com/anki-vector-teardown-complex-manufacturing/) (snippets)
- Disney BDX: "a simple design which satisfies the creative intent". Knees bend backwards "as creatively envisioned". Show functions are modular — [Disney paper](https://arxiv.org/html/2501.05204)
- Reachy Mini's character comes from a 6-DoF Stewart head plus two antennas, with few DoF overall — [HF blog](https://huggingface.co/blog/reachy-mini)

### Inferences
- Markers worth encoding for an agent: one design language (a shared fillet radius family and a consistent wall and cover thickness); covers that enclose actuators and wiring so only joints and seams show; parting lines placed on deliberate reveals (a small 0.5–1 mm gap or step) rather than flush seams; fasteners hidden under covers or recessed in counterbores, all one size where possible; a limited CMF palette (one body color, one dark joint or accent color, sometimes one signal color like Spot's yellow); proportions where heavy masses (battery, compute) read as low and central.

### Gaps
- No primary sources were found on Unitree G1, Figure, Agility Digit or Sony aibo design language, fillet strategy, or CMF. Design-trade interviews (Core77, Dezeen, IDSA) weren't reached within the tool budget.

## 4. Amateur tells and expert critique; published checklists

### Takeaway
No published "amateur vs pro robot CAD" critique was found. The reference designs define the tells by contrast: single-sided horn mounts with no idler, links with no bearing support, no fasteners or inserts shown, no calibration or assembly provisions, no wiring path or power board, no BOM, cost or torque budget, no print-orientation awareness (supports in screw holes, parts exceeding a 200 mm bed), and proportions that ignore where the mass sits.

### Cited Findings
- Reference-design practices to check against: idler or bearing on the far side ([Lynxmotion](https://wiki.lynxmotion.com/info/wiki/lynxmotion/view/ses-v2/ses-v2-system/ses-v2-gearing-horn/?rev=36.1), [ToddlerBot](https://arxiv.org/html/2502.00893)); every part fits 200³ mm and avoids fastener stress concentrations ([BHL](https://arxiv.org/html/2504.17249)); no supports in horizontal screw holes ([SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100)); few screw types and clear tool access, plus calibration jigs ([ToddlerBot](https://arxiv.org/html/2502.00893)); reproducibility as a hard constraint ([ToddlerBot](https://arxiv.org/html/2502.00893)).
- An SO-100 assembly pain point that SO-101 fixed: it required gear removal from servos (the leader needed backdrivable gearing), and its wiring was poor — [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100)

### Inferences — draft checklist for an AI CAD agent
1. Every revolute joint: servo body fixed to link A by at least 2 screws, output horn to link B, and an idler bearing or idler horn coaxial on the opposite side into link B (a U-bracket). State the bearing (e.g. 693, 3 × 8 × 4).
2. Torque table: for each joint, τ_required (m·g·r) vs. actuator continuous and stall torque. Flag any ratio over 50% of stall.
3. Fasteners: show screws. M2/M2.5 for servo mounting (often self-tapping into the servo case), M3 heat-set inserts in printed bosses (hole about the insert OD minus 0.4–0.6 mm, about 1 mm extra depth, at least 1.6 mm wall, ideally about 2× insert diameter). Use one or two screw sizes for the whole robot.
4. Printability: each part under about 200 × 200 × 200 mm, a flat print face, no support inside horizontal holes, layer lines oriented away from the main bending stress, through-bolts across layer planes in high-load parts.
5. Cable path: a channel, clip or hollow through every joint, a service loop at each rotating joint, a power board with real connectors (XT30, JST-EH) and an E-stop.
6. Electronics bay: compute, battery and power board in an enclosure low in the torso or base, with a vent path and a removable battery door.
7. Covers and shells: separate, screwed-on (or snap-fit) shells over the structural frame, with reveals at the seams and fasteners hidden or uniform.
8. ROM: list each joint's range and add hard stops, or check the full range for self-collision.
9. Stability: COM inside the support polygon for each stance, with mass low and central.
10. BOM with prices, servo count, print hours and an assembly-time estimate.

### Gaps
- No published hobby-robot design-review checklist and no Hackaday or YouTube expert critique of robot CAD were found in this session. These remain open; candidates include CNC Kitchen strength tests, James Bruton design videos and the Boothroyd DFA rules.
