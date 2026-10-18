# Printed Robot Joints & Structures (A) and Automatic FDM Printability Analysis (B), Bambu Lab P1S, October 2026

Scope note: web research only (about 40 tool calls). Several primary datasheets (Bambu TDS PDFs, the CNC Kitchen insert table image, Ruthex drawings, Molex drawings, the Tweaker whitepaper PDF, the Wade 2023 ACM paper) were blocked (402/403/404) or were images or binary. Where a number could not be confirmed it is listed under Gaps rather than guessed. Items under "Inferences" are engineering reasoning by the researcher, not sourced facts.

---

## A1. Servo joint design (horn attachment, idler bearing, shoulder-bolt axles, keeping loads off the output shaft)

### Takeaway
Credible printed robots never use a servo's output shaft as the only joint axis. They add a second, coaxial support on the opposite side: a twin horn (dual-shaft servos such as the STS3215), or a bearing on a metal shaft or shoulder bolt. They also relocate axes with printed 1:1 gears or linkages, so the servo carries torque, not bending or transverse loads.

### Cited Findings
- ToddlerBot (0.56 m, 3.4 kg, 30 DoF, fully 3D-printed with off-the-shelf motors and bearings) states a design rule: don't use a motor with significant output-shaft free play as the joint axis; add a secondary, supported axis. At the hip yaw, a 1:1 spur gear moves the load to a reinforced secondary axis with planar bearings and metal shafts, "protecting the motor from transverse forces." — [ToddlerBot paper, arXiv 2502.00893](https://arxiv.org/html/2502.00893)
- More ToddlerBot patterns:
  - 1:1 spur gears relocate arm joint axes.
  - The knee uses a parallel linkage so the motor sits higher (less leg inertia).
  - Coupled bevel gears let two motors share torque at the waist.
  - A parallel linkage at the neck pitch puts the motor inside the head.
  - The 3D-printed bevel gears need "precise tolerance tuning for minimal backlash."
  - 3D-printed click-in jigs set each joint's zero point.

  — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- ToddlerBot durability:
  - The robot survived up to 7 falls before a part broke. A repair took about 21 min of printing plus 14 min of assembly.
  - The longest walk without a fall was 19 min, after which motor heating degraded behaviour.
  - Structure and hardware weigh about 1000 g of the 3.4 kg; the 30 motors weigh about 50 g each.

  — [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- ToddlerBot uses Dynamixel XC330, XL430, XC430 and XM430 servos (bundle kit). XM430s drive knee and ankle pitch. — [ROBOTIS ToddlerBot bundle](https://www.robotis.us/toddlerbot-bundle-kit/); [ToddlerBot paper](https://arxiv.org/html/2502.00893)
- A MakerWorld STS3215 arm redesigned its printed parts around Feetech's official STS3215 dimensions: a 36.6 mm front-to-rear metal-horn contact span, 9 mm horn-boss clearance and a 20.7 × 20.5 mm case-screw pattern. Every joint is driven on both sides, with twin plates on the front and rear horns. (Seen in a search snippet; the page returned 403 to direct fetch.) — [MakerWorld model 3421988](https://makerworld.com/en/models/3421988)
- Shoulder bolts vs threaded bolts as axles: a true shoulder bolt's unthreaded section gives a much better bearing surface than threads. Play between a bearing bore and an M3 bolt caused problems, and moving to bearings on a larger shaft stiffened the assembly. (Forum discussion of printer idlers, anecdotal.) — [Duet3D forum](https://forum.duet3d.com/post/135808); [Duet3D forum](https://forum.duet3d.com/post/133407)
- A typical bolt-clamped idler stack: two 623 bearings on an M3 × 12 cap screw with washers and a nut, with the screw head and nut seated in the printed part. — [RepRapPro Fisher idler assembly](https://reprapltd.com/reprappro/documentation/fisher/idler-assembly/index.html)
- Bearing sizes (bore × OD × width):

  | Bearing | Size (mm) | Notes |
  |---|---|---|
  | 608 | 8 × 22 × 7 | Open, shielded and sealed variants exist. [Misumi](https://us.misumi-ec.com/blog/ball-bearings/miniature/608-ball-bearings-8x22x7mm-z-zz-2rs) |
  | 688A | 8 × 16 × 4 | [Misumi 688A](https://jp.misumi-ec.com/vona2/detail/221000531116/) |
  | 685 (NSK 685MC5) | 5 × 11 × 3 | Some sources call 5 × 11 × 5 the common shielded width. [NSK 685MC5](https://www.nsk.com/engineering/685mc5-apn.html); [YoYoExpert forum](https://forums.yoyoexpert.com/t/d-bearings-why/343616/90) |
  | MR85 (NSK MR85MC5) | 5 × 8 × 2 | A shielded MR85A-ZZS variant is 2.5 mm wide. [NSK MR85MC5](https://www.oss.nsk.com/mr85mc5-apn.html); [MBA MR85A-ZZS-MC3](https://minibearings.com.au/products/5x8x2-5-bearings-mr85azzsmc3) |

- STS3215 thermal limits:
  - Torque is disabled above 70 °C, and the rated operating range is −20 °C to 60 °C.
  - Overload protection trips when stall torque exceeds 80% of the stall value for 2 s.
  - The case is PA+GF.

  — [STS3215 datasheet (translated, Core Electronics)](https://core-electronics.com.au/attachments/uploads/sts3215-smart-servo-datasheet-translated.pdf); [DFRobot ST3215](https://www.dfrobot.com/product-2962.html)
- A servo within rated specs typically reaches a 60–65 °C surface temperature, and above 75 °C it is overheating. (Secondary source.) — [Kpower insight](https://www.kpower.com/insight_gearbox/7512.html)

### Inferences
- **Joint checklist (per servo joint):**
  - **Driven side:** fix the horn to the link with all of the horn's screw holes (typically 4× M2–M3 on a metal horn) plus the center screw.
  - **Opposite side:** put a coaxial support there, either the servo's rear idler horn (STS3215, Dynamixel XL430 and XM430 have one) or a bearing on a shoulder bolt aligned with the output axis.
  - **Load path:** the bending moment from the link should flow through the bracket into both supports, never only through the output spline.
  - **Acceptance test:** coaxiality of the horn axis and the idler axis within the bearing's radial play.
- **Bearing choice by scale:**
  - MR85 / 685 (5 mm bore) for small arms and necks at XL330 / SG90 scale.
  - 688 or 608 (8 mm bore, shoulder bolt or 8 mm pin) for leg pitch joints of a 0.5–1 m humanoid.
  - Flanged variants locate axially without a printed shoulder.
- **Fits around metal:** bearing seats as press fits in printed bosses (see A4 for clearances). Clamped split bosses with a screw are more forgiving than pure press fits, because FDM hole size varies by about 0.2–0.3 mm (see A2).
- **Material near servos:** the servo can sit at 60–70 °C, which is above PLA Basic's HDT of 54 °C at 1.8 MPa (A3). So a PLA bracket clamped against a hot servo case under load is at risk of creep. Use PETG-CF, ASA or PA-CF for brackets touching servo cases.

### Gaps
- No official drawings were found for horn screw patterns or spline tooth counts (Feetech 25T, Dynamixel horn patterns). The MakerWorld page was blocked.
- No primary source compares metal vs plastic horns quantitatively.
- Berkeley Humanoid Lite and Open Duck docs were not reached within the budget.
- No source gave the 625 bearing dimensions.

---

## A2. Fasteners in printed parts (heat-set inserts, bosses, self-tapping, nut traps)

### Takeaway
For M3 heat-set inserts, design the hole at about 4.0 mm nominal (manufacturer). CNC Kitchen's 2026 tests show printed holes come out about 0.25 mm undersized, so model 4.1–4.2 mm and calibrate. Make blind holes about 1 mm deeper than the insert. Install at 10–20 °C above print temperature. M3 pull-out strength in PLA is about 1,400 N.

### Cited Findings
- **CNC Kitchen pull-out tests** (2026-03-28; Prusa CORE One L, PolySonic PLA, about 50 M3 inserts, holes 3.6–4.6 mm, iron at 240 °C):
  - Printed holes measured about 0.25 mm smaller than in CAD.
  - Small holes held about 1,400 N on average.
  - At a 4.2 mm CAD hole the insert holds about 90% of the maximum. In drilled holes, strength drops sharply between 4.1 and 4.2 mm.
  - Below 4.0 mm, as-printed holes leave a severe burr; 4.2 mm is a nearly ideal fit.
  - For smaller inserts, add about 0.2–0.3 mm to the CAD hole diameter.
  - The M3 packaging nominal of 4.0 mm is kept as the baseline.

  — [CNC Kitchen, "Are Our Heat-Set Insert Datasheets Wrong?"](https://www.cnckitchen.com/blog/are-our-heat-set-insert-datasheets-wrong)
- **CNC Kitchen installation tips:**
  - Iron 10–20 °C above print temperature: about 225 °C for PLA, 245 °C for PETG, 265 °C for ABS.
  - Melt the insert in to about 90% of its depth, then press flush with a flat tool.
  - Blind holes about 1 mm deeper than the insert; through holes no longer than the insert.
  - Holes straight, not tapered; a chamfer isn't needed.
  - Horizontal holes may print slightly smaller at the top.
  - Test parts cover M1.6–M10 (M3 at 4.0–4.4 mm).
  - Minimum wall thickness is shown only in an image, so the number wasn't extracted.

  — [CNC Kitchen tips & tricks](https://www.cnckitchen.com/blog/tips-and-tricks-for-heat-set-inserts)
- **CNC Kitchen insert lengths:**
  - M2 × 3.0, M2.5 × 4, M3 × 5.7 (standard) and M3 × 3.0 (short), M4 × 8.1 / 4.0, M5 × 9.5 / 5.8, M6 × 12.7 / 6.8, M8 × 12.7 / 6.8, M10 × 12.7 mm.

  — [CNC Kitchen store](https://cnckitchen.store/products/heat-set-insert-m3-x-5-7-100-pieces)
- **CNC Kitchen hole diameters, per a reseller** (not the official table):

  | Insert | Hole (mm) |
  |---|---|
  | M2 × 3 | 3.2 |
  | M2.5 × 4 | 4.0 |
  | M3 × 3 | 4.0 |
  | M3 × 4 | 4.4 |
  | M4 × 4 | 5.6 |
  | M5 × 5.8 | 6.4 |
  | M6 × 6.8 | 8.0 |
  | M8 × 6.8 | 9.7 |

  — [KB-3D listing](https://kb-3d.com/store/inserts-fasteners-adhesives/927-cnckitchen-lead-cadmium-free-heat-set-inserts-multiple-sizes-metric.html)
- Wall rule of thumb: at least 1.6 mm of wall around an insert hole, and a hole depth at least 1 mm longer than the insert. — [DigiKey FreeCAD tutorial](https://www.digikey.com/en/maker/tutorials/2025/intro-to-freecad-part-4-how-to-use-heat-set-inserts)
- **Industrial inserts for comparison:**
  - Standard Inserts IUTB-M3: hole Ø 4.01 mm (+0.08), minimum depth 6.5 mm. — [Heilind IUTB-M3](https://heilind.com/stdiutb-m3.html)
  - JLC3DP printed-part guidance:
    - M3 × 4 × 3 insert (OD 4.0): hole Ø 3.6, depth 5.0.
    - M3 × 4 × 5 insert: hole Ø 3.6, depth 7.0.

    — [JLC3DP threaded insert service](https://jlc3dp.com/help/article/threaded-insert-service)
  - A Ruthex M3 × 5.7 insert has a 4.6 mm OD (retailer listing). — [Grobotronics](https://grobotronics.com/ruthex-threaded-insert-m3-pack-of-70.html?sl=en)
- **M3 fastening comparison** (CNC Kitchen, via a secondary write-up):
  - Pull-out: a direct screw, a heat-set insert and a Helicoil all failed at about 120 kg.
  - Torque-out: the heat-set insert was best at about 3 Nm; Helicoil and direct screws were worst.

  — [Embedded Computing, "3D Printed Fasteners Part 1"](https://embeddedcomputing.com/application/industrial/machine-vision/3d-printed-fasteners-part-1-inserts)

### Inferences
- **Acceptance rules for an insert boss:**
  - Hole diameter = nominal + printer offset (default +0.2 mm on a P1S, then calibrate).
  - Hole depth ≥ insert length + 1 mm.
  - Boss OD ≥ hole Ø + 2 × 1.6 mm (M3: about 7.4 mm).
  - Insert axis preferably along Z (hole in the XY plane), so the knurls engage perimeters, not layer seams.
  - Through-bolting across layer lines (a bolt clamping layers together) turns weak interlayer tension into compression. Prefer it for highly loaded joints.
- Use self-tapping screws for low-cycle covers. Use inserts where the part is opened often or needs torque above about 1–2 Nm, given the torque-out ranking above.

### Gaps
- Not obtained: official Ruthex / CNC Kitchen / PEM hole-diameter and minimum-wall tables (image-only or blocked), self-tap pilot diameters (e.g. M3 into PLA, 2.5–2.8 mm commonly quoted but unsourced here), nut-trap dimensions, and minimum thread engagement for direct screws.

---

## A3. Strength: orientation and anisotropy, walls vs infill, materials and heat, TPU

### Takeaway
Layer bonds (Z) are the weak direction: about 56–84% of XY strength depending on material and study, with PETG showing the largest gap in one study. Perimeters add strength more efficiently than infill. PLA's HDT (54 °C) is at or below a working servo's case temperature (60–70 °C), so use PETG / ASA / PA-CF near servos.

### Cited Findings
- **CSUS study, ASTM D638:** X-built tensile strength exceeded Z-built by 24.6% for PLA, 42% for ABS and 127.9% for PETG. That puts Z at about 80% / 70% / 44% of X (the researcher's arithmetic). Z specimens failed in a brittle manner from poor interlayer bonding. — [CSUS thesis](https://scholars.csus.edu/esploro/outputs/graduate/Mechanical-and-FEA-comparison-of-FDM/99258311232901671)
- **Shapeways PETG (ISO 527):** 50.8 MPa in XY vs 42.8 MPa in Z (84%); elongation 8.4% vs 3.3%. — [Shapeways PETG](https://www.shapeways.com/materials/fdm-petg)
- **Bambu PAHT-CF TDS V2.0:** tensile 88 ± 7 MPa in XY vs 64 ± 3 MPa in Z, dry (73%). — [Bambu PAHT-CF TDS](https://www.solidprint3d.co.uk/wp-content/uploads/2023/08/Bambu-PAHT-CF_Technical-Data-Sheet.pdf)
- **Heat deflection temperatures (Bambu TDS values, via search extracts):**

  | Material | HDT at 1.8 MPa | HDT at 0.45 MPa |
  |---|---|---|
  | PLA Basic | 54 °C | 57 °C |
  | PETG-CF | 68 °C | — |
  | ASA-CF | 102 °C | 110 °C |
  | PC | 108–117 °C | — |
  | PAHT-CF | — | up to 194 °C (retailer claim, unverified) |

  — [Bambu PLA Basic TDS](https://wiki.bambulab.com/filament-acc/abs-asa-pc/bambu_pla_basic_technical_data_sheet.pdf); [Bambu PETG-CF TDS](https://get3d.pl/wp-content/uploads/2023/10/Bambu_PETG-CF_Technical_Data_Sheet_V2.pdf); [Bambu ASA-CF manual](https://device.report/manual/15698189); [Bambu PC TDS](https://wiki.bambulab.com/filament-acc/abs-asa-pc/a52afdccddfd448583d119587122c8c5.pdf); [3D Universe PAHT-CF](https://shop3duniverse.com/products/bambu-lab-paht-cf-high-temperature-nylon-carbon-fiber-1-75mm-black)
- **Walls vs infill:**
  - Forum summaries of CNC Kitchen's tests say more perimeters give more strength than infill for the same plastic weight, with best results reported around 5–6 perimeters. (Secondhand; the primary video wasn't fetched.) — [Prusa forum](https://forum.prusa3d.com/forum/english-forum-general-discussion-announcements-and-releases/suggestions-for-sand-casting-patterns); [V1E forum](https://forum.v1e.com/t/printed-parts-slic3r-gyroid-infill-to-lower-infill/7610)
  - HackSpace bar test: extra perimeters barely raised stiffness but increased deflection before break. About 0.25 m of extra filament as perimeters raised the failure load by 1 kg. — [HackSpace magazine](https://hackspace.raspberrypi.com/articles/experiments-with-strong-3d-prints)
- **Snap fits:**
  - Build the cantilever in the XY plane, and cut allowable stress and strain by 50% for Z-axis cantilevers.
  - Allowable strain: PLA 4–8%, ABS 7%, nylon 4–15%.
  - Strain = σ / E.

  — [Fictiv snap-fit guide](https://www.fictiv.com/articles/how-to-design-snap-fit-components)

### Inferences
- **Per-part rules:**
  - Orient so the principal bending stress runs along layers (XY), never peeling layers apart.
  - Structural links: at least 4 walls (about 1.7–1.8 mm at 0.42–0.45 mm lines) and 3–5 top/bottom layers.
  - Infill 15–40% gyroid or grid. Raise wall count before infill.
- **Servo-contact parts:** HDT at 1.8 MPa must be at least 70 °C (the servo cutoff). That excludes PLA and puts PETG-CF borderline; ASA, PC and PA-CF pass.
- **Cantilever snap-fit check:** max strain ε = 1.5·t·y / L² (standard rectangular-cantilever formula, not sourced here) must be ≤ 2–4% for PLA, i.e. half of Fictiv's lower bound as a safety factor.

### Gaps
- Not obtained: CNC Kitchen's primary wall/infill numbers, ASA and PETG HF datasheet HDTs, PLA Basic Z-tensile, creep data, TPU 95A Shore hardness or infill for feet (Bambu TPU 95A HF profile seen; Shore value not extracted), and measured servo case temperatures in robots.

---

## A4. Tolerances on a Bambu P1S-class printer (fits, holes, elephant foot, bridges, overhangs, walls)

### Takeaway
Bambu's stock P1S profile uses 0.42 mm outer walls and 0.45 mm inner walls, 2 wall loops, 0.2 mm layers, a 30° support threshold, and zero hole, contour and elephant-foot compensation. Fits must therefore come from CAD offsets: about 0.2 mm for sliding, at least 0.3 mm for moving parts, holes +0.2–0.3 mm. The printable overhang limit is about 45–60° from vertical.

### Cited Findings
- **BambuStudio base process profile** (`fdm_process_common.json`):
  - Line widths: `line_width` 0.42, `outer_wall_line_width` 0.42, `inner_wall_line_width` 0.45.
  - Walls and shells: `wall_loops` 2, top and bottom shell layers 3, `top_shell_thickness` 0.8.
  - Infill: `sparse_infill_density` 15%, pattern grid.
  - Compensation: `elefant_foot_compensation`, `xy_hole_compensation` and `xy_contour_compensation` all 0.
  - Supports and bridges: `support_threshold_angle` 30, `bridge_flow` 0.95, `max_bridge_length` 0.
  - Layers: `layer_height` 0.2, `initial_layer_print_height` 0.2.

  — [BambuStudio fdm_process_common.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/fdm_process_common.json)
- **"0.20mm Standard @BBL X1C"** (its compatible printers include "Bambu Lab P1S 0.4 nozzle"):
  - Speeds (mm/s):

    | Feature | Speed |
    |---|---|
    | Outer wall | 200 |
    | Inner wall | 300 |
    | Sparse infill | 270 |
    | Internal solid infill | 250 |
    | Top surface | 200 |
    | Gap fill | 250 |
    | Bridge | 50 |
    | Support | 150 |
    | Travel | 500 |
    | First layer | 50 |

  - Small perimeters run at 50%.
  - Accelerations (mm/s²): default 10,000, outer wall 5,000, top surface 2,000, first layer 500.
  - Each field has a second value for a High Flow extruder variant (e.g. outer wall 350).

  — [BambuStudio 0.20mm Standard @BBL X1C.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/0.20mm%20Standard%20%40BBL%20X1C.json)
- **Prusa KB:**
  - Overhangs of 45–60° print cleanly; printers with 360° cooling manage up to 75°.
  - Wall thickness: 1 perimeter ≈ 0.45 mm, 2 ≈ 0.9, 3 ≈ 1.35, 4 ≈ 1.8. Walls thinner than one perimeter, and those between one and two, are marked not printable.
  - Accuracy at least 0.2 mm; moving parts start at 0.3 mm or more clearance.
  - Use chamfers rather than fillets on bottom edges.
  - No maximum bridge length is given.

  — [Prusa KB, Modeling with 3D printing in mind](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135)
- **Fit guides (conflicting conventions):**
  - Slip fit 0.20 mm (M3 hole printed at Ø 3.2).
  - Sliding 0.2–0.3 mm per side.
  - Press fit −0.05 to 0 mm, or 0.05–0.15 mm per side, or shaft 0.1–0.2 mm larger than the hole.
  - 0.5 mm chamfer on the bottom of press-fit parts against elephant foot.

  — [PrintPal design guide](https://printpal.io/docs/3d-printing-design-guide); [Zbotic tolerances](https://zbotic.in/3d-printing-tolerances-designing-gaps-for-press-fits-threads-and-snap-fits/); [Sovol tolerances](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit)
- Printed holes come out about 0.25 mm undersized (CNC Kitchen, PLA on a CORE One L). — [CNC Kitchen](https://www.cnckitchen.com/blog/are-our-heat-set-insert-datasheets-wrong)

### Inferences
- **Default CAD offsets for the studio's checker (P1S, 0.4 nozzle, stock profile):**
  - Holes: +0.2 mm on diameter.
  - Sliding or rotating fit: 0.2–0.3 mm diametral; 0.3 mm or more for print-in-place.
  - Bearing press fit: 0 to +0.1 mm on the hole diameter (calibrate).
  - Bottom-edge chamfer: 0.4–0.5 mm.
- **Minimum features:**
  - Walls ≥ 0.84 mm (2 lines), and ≥ 1.7 mm for structural walls (4 lines).
  - Pins ≥ 2 mm diameter.
  - Overhang test: Bambu's `support_threshold_angle` of 30 is read here as degrees from horizontal (not verified from Bambu docs). A downward face is then an overhang when its surface makes less than 30° with the bed, i.e. its normal satisfies n.z < −sin(30°) = −0.5 (see B1/B2 sign conventions).
- **Bridges:** no sourced maximum. Use 10–20 mm as a soft warning threshold until calibrated.

### Gaps
- Not obtained: Bambu wiki tolerance and bridge guidance, measured elephant foot on a P1S, and the actual wall loops and compensation in `fdm_process_single_0.20.json` (an intermediate profile, not fetched; it may override the common values).

---

## A5. Cable routing through joints (5264 servo cables)

### Takeaway
Only partial dimension data was found. Molex 5264 (SPOX-type, 2.5 mm pitch) housings are about 12.4 × 3.9 mm (4-way) and 17.4 × 8 mm (6-way). The two width figures conflict, so check the Molex drawing.

### Cited Findings
- Molex 50-37-5043 (4-way): 12.4 mm long, 3.9 mm wide, 2.5 mm pitch. Mates with 5267 vertical and 5268 right-angle headers. — [Distrelec 50-37-5043](https://www.distrelec.be/en/housing-receptacle-pitch-mm-poles-rows-polyamide-pack-of-10-pieces-molex-50-37-5043/p/30445556)
- Molex 50-37-5063 (6-way): 17.4 mm long, 8 mm wide; the series spans 2–12 positions. — [RS 50-37-5063](https://uk.rs-online.com/web/p/wire-housings-plugs/6878004)

### Inferences
- Length grows about 2.5 mm per position, so a 3-way housing is about 9.9 × 4 mm (extrapolated).
- A channel that passes the connector needs at least 11 × 5.5 mm (0.5 mm clearance each side plus a printing allowance).
- Joint rule: route cables through or near the rotation axis, leave a service loop of at least 1.5 × the joint's arc length, and add a strain-relief clip within 20 mm of each servo exit. These are engineering norms, not sourced numbers.

### Gaps
- No sourced numbers for: the 3-way housing, Feetech or Dynamixel cable OD, bend radius, or printed strain-relief design rules.

---

## A6. Professional-looking printed shells (split lines, reveals, fillets, snap covers, magnets, support-free)

### Takeaway
Little primary data. Sourced guidance:
- Prefer chamfers over fillets on bottom edges.
- Keep mating surfaces support-free.
- Put snap cantilevers in XY.
- Hinges and moving parts need at least 0.3 mm clearance.

### Cited Findings
- Fillets on bottom faces create steep overhangs; use chamfers. Chamfer the edges of slotting parts for easier assembly. — [Prusa KB](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135)
- Avoid supports on mating surfaces, since support scars ruin tight fits. — [Sovol tolerances](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit)
- Snap fits: cantilever in XY, 50% derate in Z. — [Fictiv](https://www.fictiv.com/articles/how-to-design-snap-fit-components)

### Inferences
- **Shell checklist:**
  - Split covers on a plane that becomes the print bed for both halves, so neither half needs supports.
  - Put the split line on a crease or reveal (a 0.4–0.5 mm reveal gap, about one line width, hides FDM mismatch).
  - Place the seam on the inside or a sharp corner (Bambu's seam placement).
  - Size magnet pockets at magnet Ø + 0.2 mm, pausing the print or press-fitting.
- The requested 0.3–0.5 mm reveal is plausible against the 0.2–0.3 mm FDM accuracy above, but not sourced.

### Gaps
- No primary industrial-design source was found for reveal widths, recommended shell fillet radii, or magnet attachment.

---

## B1. Print orientation optimization (Tweaker-3, OrcaSlicer / BambuStudio auto-orient)

### Takeaway
Orca's (and Bambu's) `Orient.cpp` is a re-tuned port of Tweaker-3's approach, with the same parameter names and the same min-volume constants. It:
1. collects about 10–40 candidate "down" directions from area-weighted face normals, convex-hull normals and 18 fixed supplements;
2. scores each in O(F) with a closed-form "unprintability" ratio of overhang to bottom contact;
3. picks the minimum.

The total cost is O(K·F) with K ≈ 30–40, easy to run in TypeScript over a three.js `BufferGeometry`.

### Cited Findings
- **Tweaker-3** (Schranz, GPL-3.0): parameters were "trained by an evolutionary algorithm". The default objective minimizes volume, `-min sur` minimizes support surface instead, and `-x` (extended) is the most reliable mode. Whitepaper: ResearchGate 311765131. — [Tweaker-3 GitHub](https://github.com/ChristophSchranz/Tweaker-3)
- **Tweaker-3 `MeshTweaker.py`:**
  - Faces are stored with the normal, vertices, min/max/median z and area. Faces below `NEGL_FACE_SIZE` are dropped when there are more than 100 faces.
  - **Candidates:**
    - `area_cumulation(10)`: the 10 most common normals, weighted by area.
    - `death_star(12)` (extended mode): random vertex triples give cross-product normals. `iterations = ceil(20000/(mesh_len+100))`.
    - `add_supplements()`: 18 fixed directions.
    - `remove_duplicates()`: drops candidates within 5°.
  - **Evaluation per orientation:**
    - Bottom area = Σ area of faces whose max projection < min + `FIRST_LAY_H`.
    - Overhang = 2·Σ area·|min(n·o − ASCENT, 0)|² over faces above the first layer (default mode). Extended mode subtracts `PLAFOND_ADV`·(area of faces pointing exactly down).
    - Contour = 4·√bottom (default), or the summed bottom-edge length (extended).
    - Unprintability = TAR_A·(overhang + TAR_B) + RELATIVE_F·(overhang + TAR_C) / (TAR_D + CONTOUR_F·contour + BOTTOM_F·bottom).
    - A score above 10 suggests supports are needed.
  - Defaults: TAR_A 0.02325, TAR_B 0.1797, RELATIVE_F 11.25, CONTOUR_F 0.2195, BOTTOM_F 1.321, TAR_C −0.01656, TAR_D 1.059, FIRST_LAY_H 0.04755, ASCENT −0.0781, NEGL_FACE_SIZE 0.4737.
  - The rotation comes from Rodrigues' formula with axis (−y, x, 0) and φ = π − arccos(−z).

  — [Tweaker-3 MeshTweaker.py](https://raw.githubusercontent.com/ChristophSchranz/Tweaker-3/master/MeshTweaker.py)
- **OrcaSlicer `Orient.cpp`:**
  - **Candidates:** the original (0,0,−1), the top 10 area-weighted normals, the top 14 convex-hull normals and 18 supplements, minus duplicates.
  - **Features:**
    - overhang (optionally height-weighted, with a ×`APPERANCE_FACE_SUPP` penalty on appearance faces);
    - bottom (faces under `FIRST_LAY_H` at half weight, under `FIRST_LAY_H/2` at full weight);
    - bottom convex-hull area;
    - contour = 4√bottom;
    - low-angle-face area `area_laf`, for near-vertical faces between `LAF_MIN` and `LAF_MAX`;
    - an optional cooling-direction search.
  - **Cost:** TAR_A·(ov + TAR_B) + RELATIVE_F·(ov·TAR_C + TAR_D + TAR_LAF·area_laf) / (TAR_D + CONTOUR_F·contour + BOTTOM_F·bottom + BOTTOM_HULL_F·bottom_hull + TAR_E·ov + TAR_PROJ_AREA·area_proj), plus 100 if bottom < `BOTTOM_MIN`.
  - The threshold is per object: `ASCENT = cos(π − overhang_angle·π/180)`.
  - Ties prefer the original upright orientation.

  — [OrcaSlicer Orient.cpp](https://github.com/SoftFever/OrcaSlicer/blob/main/src/libslic3r/Orient.cpp)
- **OrcaSlicer `Orient.hpp` constants:**
  - TAR_A 0.01, TAR_B 0.177, RELATIVE_F 6.6106, CONTOUR_F 0.23229, BOTTOM_F 1.16715, BOTTOM_HULL_F 0.1, TAR_C 0.24308, TAR_D 0.62845, TAR_E 0.
  - FIRST_LAY_H 0.2, NEGL_FACE_SIZE 0.1, ASCENT −0.5.
  - LAF_MIN 0.9703 (cos 14°), LAF_MAX 0.999, TAR_LAF 0.01, TAR_PROJ_AREA 0.1.
  - BOTTOM_MIN 0.1, BOTTOM_MAX 2000, APPERANCE_FACE_SUPP 3.
  - overhang_angle 60 (in `OrientParams`); 30 in `OrientMesh`.
  - The header doesn't mention Tweaker, but RELATIVE_F, CONTOUR_F, BOTTOM_F, TAR_C, TAR_D, VECTOR_TOL, PLAFOND_ADV, CONTOUR_AMOUNT, OV_H and the height_* constants equal Tweaker-3's `PARAMETER_VOL` set.

  — [OrcaSlicer Orient.hpp](https://raw.githubusercontent.com/SoftFever/OrcaSlicer/main/src/libslic3r/Orient.hpp); compare [MeshTweaker.py](https://raw.githubusercontent.com/ChristophSchranz/Tweaker-3/master/MeshTweaker.py)

### Inferences
- Lineage: the identical parameter values strongly indicate Orca/Bambu `Orient.cpp` derives from Tweaker-3's min-volume parameter set. This is inferred from the matching numbers; no source states it.
- TypeScript pseudo-code (three.js; o = unit "down" candidate, n = face normal, A = face area):

```ts
// Candidates: area-weighted normal histogram (quantize to 1e-3), top 10; convex hull normals, top 14;
// plus 18 supplements (±X, ±Y, ±Z, 12 × 45° diagonals); dedupe within 5°.
function score(o: Vec3, faces: Face[], p = ORCA): number {
  // Project vertices on o (height = -dot(v, o) for a "down" vector o)
  const zmin = min over vertices of h(v)
  let bottom = 0, overhang = 0, laf = 0
  for (const f of faces) {
    const hmax = max(h(f.v0), h(f.v1), h(f.v2))
    const c = dot(f.n, o)                       // +1 = facing straight down
    if (hmax < zmin + p.FIRST_LAY_H) { bottom += f.A; continue }
    // ASCENT = cos(pi - overhangAngle) = -cos(overhangAngle)
    const d = dot(f.n, neg(o)) - p.ASCENT       // < 0  => an overhang beyond the threshold
    if (d < 0) overhang += 2 * f.A * d * d      // Tweaker default-mode quadratic weight
    else if (-c > p.LAF_MIN && -c < p.LAF_MAX) laf += f.A
  }
  const contour = 4 * Math.sqrt(bottom)
  let cost = p.RELATIVE_F * (overhang * p.TAR_C + p.TAR_D + p.TAR_LAF * laf) /
             (p.TAR_D + p.CONTOUR_F * contour + p.BOTTOM_F * bottom)
  if (bottom < p.BOTTOM_MIN) cost += 100
  return cost
}
```

  Sign conventions differ between Tweaker (inner(n, orientation) < ASCENT) and Orca. Verify against a cube (6 equal candidates) and a mushroom (cap-down wins) in unit tests.
- **Robot-specific objective extension:** add a term penalizing orientations where the part's principal load direction is parallel to Z. The load axis comes from the joint frame (servo axis, link axis). That term would be the studio's addition; slicers don't model loads.

### Gaps
- The Tweaker whitepaper PDF and benchmarks weren't read (ResearchGate).
- No BambuStudio-specific `Orient.cpp` diff was checked. Orca forked from Bambu Studio, so they're likely the same, but this wasn't verified.
- No runtime numbers were found.

---

## B2. Support volume and area estimation; bridging detection

### Takeaway
The standard fast estimate sums, over each overhanging facet, its projected XY area times its height above whatever lies below:

V ≈ Σ A_xy,i · h_i

where h_i is found by ray-casting straight down from the facet to the bed or to the part. This is the prism method (Morgan et al. 2016). Grid or rasterized top-surface methods (Ezair et al. 2015) are faster and handle self-support.

### Cited Findings
- Support volume V = Σ A_i·h_i over n downward-facing facets below the inclination threshold, where A_i is the facet's horizontal projected area and h_i its average support height. — [SlideShare, Part Orientation & Support](https://www.slideshare.net/slideshow/part-orientation-support-structures/250774008)
- The more accurate 3D method builds prisms between the build surface and the overhanging facets (Morgan et al. 2016). Simpler methods use overhang surface area, and Ezair et al. use GPU rasterization. — [Wade et al. 2023 preprint, ACM DOI 10.1145/3623263.3623360](https://matterassembly.org/assets/pdf/preprints/2023_Wade_Orientation.pdf) (as summarized in search results; the PDF body was not readable)
- Ezair et al.: sample the model's top surface on a grid. Support volume = volume under that surface − part volume. Per-facet summation is differentiable, so gradient descent can minimize it over orientation. — [TU Delft thesis](https://repository.tudelft.nl/file/File_785427bb-7142-4ec2-bc62-de897b7145b2)
- Support area alone is "relatively inaccurate", and early precise methods ignored internal overhangs (support resting on the part). — [Springer, Int J Adv Manuf Technol 2024](https://link.springer.com/article/10.1007/s00170-024-14039-z)
- Bambu default `support_threshold_angle` = 30 (degrees from horizontal), and bridges print at 25 mm/s (common) or 50 mm/s (X1C/P1S Standard). — [BambuStudio fdm_process_common.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/fdm_process_common.json); [0.20mm Standard @BBL X1C.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/0.20mm%20Standard%20%40BBL%20X1C.json)

### Inferences
- Prism-method pseudo-code with three-mesh-bvh:

```ts
// faces in print orientation (Z up). thr = 30° from horizontal -> overhang if n.z < -sin(thr)
for each face f with f.n.z < -Math.sin(thrRad):
  Axy = f.area * Math.abs(f.n.z)                      // projected footprint
  c   = centroid(f) - eps * up                        // nudge off the surface
  hit = bvh.raycastFirst(new Ray(c, DOWN))            // three-mesh-bvh
  h   = hit ? c.z - hit.point.z : c.z - bedZ          // lands on the part or the bed
  V  += Axy * h
  if (hit) internalSupportArea += Axy                 // will leave scars on the part
supportMass ≈ V * supportDensity (~0.15–0.25 of solid; inferred) * ρ
```

  For accuracy on large facets, subdivide or sample several points per facet. Clamp self-shadowing by checking whether the ray hits the same face.
- **Bridge detection:**
  1. Cluster connected downward-facing horizontal facets (n.z < −0.98).
  2. For each cluster, check whether both ends of its shortest span rest on material directly below at the same z (ray-cast down from the cluster boundary edges).
  3. If so, it's a bridge with span = the shortest XY distance between the supported edges; flag spans over about 10–20 mm (no sourced limit).
  4. Otherwise it's an overhang needing support.
- Overhangs in the 45–60° band are printable without support per Prusa. So the studio might use Bambu's 30° for "needs support" and 45° for "quality warning".

### Gaps
- The Morgan 2016 and Ezair 2015 papers weren't read directly, so their error vs slicer support was not found.
- No quantified accuracy of the prism estimate vs Bambu Studio's tree-support volume.

---

## B3. Thin-wall and minimum-feature detection

### Takeaway
Use the Shape Diameter Function (Shapira, Shamir & Cohen-Or 2008): from each surface point, cast several rays inside a cone around the inward normal and take a robust average of the hit distances. Faces whose SDF thickness is below 2 line widths (0.84 mm) are thin walls. libigl ships an implementation (in Orca's source tree too); three-mesh-bvh makes it fast in TypeScript.

### Cited Findings
- SDF is from "Consistent mesh partitioning and skeletonisation using the shape diameter function", The Visual Computer 24(4):249–259, 2008. Rays are cast inside a cone centered on the inward normal, and the intersection distances are averaged statistically. — [Fast and robust SDF (PLoS ONE 2018, PMC5786294)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5786294/)
- libigl's `shape_diameter_function` uses a 180° cone and a uniform average. It returns about the bounding-box diagonal for a sphere and about 0 for needle-like features. It is vendored in OrcaSlicer's tree. — [libigl shape_diameter_function.h (Orca mirror)](https://git.trueserve.org/PublicCodeMirror/OrcaSlicer-bambulab/src/commit/9bbda55bb4ecc300230810b6ba366abd7531d30d/src/libigl/igl/shape_diameter_function.h)
- In narrow bottlenecks only a minority of cone rays hit, which biases a plain average. Epsilon-shapes (arXiv 1704.08049) is an alternative that detects and thickens thin features. — [Epsilon-shapes, arXiv 1704.08049](https://arxiv.org/pdf/1704.08049); [PMC5786294](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5786294/)
- Printability thresholds: below one perimeter (about 0.45 mm) is not printable, and between one and two perimeters is also flagged. — [Prusa KB](https://help.prusa3d.com/article/modeling-with-3d-printing-in-mind_164135)

### Inferences
- TypeScript pseudo-code:

```ts
for each face f (or vertex):
  p = centroid(f) - n*1e-4; dists = []
  for k in 0..K (K=16–30, cone half-angle 60° per Shapira; libigl uses 180°):
    d = sampleCone(-n, 60°); hit = bvh.raycastFirst(ray(p, d))
    if (hit && dot(hit.faceNormal, d) > 0) dists.push(hit.distance * dot(d, -n)) // project onto normal
  sdf = median(dists) // or weighted mean within ±1σ of the median, per Shapira
  if (sdf < 2*0.42) flag thinWall(f, sdf)           // < 0.84 mm: fewer than 2 walls
  if (sdf < 0.42)   flag unprintable(f)
```

- Add a per-layer 2D check to catch fins thin in XY but tall: slice at z steps, then for each contour compute inward offset −0.42 mm. A region that vanishes is thinner than 2 lines. Clipper-js offset is equivalent to the slicer's own logic.
- Minimum feature (pins, posts): area of an XY slice under π·(1 mm)² → warn.

### Gaps
- No sourced recommended ray count or cone angle for printability use. Shapira's original cone angle (often cited as 120°) wasn't confirmed from the paper itself.

---

## B4. Bed-fit check for a Bambu Lab P1S

### Takeaway
BambuStudio's official profiles give a P1S printable area of 256 × 256 mm (`0x0–256x256`) and `printable_height` 250 mm, inherited from `fdm_machine_common`; marketing says 256 mm. The P1S 0.4 nozzle profile adds `bed_exclude_area` = rectangle `0x0, 18x0, 18x28, 0x28`, an 18 × 28 mm zone at the bed origin. The shared BBL common profile has a larger L-shaped exclusion (28 × 28 plus an 8 mm strip along x = 0–8, y = 0–256), which the P1S profile overrides.

### Cited Findings
- **`Bambu Lab P1S 0.4 nozzle.json`:**
  - `inherits` `fdm_bbl_3dp_001_common`.
  - `bed_exclude_area` ["0x0","18x0","18x28","0x28"].
  - `nozzle_diameter` 0.4.
  - Max acceleration X/Y 20000; extruding 20000; travel 9000; Z 500; retract and E 5000.
  - Max speed X/Y 500, Z 20, E 30; jerk X/Y 9, Z 3, E 2.5.

  — [BambuStudio P1S profile](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/machine/Bambu%20Lab%20P1S%200.4%20nozzle.json)
- **`fdm_bbl_3dp_001_common.json`:**
  - `printable_area` ["0x0","256x0","256x256","0x256"].
  - `bed_exclude_area` ["0x0","28x0","28x28","0x28","0x28","8x28","8x256","0x256"].
  - `extruder_clearance_radius` 57, `extruder_clearance_max_radius` 68, `extruder_clearance_height_to_lid` 90.

  — [BambuStudio fdm_bbl_3dp_001_common.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/machine/fdm_bbl_3dp_001_common.json)
- **`fdm_machine_common.json`:** `printable_height` 250, `extruder_clearance_height_to_rod` 34, `extruder_clearance_height_to_lid` 140, `extruder_clearance_dist_to_rod` 33, `best_object_pos` 0.5x0.5. — [BambuStudio fdm_machine_common.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/machine/fdm_machine_common.json)
- **Marketing build volume:** 256 × 256 × 256 mm, max acceleration 20 m/s², max speed 500 mm/s. — [Bambu Lab P1 page](https://bambulab.com/en-gb/p1); [3DJake P1S](https://www.3djake.com/bambu-lab/p1s)
- The often-quoted 32 mm³/s hotend flow appeared only on low-quality sites and is unverified. — (search result; no reliable source)

### Inferences
- **Bed-fit algorithm:**
  1. Orient the part.
  2. Compute the convex hull of the XY footprint (all vertices) and the height h = zmax − zmin.
  3. Pass if h ≤ 250, the hull fits inside [0,256]², and the hull doesn't intersect the exclusion polygon(s).
  4. Search for a fitting placement by rotating the hull about Z in 5° steps; a rotating-calipers min-area rectangle gives a fast first test.
  5. Add a brim margin (e.g. 5 mm) when a brim is enabled.
- **Sequential (by-object) printing:** objects must be ≥ `extruder_clearance_radius` (57 mm) apart, and every object but the last must be under `extruder_clearance_height_to_rod` (34 mm). Lid height limits: 90 (common BBL) vs 140 (machine common); the P1S value inherits 90.
- **Precedence:** read the inherited chain at runtime (P1S → `fdm_bbl_3dp_001_common` → `fdm_machine_common`) so profile updates propagate. Use 250 mm as the safe height.

### Gaps
- What the 18 × 28 exclusion physically is (the corner at bed origin used for nozzle wiping or purging?) was not confirmed. The bed origin / front-left convention was not verified from Bambu docs.

---

## B5. Filament mass and print-time estimation

### Takeaway
Mass is easy and accurate: extruded volume × density. Density is 1.26 g/cm³ for Bambu PLA Basic, 1.28 for PETG HF and 1.22 for TPU 95A HF.

Time needs a motion model: per feature, speed = min(feature speed, Q_max / (line width × layer height)), plus trapezoidal acceleration. Q_max is 21 mm³/s for PLA Basic and PETG HF, 12 for TPU 95A HF. Simple estimators without acceleration commonly miss by 10–30% (forum reports; no controlled study found).

### Cited Findings
- **Bambu filament profiles:**

  | Filament | `filament_max_volumetric_speed` | Density (g/cm³) | Nozzle temp | Inherits |
  |---|---|---|---|---|
  | PLA Basic | 21 mm³/s | 1.26 | — | `fdm_filament_pla` |
  | PETG HF | 21 mm³/s | 1.28 | 245 °C (230–270) | `fdm_filament_pet` |
  | TPU 95A HF | 12 mm³/s | 1.22 | 230 °C | `fdm_filament_tpu` |

  PLA Basic's `filament_cost` is 15.99.

  — [Bambu PLA Basic @base.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/Bambu%20PLA%20Basic%20%40base.json); [Bambu PETG HF @base.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/Bambu%20PETG%20HF%20%40base.json); [Bambu TPU 95A HF @base.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/filament/Bambu%20TPU%2095A%20HF%20%40base.json)
- P1S/X1C speeds and accelerations are in A4: walls 200/300, infill 270, accelerations 10k/5k/2k, first layer 50 mm/s at 500 mm/s². Machine limits: 20k mm/s², 500 mm/s. — [0.20mm Standard @BBL X1C.json](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/process/0.20mm%20Standard%20%40BBL%20X1C.json); [P1S machine profile](https://raw.githubusercontent.com/bambulab/BambuStudio/master/resources/profiles/BBL/machine/Bambu%20Lab%20P1S%200.4%20nozzle.json)
- **Estimator error (anecdotal):**
  - Cura: on average 8% low over 34 parts; an 11-minute print was off by 175%, a 4.6 h print by only 3%.
  - Bambu users report X1C estimates 15–20% short, and others 10–15% over.
  - Klipper users report up to 30% short when acceleration and jerk are unknown.
  - Errors are attributed to the slicer not knowing acceleration and jerk.

  — [Ultimaker community](https://community.ultimaker.com/profile/383473-emustwin/); [Bambu forum](https://forum.bambulab.com/t/inaccurate-print-times-can-we-tweak-settings-to-be-more-accurate/2546); [Klipper discourse](https://klipper.discourse.group/t/estimated-print-time/1423); [Duet3D forum](https://forum.duet3d.com/post/102344)

### Inferences
- **Flow-limited speed.** v_eff = min(v_feature, Q_max / (w·h)). At 0.2 mm layers:

  | Feature | Line width | Cap from 21 mm³/s | Profile speed | Effective speed |
  |---|---|---|---|---|
  | Outer wall | 0.42 mm | 250 mm/s | 200 mm/s | 200 mm/s |
  | Inner wall | 0.45 mm | 233 mm/s | 300 mm/s | 233 mm/s |
  | Sparse infill | 0.45 mm | 233 mm/s | 270 mm/s | 233 mm/s |

  For TPU (12 mm³/s): 133–143 mm/s caps, though TPU profiles set lower speeds anyway.
- **Mesh-only estimator (no slicing).** Let V be the part volume (signed tetrahedra sum) and A the surface area. Walls use N wall loops of width w.
  - V_shell ≈ A_side·N·w + A_topbottom·(top + bottom layers)·h. Use the full area A as an upper bound.
  - V_infill ≈ (V − V_shell)·density_infill.
  - Filament mass = (V_shell + V_infill)·ρ (+ support mass from B2).
  - Time ≈ Σ_features V_f / (w_f·h·v_eff,f) + layer count × (per-layer overhead: travel, Z hop, about 1–2 s, unverified) + fixed start overhead (P1S homing, bed leveling and purge are typically several minutes; not sourced here).
  - Correct each segment of length L for acceleration a: t = L/v + v/a when L > v²/a, else 2√(L/a). Short perimeter segments (small features) are acceleration-limited, which is why short prints have the largest error.
  - Calibrate a single multiplier against 5–10 Bambu Studio slices of studio parts.
- **Exact alternative:** call Bambu Studio / Orca CLI slicing (`--slice`) for final numbers, and use the mesh estimator only for interactive feedback.

### Gaps
- No peer-reviewed accuracy study for slicer or mesh-based estimators was found.
- Bambu's own time-estimator internals (GCodeProcessor) were not read.
- P1S start-sequence duration is unsourced.

---

## B6. Plate packing (arrange)

### Takeaway
PrusaSlicer (and its descendants Bambu Studio and Orca) arranged with libnest2d: a no-fit-polygon (NFP) placer with first-fit selection, optimizing each new item's position against a scoring function, on convex hulls of the footprints. Early versions used DJD selection plus a bottom-left placer.

### Cited Findings
- libnest2d: "the no fit polygon based placer module combined with the first fit selection strategy is now used in the PrusaSlicer application's arrangement feature". Each item's best placement is found by local optimization over arrangement features. It works well for rectangles and convex polygons without holes or concavities. — [libnest2d (GitHub mirror)](https://github.com/atimmer/libnest2d); [libnest2d (Gitee mirror)](https://gitee.com/rivul/libnest2d)
- The slicer's `Arrange.hpp` header (Orca/Bambu mirror) warns that only convex polygons are supported by libnest2d. An early commit used a "DJD selection heuristic and a bottom-left placement strategy". — [Orca-Bambu mirror Arrange.hpp](https://git.trueserve.org/PublicCodeMirror/OrcaSlicer-bambulab/raw/commit/6b732e5a26121d6dc9ad3896284ff3f6564b5a78/src/libslic3r/Arrange.hpp); [commit](https://git.trueserve.org/PublicCodeMirror/OrcaSlicer-bambulab/commit/20b7aad6d1cbb4b282586a3844fb66843c81f10d.diff)
- SVGnest, by contrast, uses a genetic algorithm over the order in which items are placed. — [libnest2d README](https://github.com/atimmer/libnest2d)

### Inferences
- **TypeScript arrange for the studio:**
  1. Footprint = convex hull of the XY-projected oriented mesh, offset by spacing/2 (e.g. 3 mm), and by brim width if used.
  2. Sort by hull area, descending (first-fit-decreasing).
  3. For each item, try rotations {0, 90, 180, 270} (or 15° steps).
  4. Candidate positions: NFP vertices of the item against each placed hull (Minkowski sum of the placed hull and the reflected item; convex-convex NFP is O(n+m)), plus the bed's inner-fit rectangle corners, minus `bed_exclude_area`.
  5. Score = bounding-box area of all placed items + distance to the bed center (Bambu `best_object_pos` 0.5x0.5).
  6. Take the minimum. When an item doesn't fit, open a new plate.
- **Simpler acceptable baseline:** a MaxRects or skyline packer on oriented bounding rectangles. It's worse for round parts but simpler to build.

### Gaps
- The current PrusaSlicer 2.6+/2.7+ arrange rewrite (which reportedly replaced parts of libnest2d) and Bambu Studio's present arrange scoring weren't verified from source in this session.
- No benchmark of packing density was found.
