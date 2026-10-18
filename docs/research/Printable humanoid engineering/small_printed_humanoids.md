# Small 3D-printed humanoids and bipeds (30–80 cm) that were built and moved: engineering numbers, failures and the Fauna Sprout design language (as of Oct 2026)

Scope note: web research only, 17 Oct 2026. Unit conversions: 1 kg·cm = 0.0981 N·m. "Inference" lines are my own arithmetic or reasoning, not sourced. Several primary pages (MakerWorld, the HAL Poppy paper, kayra.org, and the BOM Google Sheets) blocked fetching or weren't reachable, so some per-line BOM data is missing (see Gaps).

## 1. Which well-documented small printed humanoids and bipeds exist, and what are their specs?

### Takeaway
Three platforms are well documented, built and walking in the target size range. **Stanford ToddlerBot** (0.56 m, 3.4 kg, 30 DOF, Dynamixel, printed) is the closest analogue to a ~50 cm printed humanoid and has the best published torque budget. **Open Duck Mini v2** (~40–42 cm, 14× Feetech STS3215, PLA + TPU, <$400) is the closest analogue for the STS3215 servo class. **ROBOTIS OP3** (51 cm, 3.5 kg, 20× XM430) is the commercial reference at the same height. Berkeley Humanoid Lite (0.8 m, 16 kg, BLDC with printed cycloidal gearboxes) sits at the top of the range and uses a different actuator class.

### Cited Findings

**Stanford ToddlerBot (v1 Feb 2025; v2.0 released 25 Aug 2025)**
- Size: 3.4 kg (abstract), and 3,484 g measured in the payload test. The abstract gives 0.56 m tall; the appendix uses 0.5 m as a design estimate. Torso is 13 × 9 × 12 cm. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- 30 active DOF (end effectors excluded): 7 per arm, 6 per leg, 2 neck, 2 waist. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- Actuators, with stall torque at 12 V (paper Table 2):
  - XC330-T288, 1.0 N·m: neck pitch/yaw, waist roll, hip yaw, gripper.
  - XC430-T240BB, 1.9 N·m: shoulder pitch, ankle roll.
  - XM430-W210, 3.0 N·m: knee pitch, ankle pitch.
  - 2XL430-W250, 1.5 N·m: shoulder roll/yaw, elbow, wrist.
  - 2XC430-W250, 1.8 N·m: hip roll/pitch.
  - Measured backlash is about 0.25°, with 4096-count encoders (0.09°).
  - — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- Bus is 2 Mbaud TTL, with full-state feedback for 30 motors at 50 Hz. XC330s can't sustain 4 Mbps in this setup, so all motors are set to 2 Mbps. — [arXiv](https://arxiv.org/html/2502.00893); [ToddlerBot tips](https://hshi74.github.io/toddlerbot/sections/05_tips_and_tricks.html)
- Battery is 14.8 V: either a 2000 mAh LiPo (215 g) or a custom 4S 21700 pack at 5000 mAh (330 g). Peak output is 370 W (14.8 V × 25 A), and runtime is about 2 h (3–5 h in intermittent research use). Estimated loads are about 50 W for the motors and about 15 W for the computer and camera. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- Compute is a Jetson Orin NX 16 GB. The RL policy runs at 50 Hz on the CPU. Sensors are 2 fisheye cameras, an IMU, a speaker and 2 microphones. — [arXiv](https://arxiv.org/html/2502.00893); [toddlerbot.github.io](https://toddlerbot.github.io)
- Mass budget (design estimate): 3,100 g = 30 motors × 50 g + 600 g for computer, battery and camera + 1,000 g for printed structure and hardware. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- BOM is under $6,000, with about 90% going to motors and computer. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- Printing: Bambu Lab printers are "highly recommended" for affordability and tolerances. Print-ready 3MF files with per-part orientation and profiles are on MakerWorld (model 1733983), and CAD is in Onshape. The paper doesn't name a material, but the tips page recommends PLA-CF for the waist gears. — [ToddlerBot 3D printing](https://hshi74.github.io/toddlerbot/hardware/03_3d_printing.html); [tips](https://hshi74.github.io/toddlerbot/sections/05_tips_and_tricks.html)
- Two hardware variants: `toddlerbot_2xc` (recommended default) and `toddlerbot_2xm` (stronger, for higher budgets). — [ToddlerBot BOM page](https://hshi74.github.io/toddlerbot/hardware/01_bill_of_materials.html)
- License: code and docs are MIT; the robot design (Onshape, STL) is CC BY-NC-SA 4.0. Repo: https://github.com/hshi74/toddlerbot — [GitHub](https://github.com/hshi74/toddlerbot)
- v2.0 adds walking up to 0.25 m/s and turning at 1 rad/s, plus cartwheels, crawling, VR teleop and on-board stereo depth at about 10 Hz. — [toddlerbot.github.io](https://toddlerbot.github.io)
- Overall height, leg segment lengths, foot size, part count and total print time are not stated in the paper or on the docs pages fetched.

**Open Duck Mini v2 (Antoine Pirrone; Disney BDX-inspired biped, no arms)**
- About 42 cm tall with legs extended — [GitHub Open_Duck_Mini](https://github.com/apirrone/Open_Duck_Mini). A build report gives 40 cm — [Threads build post](https://www.threads.com/@dingcheng.h/post/DW_VJrrD-9p/).
- 14 DOF, all position-controlled: two 5-DOF legs plus a 4-DOF neck/head. This comes from a secondary source (DeepWiki model write-up), so treat it as likely. — [DeepWiki duck_sim](https://deepwiki.com/varga0725/duck_sim/7.1-open-duck-mini-v2-robot-model)
- Actuators: 14 × Feetech STS3215, 7.4 V version (BOM line "Feetech 7.4V STS 3215", about €14 each). Raspberry Pi Zero 2W, BNO055 IMU. — [MakerWorld listing snippet](https://www.makerworld.com/en/models/2755651) (page returned 403; snippet via search); [Threads build post](https://www.threads.com/@dingcheng.h/post/DW_VJrrD-9p/); [GitHub](https://github.com/apirrone/Open_Duck_Mini)
- A kit seller lists the power system as 2S Li-ion, 7.4 V, 3000 mAh. That is a retailer listing, not the project BOM. — [aifitlab kit](https://aifitlab.com/products/openduckmini-open-source-version-of-the-bdx-droid)
- BOM target is "under $400". — [GitHub](https://github.com/apirrone/Open_Duck_Mini)
- Printing: all parts are standard PLA at 15% infill, except `foot_bottom_tpu.stl` (TPU, 40% infill). There are 51 printed parts from 36 unique STLs. — [print guide](https://github.com/apirrone/Open_Duck_Mini/blob/v2/docs/print_guide.md)
- Filament is about 990 g PLA + 34 g TPU, printed on a Bambu H2D/X1C. This is from a third-party prep log that wasn't built. — [soyeon24 build repo](https://github.com/soyeon24/open-duck-mini-v2-build)
- Total mass: no reliable figure found. A retailer's "22.5 lb" is implausible for a 40 cm duck and should be ignored. — [cereboto](https://cereboto.com/product/open-duck-mini-v2/)
- License is Apache-2.0. The actuator model was identified with Rhoban's BAM tool, and RL training moved to MuJoCo Playground. — [GitHub](https://github.com/apirrone/Open_Duck_Mini)

**ROBOTIS OP3 (commercial; printable skin files)**
- About 510 mm tall and about 3.5 kg without a skin. 20 DOF, all XM430-W350-R (stall 4.1 N·m, versus 2.5 N·m for the MX-28 used in older Darwin-OP-class robots). — [ROBOTIS e-Manual](https://emanual.robotis.com/docs/en/platform/op3/introduction/)
- Battery is a 3S 11.1 V LiPo (1800 mAh on the older revision, 3300 mAh on the 2025 listing). Compute is an Intel NUC i3 + OpenCR sub-controller, with a Logitech C920 camera. — [ROBOTIS e-Manual](https://emanual.robotis.com/docs/en/platform/op3/introduction/)
- The actuators use a "metal case with integrated tapped assembly points" (the servo is the structure). No skin is included by default; 3D files are provided to print one. — [ROBOTIS e-Manual](https://emanual.robotis.com/docs/en/platform/op3/introduction/)
- A 2026 RL paper walks the OP3 at up to 0.45 m/s with arm motion. — [arXiv 2607.20399](https://arxiv.org/abs/2607.20399)

**Berkeley Humanoid Lite (RSS 2025; top of the size range)**
- The paper gives 0.8 m and 16 kg; press coverage says "about 1 meter". — [arXiv 2504.17249](https://arxiv.org/html/2504.17249); conflicting [aiwiki](https://aiwiki.ai/wiki/berkeley_humanoid_lite/raw)
- 22 actuated DOF: 12 in the legs, 10 in the arms (5 per arm), plus integrated grippers.
  - Actuators: 10 × 6512 (about 20 N·m peak) and 12 × 5010 (about 12 N·m peak).
  - One secondary source says the 6512s are "in legs" and the 5010s are in arms and grippers. That doesn't add up with 12 leg joints, so 2 leg joints probably use the 5010 (unconfirmed).
  - — [arXiv](https://arxiv.org/html/2504.17249); [humanoid.guide](https://humanoid.guide/?p=19737)
- The actuators are BLDC drone motors (M6C12 150 KV for the 6512) with a B-G431B-ESC1 driver, an AS5600 encoder and a 3D-printed cycloidal reducer. A 6811ZZ bearing sets the 6512 size. Transmission stiffness is about 319.5 N·m/rad and efficiency about 90%. — [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- PLA FDM throughout; every part fits in 200 × 200 × 200 mm. Parts "can be printed within a week", and assembly takes about 3 days. — [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- 6S 4000 mAh LiPo (about 30 min), Intel N95 mini PC, 4 × 1 Mbps CAN buses, 250 Hz control, BNO085 IMU. Torso is aluminum extrusion. — [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- Repo: https://github.com/HybridRobotics/Berkeley-Humanoid-Lite; docs at berkeley-humanoid-lite.gitbook.io — [project site](https://lite.berkeley-humanoid.org)

**Poppy Humanoid (Inria Flowers, since 2012)**
- 83 cm (Generation Robots lists 85 cm), 3.5 kg, 25 Dynamixel actuators. A 2013 report says 21 × MX-28 at $219 each. — [poppy-project page](https://github.com/poppy-project/poppy-project.org/blob/master/_pages/robots/humanoid/en.html) (via search); [Fabbaloo 2013](https://www.fabbaloo.com/2013/11/adorable-3d-printed-humanoid-robot-html); [Generation Robots](https://www.generationrobots.com/en/403347-poppy-humanoid-robot-raspberry-pi-version-with-3d-parts.html)
- Build cost is $8,000–9,000, about 60% of it actuators; assembly takes about 7 h. Raspberry Pi 3/4. Hardware is CC BY-SA 4.0, software GPL v3. — [GitHub poppy-humanoid](https://github.com/poppy-project/poppy-humanoid)
- Kit price is €8,310 ex VAT. — [Generation Robots](https://www.generationrobots.com/en/403347-poppy-humanoid-robot-raspberry-pi-version-with-3d-parts.html)

**Hiwonder AiNex (commercial kit; aluminum frame, not printed)**
- 24 DOF (standard kit) or 20 DOF (starter). Servos: 14 × HX-35H, 2 × HX-35HM (magnetic encoder, used at the hips; 35 kg·cm ≈ 3.4 N·m stall at 12 V) and 8 × HX-12H. — [ThinkRobotics](https://thinkrobotics.com/products/ainex-ros-education-ai-vision-humanoid-robot-powered-by-raspberry-pi); [RobotShop](https://robotshop.com/products/hiwonder-ainex-ros-education-ai-vision-humanoid-robot-kit-powered-by-raspberry-pi-5-inverse-kinematics-algorithm-standard-kit-with-raspberry-pi-5-4gb)
- Size is 193 × 135 × 415 mm (so about 41.5 cm tall); 2.45 kg (standard) or 2.25 kg (starter). 11.1 V 3500 mAh LiPo, Raspberry Pi 5. Walking speed is listed as 21 cm/s, but one listing says 7 cm/s. — same sources

**Zeroth Bot (K-Scale Labs / zeroth-robotics)**
- MIT license; BOM "starts at $350"; public beta, with V1.0 planned for June 2025. — [GitHub zeroth-bot](https://github.com/zeroth-robotics/zeroth-bot)
- Servo count is inconsistent across sources: 16 × STS3215 in 2024, but "18 metal-gear actuators, 5 per leg, 4 per arm" in 2025. — [CircuitDigest 2024](https://circuitdigest.com/news/zeroth-bot-an-opensource-risc-v-powered-humanoid-robot); [CircuitDigest 2025](https://circuitdigest.com/news/zeroth-bot-an-open-source-programmable-humanoid-robot-for-developers)
- Height (about 40 cm) and mass (about 2 kg) come only from an unreliable third-party page. — [openskillindex](https://openskillindex.com/skills/plurigrid-asi-zeroth-bot)
- K-Scale reportedly shut down in November 2025 and open-sourced its remaining IP. This is unverified (wiki source). — [aiwiki K-Scale](https://aiwiki.ai/wiki/k-scale_labs)

**Westwood / UCLA RoMeLa BRUCE (not printed; reference only)**
- 70 cm, 4.8 kg, 16 DOF, BEAR backdrivable actuators at about 8 N·m burst, about $16,000. Secondary sources. — [HBK case study](https://www.hbkworld.com/en/knowledge/resource-center/case-studies/case-study-pushing-the-boundaries-of-humanoid-robot-performance-with-westwood)

**Kayra (open-source printed humanoid, hobby)**
- 4 servos per leg, Pimoroni RP2040 Servo controller, BNO055 IMU, ESP32-Cam in the head. Design files and BOM were on kayra.org, which was unreachable. Height and servo model were not found. — [Pimoroni forum](https://forums.pimoroni.com/t/2040-controlled-humanoid-kayra-is-learning-to-move/20668)

**Out of scope but encountered**
- Asimov v0 (Menlo Research) is full-size legs only: Encos motors at 36–120 N·m, MJF printing, CERN-OHL-S-2.0. — [GitHub](https://github.com/menloresearch/asimov-v0)
- "Stompy" (Sept 2026) is a 6-DOF printed biped with Robstride 02 motors, about $1,000. — [CircuitDigest](https://circuitdigest.com/news/maker-builds-a-fully-3d-printed-6-dof-bipedal-robot-stompy-using-nvidia-jetson-in-just-3-days)
- ODRI Bolt: no source found in this pass.

### Inferences
- ToddlerBot is the best template for a 50 cm humanoid (similar height, mass, DOF count and printed structure). Open Duck Mini v2 is the best evidence that STS3215-class servos can walk a ~40 cm, ~14-DOF legged robot with RL.
- ToddlerBot's mass budget (about 50 g per actuator, about 1 kg of print + hardware, about 0.6 kg of compute + battery) maps well to STS3215s, which weigh about 55 g ([Core Electronics](https://core-electronics.com.au/feetech-sts3215-smart-servo.html.plain.md)). A 50 cm robot with about 20–24 STS3215s would come to roughly 1.1–1.3 kg of servos, so about 2.5–3.2 kg total, depending on compute.
- Every documented project uses PLA (ToddlerBot, Duck, BHL), with TPU only on foot soles. None reports needing PETG or nylon for the main structure.
- The BHL 200 mm print limit and ToddlerBot's Bambu recommendation both fit the P1S's 256 × 256 × 250 mm volume.

### Gaps
- Leg segment lengths (thigh, shank) and foot dimensions weren't stated in any fetched source for ToddlerBot, Duck or OP3. They would need to be read from the URDF/MJCF or Onshape files.
- Total print time and part counts for ToddlerBot weren't published on the fetched pages (they live in MakerWorld 3MFs, which were not accessible).
- The Open Duck Mini v2 total mass, exact leg-joint list and BOM lines are in a Google Sheet / Feishu wiki that wasn't fetched.
- Poppy's leg geometry (the HAL paper "Leg Design for Biped Locomotion") was blocked by bot protection.
- No primary specs were found for Darwin-OP printed clones, AlohaMini (which appears to be a mobile manipulator, not a humanoid), or ODRI Bolt.

## 2. Torque needed versus torque available per joint; margins, saturation and overheating

### Takeaway
ToddlerBot (about 3.4 kg, 0.56 m) published the only concrete torque budget found. Running and slope climbing need about **2.35 N·m at the knee, 2.66 N·m at ankle pitch and 1.77 N·m at hip pitch**. The team met this with 3.0 N·m-stall XM430-W210s at knee and ankle pitch, so the margin over peak demand is only about 1.1–1.3× stall. An STS3215 12 V (C018, 30 kg·cm ≈ 2.94 N·m stall) is in the same class as the XM430-W210. The 7.4 V STS3215 (19.5 kg·cm ≈ 1.91 N·m stall) is not, and Open Duck sim data shows its knee sitting at stall 14–16% of the time. Thermal limits, not stall torque, are what actually ended runs (about 19 min on ToddlerBot).

### Cited Findings
- ToddlerBot's estimated torque needs for running and slope climbing are knee 2.35 N·m, ankle pitch 2.66 N·m and hip pitch 1.77 N·m. The actuators chosen were knee and ankle pitch XM430-W210 (3.0 N·m stall @12 V), hip roll/pitch 2XC430-W250 (1.8 N·m), ankle roll XC430-T240BB (1.9 N·m) and hip yaw XC330-T288 (1.0 N·m). — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- ToddlerBot lifts up to 1,484 g, 40% of its body weight. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- ToddlerBot's longest streak without a fall was 19 min, after which "motor overheating shifts the robot out of the policy's training distribution". — [arXiv 2502.00893](https://arxiv.org/html/2502.00893); [toddlerbot.github.io](https://toddlerbot.github.io)
- Low battery also costs torque: "tasks that need high torque may fail when the battery is low." — [ToddlerBot tips](https://hshi74.github.io/toddlerbot/sections/05_tips_and_tricks.html)
- **STS3215 variants:**
  - 7.4 V (C001): 6–7.4 V, 19.5 kg·cm peak at 6 V, 6.5 kg·cm rated, stall current 2.0 A at 6 V — [Eckstein](https://eckstein-shop.de/Motors?mf=1611); [Core Electronics](https://core-electronics.com.au/feetech-sts3215-smart-servo.html.plain.md). Seeed lists 5 kg·cm rated — [Seeed](https://www.seeedstudio.com/STS3215-19kg-cm-7-4V-Serial-Servo-p-6338.html).
  - 12 V (C018): 4–14 V, 30 kg·cm stall, 2.7 A stall current at 12 V, 10 kg·cm rated, 1:345 metal gearbox — [RobotShop](https://robotshop.com/products/feetech-12v-30kgcm-magnetic-encoding-servo-sts3215); [OpenELAB C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v)
- **Bench test of the STS3215 C018 at 12 V (Robonine):**
  - Holding torque is about 35 kg·cm (10 cm lever).
  - Dynamically, 15 kg·cm on a 10 cm lever is stable, but 20 kg·cm (2 kg at 10 cm) trips overload protection after several cycles. Under prolonged overload, torque drops to about 20% of nominal.
  - Position error under load is about 2.0° at 10 kg·cm and about 2.6° at 15 kg·cm.
  - The author says 7.4 V gives "noticeably lower" torque, without a number.
  - — [Robonine STS3215 test](https://robonine.com/testing-of-feetech-sts3215-servomotor-backlash-repeatability-and-torque/)
- **Robonine thermal results:**
  - A static 15 kg·cm hold sat at 48 °C after 10 min and stayed stable for more than 1 h.
  - ±90° oscillation went from 48 °C to 60 °C at 50 min, then reached 71 °C about 40 min later, when the motor overheated.
  - Higher acceleration settings overheated it faster.
  - The overheat threshold is 70 °C, while the datasheet operating range is −10 to 60 °C. No active thermal shutdown was observed, so the author recommends a manual cutoff.
  - — [Robonine](https://robonine.com/testing-of-feetech-sts3215-servomotor-backlash-repeatability-and-torque/)
- In an Open Duck Mini v2 sim study with STS3215 stall modeled at 1.86 N·m, the knee sat at that limit 14–16% of the time. This is simulation only; the author never built the hardware. — [soyeon24 build repo](https://github.com/soyeon24/open-duck-mini-v2-build)
- A biped simulator issue proposes modeling STS-class servo thermal derating (about 10–15% torque loss per 10 °C above 25 °C), voltage sag at peak current and about 0.5° deadband. These are the author's estimates, not measurements. — [tomwhipple/biped-robot #6](https://github.com/tomwhipple/biped-robot/issues/6)
- OP3 (51 cm, 3.5 kg) uses 4.1 N·m-stall XM430-W350s at every joint. — [ROBOTIS e-Manual](https://emanual.robotis.com/docs/en/platform/op3/introduction/)
- Hiwonder AiNex (about 2.45 kg) uses 35 kg·cm (about 3.4 N·m) HX-35HM servos at the hips. — [ThinkRobotics](https://thinkrobotics.com/products/ainex-ros-education-ai-vision-humanoid-robot-powered-by-raspberry-pi)
- BHL's locomotion policy used only about 30% of its actuators' torque limit (BLDC actuators at about 12–20 N·m peak on a 16 kg robot). — [arXiv 2504.17249](https://arxiv.org/html/2504.17249); [humanoid.guide](https://humanoid.guide/?p=19737)

### Inferences
- **Implied rule of thumb** (inference from ToddlerBot + OP3 + AiNex): for a 2.5–3.5 kg, 40–56 cm biped, knee and ankle pitch want about 3–4 N·m stall, hip pitch/roll about 2–3.4 N·m, hip yaw about 1 N·m and arms about 1–2 N·m. Commercial robots in this class run about 1.2–1.75× stall over the estimated peak demand (ToddlerBot 3.0/2.35–2.66; OP3 4.1 N·m everywhere).
- The **12 V STS3215 (C018)** roughly matches the XM430-W210 at the knee and ankle pitch. The **7.4 V STS3215** (about 1.9 N·m) would sit below ToddlerBot's estimated knee and ankle demand. For a ~50 cm, ~3 kg robot, the 12 V variant (or a higher-torque Feetech such as the STS3250 class, not researched here) is the safer choice for knee, ankle pitch and hip pitch.
- Rated torque (about 0.98 N·m for C018) is roughly 1/3 of stall. Robonine's dynamic limit of about 15 kg·cm ≈ 1.5 N·m suggests a sustainable continuous-load ceiling near 50% of stall. Design for the knee's standing and crouch holding torque to stay under about 1–1.5 N·m to avoid the 70 °C thermal cutoff.
- Torque at a joint scales roughly with mass × leg length. Sprout-style proportions with a heavy head shift load to the hip pitch and ankle pitch.

### Gaps
- No primary source published a measured joint-torque profile for Open Duck Mini on hardware, nor the knee servo temperature during walking.
- I found no explicit "margin rule" written by any of these teams. The 1.2–1.75× figure is inferred.
- No Feetech-published thermal derating curve was found.

## 3. Documented failures and the fixes that worked

### Takeaway
The failures actually documented on these small printed robots are mostly:
- overheating servos ending runs
- printed parts breaking after several falls (ToddlerBot survives about 7)
- stripped printed screw holes
- wear of printed gears in coupled joints (ToddlerBot waist)
- a single loose ankle cable taking down the whole servo bus
- loosened screws showing up as backlash
- plastic horns or splines stripping

Documented fixes are: design for fast reprint and replace (21 min print + 14 min assembly), PLA-CF with more wall loops for printed gears, metal horns, longer screws, and checking wiring first on intermittent bus faults.

### Cited Findings
- ToddlerBot survives up to 7 falls before breaking. Full restoration took 21 min of printing and 14 min of assembly, including zero-point calibration. The paper notes printed parts are more likely to break on impact than metal. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893); [toddlerbot.github.io](https://toddlerbot.github.io)
- ToddlerBot field notes — [ToddlerBot tips & tricks](https://hshi74.github.io/toddlerbot/sections/05_tips_and_tricks.html):
  - A loose cable near the ankle disconnected during motion and broke the whole motor chain, so check wiring first on intermittent faults.
  - Excess backlash in a standing test points to loose screws, and XC330 joints naturally have more backlash.
  - Repeated screwing strips printed holes; the fix is reprinting the part.
  - The waist (bevel-gear coupled) loosens over time; the fix is reprinting its gears, with PLA-CF and more wall loops extending gear life.
  - A hard-to-close front cover usually means the battery box is mis-seated or the wires are disorganized.
  - Over-discharging the battery damages it.
  - Secure the robot before stopping the control script or cutting power, or it falls.
- ToddlerBot cartwheels have a low success rate, but the robot "almost never breaks". — [toddlerbot.github.io](https://toddlerbot.github.io)
- BHL ran a 60 h durability test of the 6512 actuator (0.5 kg pendulum at 0.5 m, −45° to +90°, 0.5 Hz).
  - Efficiency first dropped, then recovered.
  - Backlash rose slightly from printed-gear wear, to a max of 0.0229 rad (≈1.3°).
  - Efficiency drops at high torque and speed from heat.
  - The authors say thermal effects on printed PLA are insufficiently studied and flag PLA's anisotropy and manufacturing variance.
  - — [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- STS3215 measured backlash is about 0.87° (datasheet ≤0.5°; one commenter measured 0.57°), with a 10-count firmware dead zone. — [Robonine](https://robonine.com/testing-of-feetech-sts3215-servomotor-backlash-repeatability-and-torque/). A comparison review rates the STS3215 worst for backlash and weak on heat dissipation — [Robonine comparison](https://robonine.com/smart-serial-servo-motor-comparison-robotics/).
- Two opposed STS3215s with a preload offset cut effective backlash from about 1.3° to about 0.1–0.2° while keeping about 80% of torque. — [Robonine backlash compensation](https://robonine.com/backlash-compensation-in-sts3215-servo-actuators/)
- A plastic servo horn stripped out on a printed legged robot and disabled a leg. The fix was an aluminum horn, though attaching it to the printed joint was "a bit dicey", leading to a joint redesign. — [Hackaday.io Mike's Robot Dog log](https://hackaday.io/project/52956/log/120186)
- The short screws shipped with servos don't get enough thread engagement in printed parts and tear out; the fix is longer fasteners. — [New Screwdriver blog](https://newscrewdriver.com/2018/06/21/upgrade-servo-horn-fastener-to-address-coupler-weakness/)
- Printed plastic splines that mate directly to a servo strip under high stress; one workaround is pressing the printed part onto a metal output gear. — via search summary of a builder log (source in [search results](https://synthiam.com/Community/Tutorials/GetPDF?id=17948); not verified in full)
- Jetson overheating is a risk if the fan is covered, for example by clothing on the robot. — [ToddlerBot tips](https://hshi74.github.io/toddlerbot/sections/05_tips_and_tricks.html)

### Inferences
- For a STS3215 build: use metal (aluminum) horns bolted through to the printed link, with long through-bolts or heat-set inserts rather than self-tapped holes. Make high-load links cheap to reprint, and expect fall damage after a handful of falls.
- Route cables through joint centers with strain relief at the ankles, since ToddlerBot's single ankle cable failure took down the whole bus. With daisy-chained STS servos, one connector failure stops every servo downstream.
- Coupled printed gears (waist, any 1:1 spur relocation) are wear items: print them in PLA-CF or a similar material, with high wall counts.
- Watch servo temperature in software and stop near 65–70 °C, since the STS3215 had no reliable thermal shutdown in testing.

### Gaps
- No source documented frame flex or layer-line cracking with numbers, PETG vs PLA comparisons on these robots, or battery-placement problems (beyond ToddlerBot's cover/battery-box fit).
- No Open Duck Mini GitHub issue on stripped gears or overheating was found in this pass. The repo's issues and Discord weren't searched directly.

## 4. Joint structure: servo-as-structure, brackets, idler bearings, linkages

### Takeaway
Small printed humanoids mix two patterns. One is servo-as-structure, where the servo case carries load and the printed links bolt to the horn and to a coaxial idler on the opposite side (OP3, AiNex). The other is printed links with transmissions that move axes or motors, as on ToddlerBot: 1:1 spur gears to relocate axes, a parallel linkage at the knee to raise the knee motor's mass, a parallel-linkage neck pitch, a bevel-gear differential waist, and a hip yaw with a reinforced secondary axis on planar bearings and metal shafts.

### Cited Findings
- ToddlerBot joint structures — [arXiv 2502.00893](https://arxiv.org/html/2502.00893):
  - Arms use 1:1 spur gears to relocate joint axes.
  - Legs have 3 hip DOF, then a **parallel linkage at the knee** with the motor placed higher to reduce leg inertia, then 2 ankle DOF.
  - Ankle-pitch extension partly compensates a 40° knee-pitch range gap, and linkage ranges are generally under 160°.
  - The neck has 2 DOF, with a parallel linkage on pitch and the motor inside the head.
  - The waist has 2 DOF from two motors through coupled bevel gears.
  - Hip yaw is a 1:1 spur gear with a reinforced secondary axis, planar bearings and metal shafts.
  - Ball bearings pair with the parallel linkages.
  - Shoulder roll is limited to 90°.
- OP3 actuators have a metal case with integrated tapped mounting points, so the servo is the structure. — [ROBOTIS e-Manual](https://emanual.robotis.com/docs/en/platform/op3/introduction/)
- AiNex uses an aluminum alloy frame with bus servos. — [ThinkRobotics](https://thinkrobotics.com/products/ainex-ros-education-ai-vision-humanoid-robot-powered-by-raspberry-pi)
- BHL's actuators are the structure ("modular and make up most of the frame"), with a printed cycloidal reducer around a 6811ZZ bearing. — [Hackaday](https://hackaday.com/2026/08/30/lower-cost-humanoid-robot-leverages-diy-actuators/); [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- The STS3215 has a dual-shaft option (Eckstein listing: "Magnetic Encoder Servo with Dual Shaft"), which enables a driven output on one side and a rear idler hub on the other. — [Eckstein](https://eckstein-shop.de/Motors?mf=1611)

### Inferences
- For a STS3215 build, the minimal robust pattern is a U-shaped printed link that bolts to the metal horn on the drive side and to the servo's rear idler shaft (or a printed boss with a small ball bearing) on the other. This keeps bending load off the servo's output bearing. A parallel knee linkage like ToddlerBot's moves knee-servo mass up toward the hip.

### Gaps
- No source gave specific idler bearing sizes (for example MR85, 683 or 6800) for ToddlerBot or Duck joints. These would need to come from the BOM sheets or the Onshape files.
- No cross-roller bearing use was found in these small robots.

## 5. Cost: real BOM totals and biggest lines

### Takeaway
BOMs fall into three tiers:
- **STS3215-class** robots run about $350–400 (Open Duck Mini v2 <$400; Zeroth Bot from $350). Servos are the largest line at about €14 × 14 ≈ €196.
- **Dynamixel-class printed** robots run about $6,000 (ToddlerBot), with motors + computer at about 90%.
- **Research or commercial** robots run about $8–16k (Poppy $8–9k with 60% actuators; BRUCE about $16k).

BHL breaks out at $4,312 (US), with actuators at about 82%.

### Cited Findings
- Open Duck Mini v2's full BOM is "under $400", with STS3215 7.4 V at about €14 each × 14. — [GitHub](https://github.com/apirrone/Open_Duck_Mini); [MakerWorld snippet](https://www.makerworld.com/en/models/2755651)
- A build report puts the Open Duck BOM at "under NT$20,000" (about $620 USD; conversion is my estimate). — [Threads build post](https://www.threads.com/@dingcheng.h/post/DW_VJrrD-9p/)
- STS3215 street price is about $15, plus about $5 for a UART adapter. — [Robonine](https://robonine.com/testing-of-feetech-sts3215-servomotor-backlash-repeatability-and-torque/)
- Zeroth Bot BOM starts at $350. — [GitHub](https://github.com/zeroth-robotics/zeroth-bot)
- ToddlerBot is under $6,000, with about 90% on motors and computer. — [arXiv 2502.00893](https://arxiv.org/html/2502.00893). A curriculum paper using ToddlerBot notes fabrication, repairs and compute add to the delivered cost — [arXiv 2609.25674](https://arxiv.org/html/2609.25674).
- BHL totals $4,312 US / $3,236 China. The largest lines are 10 × 6512 actuators at $1,880, 12 × 5010 actuators at $1,632, printed parts at $200 and the mini PC at $129. Per actuator, the 6512 is $188 (of which the motor is $129) and the 5010 is $136. — [arXiv 2504.17249](https://arxiv.org/html/2504.17249)
- Poppy Humanoid costs $8,000–9,000, about 60% actuators. — [GitHub poppy-humanoid](https://github.com/poppy-project/poppy-humanoid)
- BRUCE is about $16,000 (secondary source). — [HBK case study](https://www.hbkworld.com/en/knowledge/resource-center/case-studies/case-study-pushing-the-boundaries-of-humanoid-robot-performance-with-westwood)

### Inferences
- Rough BOM for a ~50 cm STS3215 humanoid with 20–24 servos:
  - servos: 20–24 × about $15–20 = $300–480 (the 12 V C018 typically costs a bit more than C001; unverified)
  - Raspberry Pi 5 / CM5-class compute: about $60–100
  - battery, BMS, bus board, IMU, camera: about $80–150
  - filament: about 1–1.5 kg PLA + TPU, about $30–40
  - Total: about $500–800 without a Jetson, or about $1,000–1,300 with a Jetson Orin Nano. All of these are estimates, not sourced figures.

### Gaps
- Full line-item BOMs for ToddlerBot and Open Duck are in Google Sheets that weren't fetched.
- No figure was found for the cost share of fasteners and bearings.

## 6. Fauna Robotics Sprout: proportions, DOF, materials and design language

### Takeaway
Sprout (launched 27 Jan 2026) is a 107 cm, 22.7 kg, 29-DOF soft-shelled developer humanoid. It is not a printed hobby robot, and its actuators are unpublished. Its design language is a wide rectangular head with a white rectangular face panel, an LED array instead of a screen, two motorized yellow-green antenna "eyebrows", soft padded exterior panels, and silver-grey and mint-green body tones. Yellow-green accent discs mark the shoulder, hip and wrist joints, ankles are mint-green, and soles are yellow-green rubber. Scaled to 50 cm it would be about 21 × 10 cm in plan.

### Cited Findings
- Height 107 cm, mass 22.7 kg, width 45 cm, depth 21 cm. 29 DOF including 2 eyebrow DOF. — [arXiv 2601.18963 (Fauna Sprout)](https://arxiv.org/html/2601.18963v1)
- No per-limb DOF breakdown is published. The text mentions neck yaw and pitch (controllable gaze), pelvis pitch, roll and height control, and waist pitch when kneeling. — [arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- The motors are backdrivable with "conservative joint torque limits". Motor type and supplier are not named. Motor controller modules plug into a custom backplane, and an Ethernet link connects them to the main computer. — [arXiv](https://arxiv.org/html/2601.18963v1); [The Robot Report](https://www.therobotreport.com/introducing-sprout-a-new-humanoid-development-platform/)
- Per-arm payload, as max (<10 s) / nominal (<90 s) / rated (indefinite):
  - forward raise: 3.7 / 1.75 / 0.7 kg
  - lateral raise: 5.6 / 2.5 / 0.0 kg
  - bent elbow: 11.2 / 5.0 / 1.1 kg
  - The grippers are 1-DOF with software-limited 12 N grip force.
  - — [arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- Battery is a custom Molicel P50B Li-ion pack at 46.8 V nominal (5000 or 10,000 mAh), swappable, with 3–3.5 h runtime. Compute is a Jetson AGX Orin 64 GB. Sensors are a ZED2i stereo camera in the head, 4 × VL53L8CX ToF sensors, a 9-axis IMU, a 4-mic array and speakers. There is an E-stop and a rear carry handle. — [arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- Build philosophy: low part count, standardized fasteners, a clear assembly order, repeatable cable routing, and mechanical and electrical design developed together. Motors were selected early. — [arXiv 2601.18963](https://arxiv.org/html/2601.18963v1)
- Safety by design: low mass, minimal pinch points, soft deformable exterior panels and a rear handle. The robot falls, crawls and recovers "without damaging delicate end effectors". — [arXiv](https://arxiv.org/html/2601.18963v1); [designboom](https://www.designboom.com/technology/portable-humanoid-robot-antenna-eyebrows-light-animations-sprout-fauna-robotics/)
- Head and face:
  - The head is "wide, rectangular".
  - Two antenna-like eyebrows "rise and fall like windshield wipers".
  - The LED facial display is described as "360-degree".
  - The influences cited are Baymax and Rosie.
  - — [Yanko Design](https://www.yankodesign.com/2026/02/07/fauna-robotics-just-built-the-first-humanoid-youd-want-home/)
  - The face is non-screen: an LED array plus eyebrows — [The Robot Report](https://www.therobotreport.com/introducing-sprout-a-new-humanoid-development-platform/).
  - The head has a plastic grid that accepts LEGO-style bricks for customization — [The Robot Report](https://www.therobotreport.com/introducing-sprout-a-new-humanoid-development-platform/); [arXiv](https://arxiv.org/html/2601.18963v1).
- Colors and materials — [urdesignmag](https://www.urdesignmag.com/fauna-robotics-sprout-humanoid-robot-design-indoor-social/) (third-party description of renders):
  - The face is a white rectangular panel with two stereo cameras on the head.
  - The eyebrows are yellow-green.
  - The body is silver-grey and mint-green.
  - Yellow-green accent joints sit at the shoulders, hips and wrists, and the ankle joints are mint-green.
  - Feet have yellow-green rubber soles and a Fauna logo embossed on an ankle disc.
  - The gripper has mint-green and dark-grey fingers.
  - The frame is aluminum and composite under a padded, soft exterior.
  - The article calls it Pixar-like, reading "closer to consumer electronics than industrial robotics".
- Coverage describes the exterior as "soft, foam-like materials and padded panels". — [humanoidsdaily / search summary](https://www.humanoidsdaily.com/news/fauna-robotics-exits-stealth-with-sprout-a-soft-bodied-humanoid-for-the-messy-reality-of-shared-spaces)
- Fauna is in New York; its founders are Rob Cochran and Josh Merel. — [The Robot Report](https://www.therobotreport.com/introducing-sprout-a-new-humanoid-development-platform/)
- Price: one listing says $50,000, which is unverified. One review's 160 cm height is wrong against the paper's 107 cm. — [robotoverflow](https://robotoverflow.com/en/robot-database/sprout/); [search summary](https://robixone.com/robots/fauna-robotics-fauna-sprout/)

### Inferences
- **Scaling Sprout to a 50 cm robot** (factor 0.467): width 45 cm becomes about 21 cm and depth 21 cm becomes about 9.8 cm. Geometric (cube-law) mass scaling would give about 2.3 kg, consistent with the ~2.5–3.2 kg servo-humanoid estimate above.
  - A 21 cm-wide torso shell fits the P1S's 256 mm bed in one piece.
  - A ~50 cm robot's head (likely about 15–20 cm wide at Sprout-like proportions; head-to-body ratio not published) also fits.
- **Translating the design language to FDM:**
  - Soft padded panels become TPU (e.g. 95A) or thin PLA shells with TPU bumpers.
  - Colored joint accent discs make natural covers for servo horns and idler hubs.
  - The rectangular head houses an LED matrix behind a diffuser, plus two small servos for the antenna eyebrows (Sprout's 29 DOF includes 2 for eyebrows).
  - Yellow-green TPU soles double as grip pads (Open Duck already uses TPU foot bottoms).

### Gaps
- Sprout's per-limb DOF, actuator models and torques, link lengths, foot size, head dimensions, and exact shell materials (foam type, fabric, overmold) aren't published. The color descriptions come from a design magazine's reading of renders, not from Fauna.
- Fauna's own product page wasn't fetched in this pass.
- No teardown exists.
