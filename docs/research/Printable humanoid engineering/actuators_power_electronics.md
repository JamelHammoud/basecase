# Actuators, Power and Electronics for a ~50 cm, 2–3 kg 3D-Printed Hobby Humanoid (as of 2026-10-17)

Scope: ~20 serial bus servos (Feetech STS / Waveshare ST / Hiwonder LX class), Raspberry Pi 5, camera, IMU, face display. All prices and pages were seen on 2026-10-17 unless noted. Unit conversion used throughout: 1 kg·cm = 0.0981 N·m (so 30 kg·cm ≈ 2.94 N·m).

Source-quality warning: Feetech's own site (feetechrc.com) publishes very thin product pages with no current figures, and I found no official Feetech PDF datasheet or dimensioned drawing via web search. Most per-variant numbers below come from authorised resellers (OpenELAB, Seeed Studio) and Waveshare (which rebrands Feetech as "ST3215"). Treat them as reseller-sourced unless marked "official".

## 1. Bus servo specifications (STS3215 variants, STS3250, STS3032, SCS0009, LX-16A, ST3215-HS)

### Takeaway
The STS3215 family shares one housing (45.2 × 24.7 × 35 mm, ~55 g, 25T spline, 12-bit encoder, 1 Mbps TTL half-duplex, 5264-3P connector); variants differ in voltage and gear ratio. The 12 V C018 (30 kg·cm stall / 10 kg·cm rated / 2.7 A stall, 4–14 V input) is the right leg actuator for a 3S pack; the 7.4 V C001 (19.5 / 5 kg·cm, listed 4–7.4 V) is NOT specified for a full-charge 2S pack (8.4 V) by the reseller's spec. Rated torque is consistently ~1/3 of stall across the family.

### Cited Findings

**Feetech STS3215 – common platform**
- Official Feetech page (7.4 V model): stall torque 19.5 kg·cm @ 7.4 V, 52 RPM @ 7.4 V, 1:345 copper gear combination, size 45.2 × 24.7 × 35 mm, "double axis structure design", current feedback scale "1 = 6.5 mA". No current, weight, spline or hole data listed. — [Feetech official STS3215 page](https://www.feetechrc.com/en/2020-05-13_56655.html)
- STS3215-C001 (7.4 V, 345:1): input voltage range 4–7.4 V; stall 19.5 kg·cm @ 7.4 V; rated 5 kg·cm @ 7.4 V; stall current 2.5 A @ 7.4 V; rated current 650 mA; no-load current 150 mA; no-load speed 0.192 s/60° (52 RPM) @ 7.4 V; at 6 V: 16.5 kg·cm stall, 4 kg·cm rated, 0.238 s/60°; case PA+GF, copper gears, ball bearings; 12-bit magnetic encoder ≈ 0.088°/step; 55 ± 1 g; 45.2 × 24.7 × 35 mm; output spline 25T, OD 5.9 mm; backlash ≤ 0.5°; half-duplex async TTL 8N1; 38,400 bps – 1 Mbps; IDs 0–253; 5264-3P connector (GND, VCC, signal); feedback of position, speed, load, voltage, current, temperature; operating temp −20 to +60 °C; price €21.89–23.57. — [OpenELAB STS3215-C001](https://openelab.io/products/feetech-sts3215-c001-servo)
- STS3215-C018 (12 V, 345:1): input voltage range 4–14 V; stall 30 kg·cm @ 12 V; rated 10 kg·cm @ 12 V; 0.222 s/60° (45 RPM) @ 12 V; no-load current 180 mA; stall current 2.7 A; rated current 900 mA; copper gears; 55 ± 1 g; same size, 25T OD 5.9 mm spline, backlash ≤ 0.5°; operating temp −10 to +60 °C; €21.89 regular / €26.51 pre-order. — [OpenELAB STS3215-C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v)
- Variant comparison table: C044 = 7.4 V, 191:1, 27.4 kg·cm stall, 9 kg·cm rated, 0.116 s/60°; C046 = 7.4 V, 147:1, 14.4 kg·cm stall, 4.8 kg·cm rated, 0.094 s/60°. — [OpenELAB STS3215-C001 page, comparison table](https://openelab.io/products/feetech-sts3215-c001-servo)
  - Note an internal inconsistency: a lower-ratio (faster) C044 showing *more* stall torque (27.4) than the 345:1 C001 (19.5) is physically odd for the same motor; Seeed lists the same 27.4 / 9 kg·cm figures, so it is consistently reported but unexplained (possibly a different motor). — [Seeed C044](https://www.seeedstudio.com/Feetech-ST-3215-C044-Heavy-Duty-Servo-7-4V-1-191-Gear-Reduction-p-6460.html)
- Seeed C044: "1:191 metal gearbox", stall 27.4 kg·cm, rated 9 kg·cm, $21.99 (10+: $20.99). — [Seeed Studio C044](https://www.seeedstudio.com/Feetech-ST-3215-C044-Heavy-Duty-Servo-7-4V-1-191-Gear-Reduction-p-6460.html)
- Seeed C001 listing: stall 19.5 kg·cm, rated 5 kg·cm at 7.4 V. — [Seeed Studio C001](https://www.seeedstudio.com/STS3215-19kg-cm-7-4V-Serial-Servo-p-6338.html)
- SO-ARM100 BOM: follower uses 6× STS3215 1/345 (C001); leader mixes C001, C044 (1/191) and C046 (1/147). "The 7.4V has a stall torque of 16.5kg.cm at 6V (and likely slightly less for a 5V power supply)"; "The 12V version has a stall torque of 30kg.cm"; with 12 V servos "you will also have to buy a 12V 5A+ power supply instead of a 5V one". Alibaba price $13.89 per servo (not a US distributor). — [TheRobotStudio SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100); gear table also in [LeRobot SO-101 docs](https://huggingface.co/docs/lerobot/so101)
- SO-101 assembly: horn secured with an M3×6 screw; servos fastened to printed parts with M2×6 screws (4 per motor in most joints); a second (rear) horn is fitted with "no screws required for the bottom horn" — i.e. the servo has a rear idler boss that takes a horn. — [LeRobot SO-101 docs](https://huggingface.co/docs/lerobot/so101)
- C047: no specifications found from any source.

**Waveshare ST3215 (rebranded Feetech 12 V STS3215)**
- 6–12.6 V operating; "up to 30kg.cm@12V"; locked-rotor current 2.7 A; no-load current 200 mA; 0.222 s/60° (45 RPM) @ 12 V; metal gear; 360°/4096 magnetic encoder; 45.22 × 35 × 24.72 mm; 1 Mbps; TTL half-duplex; 5264/2.54 3P connector; ID 0–253. — [Waveshare ST3215 wiki](https://www.waveshare.com/wiki/ST3215_Servo)

**Waveshare ST3215-HS (high speed)**
- 6–12.6 V; 20 kg·cm @ 12 V; 0.09 s/60° (106 RPM) @ 12 V; 68.0 g; 45.2 × 24.7 × 35.0 mm; metal/steel gear; stall ≤ 2.4 A; 38.4 kbps–1 Mbps. Idle current listed as "240.000 A" (data error). Page states some data comes from "community contributions and AI" — low confidence. — [ServoDatabase ST3215-HS](https://servodatabase.com/servo/waveshare/st3215-hs)
- Waveshare's own ST3215-HS wiki URL returned 404. — (fetch of waveshare.com/wiki/ST3215-HS_Servo)

**Feetech STS3250 (12 V, 50 kg·cm)**
- STS3250 / ST-3250-C002: 6–12 V operating range; stall 50 kg·cm @ 12 V; rated 16 kg·cm @ 12 V; stall current 4.2 A @ 12 V; rated current 1400 mA; no-load current 280 mA; no-load ~0.133 s/60° @ 12 V; 1/345; 12-bit magnetic encoder; double shaft. — [Evelta ST-3250-C002](https://evelta.com/st-3250-c002-12v-50kg-cm-copper-metal-gear-digital-servo-motor/), [Evelta STS3250](https://evelta.com/sts3250-12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo/) (via search summary)
- OpenELAB STS3250-C002: 6–12 V, 50 kg·cm @ 12 V, 345:1, metal gears, €67.04–72.40 incl. VAT. — [OpenELAB STS3250-C002](https://openelab.io/products/feetech-sts3250-c002-servo-12v)

**Feetech STS3032 (small)**
- 4.5 kg·cm stall @ 6 V, 1.5 kg·cm rated; 4.8–6 V; 0.09 s/60° @ 6 V; weight reported as 20 g, 20.6 g or ~28 g in different listings; dimensions 23.2 × 12.1 × 28.5 mm vs 32 × 12 × 27.5 mm in different listings (possibly two housings). — [rcdrone STS3032](https://rcdrone.top/products/feetech-scs-sts3032-4-5-kg-servo), [Eckstein](https://eckstein-shop.de/Motors?mf=1580), [aifitlab](https://aifitlab.com/products/feetech-sts3032-servo-motor) (via search summary; conflicting)

**Feetech SCS0009 (micro, potentiometer)**
- 2.3 kg·cm stall @ 6 V; stall current 1.0 A @ 6 V; 4–7.4 V; weight listed as 11 g in text vs 13.2 ± 1 g in spec sheet. Related SC-0090-C001 rated torque 0.7 kg·cm @ 6 V. — [MakerStore](https://www.makerstore.com.au/?p=144908), [Hubtronics SC-0090-C001](https://hubtronics.in/motors-and-actuators/sc-0090-c001) (via search summary)

**Hiwonder LX-16A**
- Official manual: 6–8.4 V; 17 kg·cm @ 6 V, 19.5 kg·cm @ 7.4 V; stall current 2.4–3 A; no-load 100 mA; 54 g; 0–240° range; 0.3° accuracy; 0.19 s/60° @ 7.4 V. Pimoroni lists 6–8 V and 17 kg·cm @ 7.4 V (conflict); some listings give 20 kg·cm @ 7.4 V. — [LX-16A user manual (RobotShop CDN)](https://cdn.robotshop.com/rbm/a5e9ab51-86bc-497b-adac-003de3088fb7/9/92896585-5e83-4c7c-a663-650b81e5978b/67e9729b_lx-16a-serial-bus-servo-user-manual.pdf), [Pimoroni](https://shop.pimoroni.com/products/metal-gear-serial-servo) (via search summary)

**Horn / mounting geometry**
- 25T spline, OD 5.9 mm (C001/C018). — [OpenELAB C001](https://openelab.io/products/feetech-sts3215-c001-servo)
- Generic 25T metal horn (not STS-specific): OD 20 mm, 3 mm centre hole, M3 mounting holes; Pololu 25T horn has M3 holes 15.0 and 19.0 mm from axis — these are different parts, not STS3215 horns. — [Core Electronics metal horn](https://core-electronics.com.au/metal-servo-horn.html.md), [Pololu 3433](https://pololu.com/product/3433/specs)

### Inferences
- **Voltage-compatibility rule:** reject a servo/battery pairing if pack full-charge voltage (4.2 V/cell × S) exceeds the servo's listed max input. Results: C001 (max 7.4 V listed) vs 2S full 8.4 V → FAIL by listed spec (many builders run C001 on 2S anyway, but that is outside spec); LX-16A (max 8.4 V) vs 2S → PASS at the limit; C018 (max 14 V) and Waveshare ST3215 (max 12.6 V) vs 3S full 12.6 V → PASS; STS3250 (max 12 V listed) vs 3S full 12.6 V → FAIL by listed spec (marginal). Also check pack minimum (3.0–3.3 V/cell × S) vs servo min (C018 4 V, ST3215 6 V) — always PASS for 2S/3S.
- **Torque scales with voltage:** C001 at 6 V gives 16.5 vs 19.5 kg·cm at 7.4 V (≈ −15%); a check should derate stall torque to the *loaded, sagging* pack voltage, not nominal.
- **Rated/stall ratio is ~0.31–0.33 for every Feetech variant with both numbers** (C001 5/19.5 = 0.26; C018 10/30 = 0.33; C044 9/27.4 = 0.33; C046 4.8/14.4 = 0.33; STS3250 16/50 = 0.32; STS3032 1.5/4.5 = 0.33). Feetech's "rated torque" is effectively defined as ≈ 1/3 stall.
- Torque in N·m for checks: C018 stall 2.94 / rated 0.98; C001 stall 1.91 / rated 0.49; C044 stall 2.69 / rated 0.88; STS3250 stall 4.90 / rated 1.57; LX-16A stall 1.91 @ 7.4 V.
- Mass budget: 20 × STS3215 ≈ 1.10 kg (55 g each) — roughly 40–55% of a 2–3 kg robot before frame, battery and electronics. A full-STS3250 build would add more (weight not found).

### Gaps
- No official Feetech PDF datasheet or dimensioned drawing (horn bolt pattern, case mounting-hole pattern, rear idler boss diameter) was found on the web; feetechrc.com's page does not link a STS3215-specific drawing. Mounting pattern must come from the STEP model or calipers. The SO-101 docs confirm M2 case screws and an M3 horn screw only.
- STS3215-C047 specs: nothing found.
- STS3250 weight and dimensions: not found from a reliable page.
- Gear ratio of Waveshare ST3215/ST3215-HS and LX-16A not published.
- Backlash beyond the reseller "≤0.5°" figure: no independent measurement found.

## 2. Continuous torque vs stall, and safety factors

### Takeaway
Manufacturers' own "rated" torque for these servos is ~1/3 of stall; Robotis explicitly advises designing for ≤1/5 of stall for stable motion (XL-320) and planning motions within continuous torque. A sensible rule: static holding load ≤ rated torque (≈ stall/3), and design-target ≤ stall/5 for legs that hold load continuously; arms can tolerate ≤ stall/3.

### Cited Findings
- Robotis XL-320 e-manual: stable motions are possible with robots designed for loads of 1/5 or less of the stall torque; stall torque is "the maximum instantaneous and static torque". — [Robotis XL-320 e-manual](https://emanual.robotis.com/docs/en/dxl/x/xl320/)
- Robotis blog: continuous torque is the torque a unit can output while run constantly; plan motions within the continuous range; stall torque is not recommended for extended periods. — [Robotis US blog: torque ratings](https://robotis.us/robotis-blog/torque-ratings)
- Feetech rated torque values (≈ 1/3 stall) — see section 1, e.g. C018 30 / 10 kg·cm. — [OpenELAB C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v)
- Feetech rated current: C018 900 mA at rated torque vs 2.7 A stall; C001 650 mA vs 2.5 A. — [OpenELAB C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v), [OpenELAB C001](https://openelab.io/products/feetech-sts3215-c001-servo)
- No community thermal test (temperature vs time at a fixed fraction of stall) for STS3215 was found; one search for measured humanoid/walking current returned only datasheet values. — (search: "STS3215 humanoid robot current draw battery 3S power measured walking")

### Inferences (estimates, clearly not sourced as rules)
- Proposed engineering check: `required_static_torque ≤ rated_torque` (fail), `≤ 0.2 × stall` (pass/green), between = warn. For dynamic peaks (step push-off, squat recovery): `peak ≤ 0.6 × stall_at_sagged_voltage`.
- Worked estimate, 2.5 kg robot, single-leg stance, hip/ankle roll with CoM 50 mm lateral of the joint: τ = 2.5 × 9.81 × 0.05 ≈ 1.23 N·m ≈ 12.5 kg·cm → exceeds C018 rated (10 kg·cm), is 42% of stall. So hip/ankle roll on a 2.5 kg robot needs either lateral offsets < 40 mm, a 3 kg·cm-class margin (STS3250, 16 kg·cm rated), or doubled servos. Knee in a 30° crouch with ~40 mm shin moment arm in double stance: 1.25 kg × 9.81 × 0.04 ≈ 0.49 N·m ≈ 5 kg·cm per knee → OK on C018 (50% of rated).
- Arms (e.g. 150 mm arm with 100 g at the hand plus 60 g servo mid-arm): ≈ 0.1 × 9.81 × 0.15 + 0.06 × 9.81 × 0.075 ≈ 0.19 N·m ≈ 2 kg·cm → C001 or C046 is ample.

### Gaps
- No measured STS3215 temperature-rise data or thermal shutdown threshold found (the servo reports temperature, but the default limit was not found in sources read).
- No published hobby-humanoid safety-factor convention specific to legs vs arms; the leg/arm split above is my inference from Robotis guidance plus Feetech rated ratios.

## 3. Bus servo controllers and wiring 20 servos

### Takeaway
Bus adapters pass battery power straight through to the servo bus with limited or unstated current limits (Waveshare General Driver: 5 A continuous; FE-URT-1: 6 A over-current; Bus Servo Adapter (A): not stated). For 20 servos, power the servo bus from the battery via your own fused distribution (several branches), and use the adapter only for the data line + a ground reference.

### Cited Findings
- Waveshare Bus Servo Adapter (A): input 9–12.6 V "(should match servo voltage)"; 5.5 × 2.1 mm DC jack or screw terminal; drives up to 253 ST/SC servos "with sufficient power"; 42 × 33 mm, 2.5 mm mounting holes; jumper A = UART (Pi Zero, ESP32…), jumper B = USB; max current through the power path not stated. — [Waveshare Bus Servo Adapter (A) wiki](https://www.waveshare.com/wiki/Bus_Servo_Adapter_(A))
- Waveshare General Driver for Robots: input DC 7–13 V via XH2.54; "can be powered directly by 2S or 3S lithium battery"; input directly powers servos and motors; bus servo current limit up to 5 A for long-term operation; ST3215 example supports up to 5 servos "depending on operating conditions and on not stalling them simultaneously"; onboard 5 V DC-DC for Pi/Jetson (current not specified); INA219 voltage/current monitor; QMI8658C + AK09918C 9-axis IMU; ESP32-WROOM-32UE; TB6612FNG; 65 × 65 mm, holes 49 × 58 mm, Ø3 mm. — [Waveshare General Driver for Robots wiki](https://www.waveshare.com/wiki/General_Driver_for_Robots)
- Feetech FE-URT-1: USB 5 V logic with 500 mA overcurrent protection; servo power port over-current limit "maximum is 6A"; 5.08 mm terminal for servo power; 5 V and 3.3 V UART levels; supports TTL (SCS/STS) and RS-485 (SMS); FE-URT1-C001 listed as discontinued at one Japanese retailer. — [Evelta FE-URT-1](https://evelta.com/fe-urt-1-rs485-servo-bus-programmer-usb-to-ttl-serial-signal-converter/), [Switch Science](https://www.switch-science.com/products/7490) (via search summary)
- LeRobot: one Waveshare adapter drives 6 daisy-chained STS3215 per arm; with Waveshare board "make sure that the two jumpers are set on the B channel (USB)". — [LeRobot SO-101 docs](https://huggingface.co/docs/lerobot/so101)
- Servo connector is 5264-3P (2.5 mm pitch; Waveshare calls it "5264/2.54 3P"). — [OpenELAB C001](https://openelab.io/products/feetech-sts3215-c001-servo), [Waveshare ST3215 wiki](https://www.waveshare.com/wiki/ST3215_Servo)
- Molex current rating for the 5264 housing could not be fetched (molex.com timed out); nearby Molex 2.5 mm-pitch families are rated 4 A (Mizu-P25) and 6 A. — [RS Online Mizu-P25 cable](https://uk.rs-online.com/web/p/wire-to-board-cables/2098886) (via search summary)

### Inferences (estimates)
- Treat each 5264 daisy-chain branch as ≤ 3 A continuous (assumed rating for the 5264-family crimp, unconfirmed; thin servo-lead wire is usually the real limit). With C018 rated current 0.9 A, that is ~3 loaded servos per branch, or ~5–6 lightly loaded (arm/head) servos. Never put a whole leg (6 servos × 2.7 A stall = 16 A) on one 5264 chain.
- Suggested topology for 20 servos: 4–6 branches (left leg, right leg, left arm, right arm, torso/head), each fed from a power distribution board with a per-branch fuse/polyfuse (~3–5 A), data line shared from one adapter (or split across two UARTs for bandwidth). Each 5264 servo passes through the full branch current on its internal two connectors — the first servo in a chain carries the sum.
- Bus bandwidth estimate: at 1 Mbps, a 20-servo sync-read/write cycle easily fits under 10 ms (rough; not measured here).

### Gaps
- Official Molex 5264 (50-37-50xx) current rating not retrieved; Feetech's recommended maximum servos per chain not found.
- Bus Servo Adapter (A) PCB trace/current rating not published.

## 4. Power: current budget, battery, fusing, Pi 5 supply and brownout isolation

### Takeaway
Worst-case servo current is 20 × 2.7 A = 54 A at 12 V (all stalled) — unrealistic but sets fuse/wire ceilings. A realistic budget for standing/walking is ~0.9 A × (number of load-bearing servos) plus idle for the rest, i.e. ~6–12 A peaks and ~3–5 A average (estimate). Use a 3S pack with C018-class servos, a separate 5 V ≥ 5 A buck (e.g. Pololu D36V50F5) for the Pi 5 with `PSU_MAX_CURRENT=5000`, and a bulk capacitor/separate branch so servo surges cannot pull the Pi below its ~4.63 V brownout threshold.

### Cited Findings
- Per-servo currents (C018 @ 12 V): no-load 180 mA, rated 900 mA, stall 2.7 A. — [OpenELAB C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v); Waveshare ST3215: 200 mA no-load, 2.7 A locked. — [Waveshare ST3215 wiki](https://www.waveshare.com/wiki/ST3215_Servo)
- STS3250 stall 4.2 A, rated 1.4 A @ 12 V. — [Evelta STS3250](https://evelta.com/sts3250-12v-50kg-360deg-magnetic-encoder-double-shaft-ttl-servo/)
- Waveshare: ST3215 can run directly from 2S/3S lithium; large servo counts need a supply that can deliver enough current. — [Waveshare ST3215 wiki](https://www.waveshare.com/wiki/ST3215_Servo)
- SO-ARM100: 12 V servos need a "12V 5A+" supply for 6 servos. — [SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)
- No measured walking/standing current data for STS3215 humanoids was found. — (search noted in §2)
- Raspberry Pi 5: recommended 5 V 5 A USB-C (27 W); with 5 A, USB peripherals get 1.6 A total; otherwise (e.g. 3 A supply) limited to 600 mA and USB boot is disabled; `usb_max_current_enable` is set automatically when 5 V 5 A is negotiated via PD or when `PSU_MAX_CURRENT=5000` is set (needed for non-PD supplies such as a buck converter feeding the Pi). — [Raspberry Pi whitepaper: USB Power Delivery on Raspberry Pi 5](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-009856-WP-1-USB%20Power%20delivery%20on%20Raspberry%20Pi%205.pdf); [Raspberry Pi docs](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) (via search summary)
- `PSU_MAX_CURRENT` makes firmware skip USB-PD negotiation and assume the given rating (typically 3000 or 5000). — [Raspberry Pi documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)
- Pi 5 official case fan draws ~60 mA at 5 V and shares the USB peripheral current limit. — [Raspberry Pi documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html)
- Pi 5 power draw (third-party measurements): idle ~2.7–3.6 W, all-core CPU stress ~8.8–9.2 W, extreme (CPU + USB SSD + 4K video) up to ~16 W; soft-off ~1.7 W. Raspberry Pi's own thermal whitepaper cites a 4–5 W minimum. — [raspberry.tips power comparison](https://raspberry.tips/en/raspberrypi-tutorials/raspberry-pi-power-consumption-update-2026-all-models-compared); [Raspberry Pi thermal whitepaper](https://pip-assets.raspberrypi.com/categories/685-app-notes-guides-whitepapers/documents/RP-010139-WP-1-Use-case-specific%20thermal%20performance%20of%20Raspberry%20Pi%20SBCs.pdf)
- Pi 5 undervoltage: a single secondary source states a fixed 4.63 V PMIC threshold, below which ARM cores throttle; `vcgencmd get_throttled` non-zero (e.g. 0x50005) indicates it. Not confirmed in official docs. — [D-Central PiAxe troubleshooting](https://d-central.tech/asic-troubleshooting/piaxe-12v-dc-undervoltage-rpi/)
- Forum note: 5 V @ 5 A must be measured at the Pi end of the cable; poor cables trigger warnings. — [Raspberry Pi forums](https://forums.raspberrypi.com/viewtopic.php?t=357129) (via search summary; anecdotal)
- Pololu D36V50F5: 5 V ±4%, input 5.5–50 V, typical max output 3.5–8 A depending on conditions (5.5 A in the table at 36 V input), 80–95% efficiency, 2–4 mA quiescent, reverse-voltage protection to 40 V, EN pin (<1.2 V off / >1.35 V on), open-drain power-good, 25.4 × 25.4 × 9.5 mm, $39.95 (seen 2026-10-17). — [Pololu D36V50F5 #4091](https://www.pololu.com/product/4091)
- 3S 2200 mAh 25C LiPo (XT60) weights: 168–174 g (±20 g tolerance) across Gens Ace/Tattu and Ovonic listings. — [ReadyMadeRC Gens Ace](https://www.readymaderc.com/products/details/gens-ace-2200mah-3s-lipo-battery), [RotorVillage](https://rotorvillage.ca/tattu-gens-ace-2200mah-3s-25c-11-1v-g-tech-lipo-xt60), [rcdrone Ovonic](https://rcdrone.top/products/ovonic-3s-2200mah-battery)

### Inferences (estimates — not measured)
- **Current budget model** (for a check): `I_peak = Σ_load-bearing (I_rated) + Σ_others (I_noload) + I_5V_rail_input`. For 12 leg servos at 0.9 A + 8 others at 0.18 A ≈ 12.2 A peak; standing quietly maybe 12 × 0.3–0.5 A + 8 × 0.18 ≈ 5–7.5 A (guess). Add Pi 5: 25 W max at 5 V → ÷ (12 V × 0.9 eff) ≈ 2.3 A from the pack; typical 8 W → ~0.75 A.
- **Fuse sizing:** main fuse ≈ 1.25–1.5 × planned peak (e.g. 15–20 A blade/ATC for ~12 A peak); per-branch 3–5 A; 5 V buck input 3 A. Wire: main ≥ 16–18 AWG; servo branches limited by the 5264 leads.
- **Battery runtime:** 3S 2200 mAh at ~5 A average → ~0.4 h × 0.8 usable ≈ 20–25 min; 3S 3000–3500 mAh 18650 pack (3S1P) at 5 A ≈ 30–35 min, but 18650 cells limit discharge to their rated current (typ. 10–20 A for high-drain cells), so a 3S1P 18650 pack may be marginal for 15–20 A transients; 3S2P is safer. A check: `C_rating × Ah ≥ 1.5 × I_peak` and `runtime = 0.8 × Ah / I_avg`.
- **Brownout isolation:** run the Pi from its own buck (not from the servo adapter's 5 V), place a low-ESR bulk capacitor (≈ 1000–2200 µF) at the servo distribution point, share ground at one star point, and configure the Pi 5 with `PSU_MAX_CURRENT=5000`. With a 3S pack the buck has ~4–7 V of headroom even at sag, so servo surges are unlikely to drop the 5 V rail if the buck input is fused separately.
- **Power switch:** switch the high-current path with a rated switch or anti-spark/MOSFET switch sized ≥ main fuse rating; use the D36V50F5 EN pin to sequence the Pi rail.
- 2S vs 3S: for STS-class servos, 3S + 12 V variants (C018/ST3215) halves current per watt vs 2S, and stays in spec at 12.6 V full charge; 2S requires 7.4 V variants whose listed max (C001: 7.4 V) a fresh 2S pack exceeds.

### Gaps
- No measured walking/standing current for a ~20-servo STS humanoid; numbers above are modelled.
- Official Pi 5 undervoltage threshold and Pi 5 weight/dimensions not retrieved from official docs (product brief PDF exceeded fetch limit).
- 18650 pack specific weights/prices not researched.

## 5. IMU, camera, face display, weights and prices

### Takeaway
BNO085/BNO086 breakouts (Adafruit 25.6 × 22.7 × 4.6 mm, 2.5 g, $29.50; SparkFun BNO086 $34.95) give on-chip fusion and are the low-effort choice; ICM-45686 is a raw 6-axis chip with no fusion and no maker breakout found. Pi Camera Module 3 is 25 × 24 × 11.5 mm (12.4 mm wide-angle), from $25. The Waveshare 1.28" GC9A01 round LCD is 240 × 240, Φ32.4 mm active, ~40.4 × 37.5 mm module.

### Cited Findings
- Adafruit BNO085 breakout (PID 4754): 25.6 × 22.7 × 4.6 mm, 2.5 g; onboard regulator, 3.3/5 V logic level shifting; SPI, I2C (STEMMA QT ×2), UART-RVC mode; quaternion rotation vector, linear accel, gravity, step/tap/activity; $29.50 (1–9), $26.55 (10–99), seen 2026-10-17. — [Adafruit 4754](https://www.adafruit.com/product/4754)
- SparkFun BNO086 Qwiic (SEN-22857): $34.95, in stock; I2C/SPI/UART; on-chip fusion; static rotation error ≤ 2°. — [SparkFun BNO086](https://www.sparkfun.com/sparkfun-vr-imu-breakout-bno086-qwiic.html) (via search summary)
- TDK ICM-45686: 6-axis, no on-chip fusion, 220 µA, ±4000 dps / ±32 g, pedometer/tilt/tap/free-fall; 2.5 × 3.0 × 0.81 mm LGA-14; no SparkFun breakout found. — [Mouser ICM-45686](https://www.mouser.ee/new/tdk/tdk-invensense-icm-45686-imu/), [pcbsync](https://pcbsync.com/icm-45686/) (via search summary)
- Waveshare General Driver for Robots already has a QMI8658C + AK09918C 9-axis IMU. — [Waveshare wiki](https://www.waveshare.com/wiki/General_Driver_for_Robots)
- Raspberry Pi Camera Module 3: Sony IMX708, 11.9 MP (4608 × 2592), PDAF autofocus, 75° diagonal FoV (120° wide), 25 × 24 × 11.5 mm (wide 12.4 mm), 15-pin 1 mm FPC, 200 mm ribbon, from $25. Weight not listed. — [Raspberry Pi Camera Module 3](https://www.raspberrypi.com/products/camera-module-3/)
- Waveshare 1.28" round LCD: GC9A01, 240 × 240 IPS, Φ32.4 mm display area, 0.135 mm pixel pitch, 3.3/5 V, 4-wire SPI; module 40.4 × 37.5 mm with Φ37.5 mm listed; touch variant uses CST816S over I2C. — [Waveshare 1.28inch LCD Module](https://www.waveshare.com/1.28inch-lcd-module.htm) (via search summary)

### Mass-budget table (from cited figures)
| Item | Mass | Source |
|---|---|---|
| STS3215 (any variant) | 55 ± 1 g | [OpenELAB](https://openelab.io/products/feetech-sts3215-c018-servo-12v) |
| ST3215-HS | 68 g (low confidence) | [ServoDatabase](https://servodatabase.com/servo/waveshare/st3215-hs) |
| LX-16A | 54 g | [LX-16A manual](https://cdn.robotshop.com/rbm/a5e9ab51-86bc-497b-adac-003de3088fb7/9/92896585-5e83-4c7c-a663-650b81e5978b/67e9729b_lx-16a-serial-bus-servo-user-manual.pdf) |
| SCS0009 | 11–13.2 g (conflicting) | [MakerStore](https://www.makerstore.com.au/?p=144908) |
| STS3032 | 20–28 g (conflicting) | [rcdrone](https://rcdrone.top/products/feetech-scs-sts3032-4-5-kg-servo) |
| BNO085 breakout | 2.5 g | [Adafruit](https://www.adafruit.com/product/4754) |
| 3S 2200 mAh LiPo | 168–174 g | [ReadyMadeRC](https://www.readymaderc.com/products/details/gens-ace-2200mah-3s-lipo-battery) |
| Pi 5, Camera Module 3, GC9A01 module, D36V50F5, bus adapter | not found | — |

### Price references (non-Amazon, seen 2026-10-17)
| Item | Price | Source |
|---|---|---|
| STS3215-C044 (Seeed) | $21.99 (10+: $20.99) | [Seeed](https://www.seeedstudio.com/Feetech-ST-3215-C044-Heavy-Duty-Servo-7-4V-1-191-Gear-Reduction-p-6460.html) |
| STS3215-C001 / C018 (OpenELAB, EU) | €21.89–26.51 | [OpenELAB C018](https://openelab.io/products/feetech-sts3215-c018-servo-12v) |
| STS3215 (Alibaba, per SO-ARM100 BOM) | $13.89 | [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) |
| STS3250-C002 (OpenELAB, EU) | €67.04–72.40 | [OpenELAB STS3250](https://openelab.io/products/feetech-sts3250-c002-servo-12v) |
| Adafruit BNO085 | $29.50 | [Adafruit](https://www.adafruit.com/product/4754) |
| SparkFun BNO086 | $34.95 | [SparkFun](https://www.sparkfun.com/sparkfun-vr-imu-breakout-bno086-qwiic.html) |
| Pi Camera Module 3 | from $25 | [Raspberry Pi](https://www.raspberrypi.com/products/camera-module-3/) |
| Pololu D36V50F5 5 V 5.5 A buck | $39.95 | [Pololu](https://www.pololu.com/product/4091) |

### Inferences
- Electronics mass estimate excluding servos (assumed Pi 5 ≈ 45–50 g without cooler, not sourced): Pi 5 + cooler + camera + IMU + display + buck + adapter + wiring ≈ 150–250 g; plus battery 170 g; plus 20 servos 1.1 kg → ~1.4–1.5 kg before printed structure. For a 2.5 kg target that leaves ~1 kg for frame, horns and fasteners.

### Gaps
- Pi 5 weight/dimensions, Camera Module 3 weight, GC9A01 module weight, LED matrix options (e.g. 8×8 MAX7219 modules), and audio (I2S amp/mic, e.g. MAX98357A) were not researched within the tool budget.
- US prices for the Waveshare Bus Servo Adapter (A), General Driver for Robots, ST3215 and LX-16A from official stores were not captured.
- RobotShop's US STS3215 12 V page appeared in search but its price was not read.
