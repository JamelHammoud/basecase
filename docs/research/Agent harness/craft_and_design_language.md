# What makes printed robot parts look expertly designed

Research date: 2026-10-25. This extends [`cad_code_and_craft.md`](cad_code_and_craft.md); the measurements on our own scenes are in [`validation_against_basecase.md`](validation_against_basecase.md) §7.

Source tags: **[abs]** abstract only, **[sec]** secondary source.

Method: the published CAD of SO-101 (11 STEP files and STLs) and Open Duck Mini v2 (16 print STLs) was downloaded and measured with OpenCascade and trimesh. Four test box shells with 2.5 mm walls, at corner radii 0, 1, 4 and 8 mm, calibrated the metrics.

## Expert robots, measured

| Robot | Construction | Measured |
|---|---|---|
| **SO-101** (6× STS3215) | 11 printed parts (about 1.8 per DoF); servo cradles with 3.0 mm walls; thick links with pockets | **Rounding:** one dominant envelope radius per part (R5 on the arm links, R3 on the wrist and pitch parts, R1 on the motor holders); 0.8–1.2 mm edge breaks; 1–2 large R8–13 sweeps; 9 radius values across the whole arm, with 1/3/5 dominant.<br>**Edges:** interior and functional edges stay sharp (interior sharp share 0.6–0.9); envelope sharp share median 0.39.<br>**Solidity:** 0.55–0.58 on the links.<br>**Fasteners:** 2 families, M2 self-tappers into Ø1.5 pilots and M3 heads in Ø5.4–6.0 counterbores; no inserts |
| **Open Duck Mini v2** (STS3215) | Thin shells for body and head, flat sheets for legs and neck, TPU sole; M3 inserts in the trunk, legs, feet and head; M3 × 10 and × 6 on the structure | **Walls:** modal 3.0 mm; 92% of the body shell's samples are in 1.2–3.0 mm.<br>**Edges:** envelope sharp share 0.72, a deliberately hard-surface style. Its appeal is its character silhouette |
| **ToddlerBot 2.0** (30 Dynamixels) | Visible actuators ("honest mechanism"); 4 thread sizes | The paper optimized for "fewer screw types and … unobstructed tool access". It survives 7 falls; a repair is 21 min of printing and 14 min of assembly |
| **Berkeley Humanoid Lite** | Every part fits a 200 mm cube; through-screws and embedded hex standoffs against delamination | No wall or fillet numbers published |
| **Petoi Bittle** | Injection-molded interlocking frame; M2 self-tappers only [sec] | — |

**The key finding:** experts don't round everything.
- SO-101 rounds the envelope with one dominant radius per part and leaves functional, interior and bed edges sharp.
- Duck is hard-edged and still well liked, because of its silhouette, consistent 3 mm shells and one design language.
- So rounding signals "not boxy" but is neither necessary nor sufficient. A consistent language (one radius ladder, one wall, few fasteners) is the common thread.

## Rules with numbers

Confidence: H = primary source or our measurement, M = vendor or secondary.

**Computable from geometry:**

| Rule | Value | Source | Confidence |
|---|---|---|---|
| Wall thickness | One perimeter is 0.45 mm at a 0.4 mm nozzle; 2 perimeters (0.9 mm) is the minimum; structural walls 2.4–3.2 mm; expert shells are a modal 3.0 mm | Prusa; Duck and SO-101 measured | H |
| Overhangs and bridges | 45–60° unsupported; bridges under 5 mm for clean results | Prusa; Hubs | H / M |
| Bed edges | 45° chamfer, not a fillet (a bottom fillet makes a steep overhang) | Prusa; Hubs | H |
| Concentric corners | Outside radius = inside radius + wall | Stratasys [sec] | M |
| Heat-set M3 boss | Hole Ø4.0, depth = insert length + 1 mm, wall ≥ 1.6 mm, so boss OD ≥ 7.2 mm | CNC Kitchen | H |
| Ribs | 40–60% of the wall (molding), and at least 1.5 mm for FDM | Protolabs; GrabCAD [sec] | M |
| Moving clearances | ≥ 0.3 mm for moving parts; 0.2–0.3 mm for snap fits | Prusa; Qidi | H / M |
| PLA snap strain | 4–8%, halved for cantilevers along Z | Fictiv; Core77 | M |
| Radius ladder | One dominant envelope radius per part (≥ 40% of its blends); 0.8–1.2 mm breaks elsewhere; about 3 dominant values per robot | SO-101 measured | H (one robot) |
| Selective rounding | Envelope sharp share about 0.4 on SO-101, against 1.0 for an untreated box | Measured | H |
| No printed bricks | Solidity above 0.85 only for grips | SO-101 measured | H |

**Needs to know what a part is for:**
- **Few fasteners:** 1–2 families on SO-101, Bittle and Duck; 4 sizes on ToddlerBot, by stated principle.
- **Heads hidden or counterbored** on cosmetic faces (SO-101).
- **Shell seams** get a lip and step with a shadow line, not a butt joint (Hackaday / Teaching Tech). No numeric reveal width was found.
- **Honest mechanism or covered:** consistency within one robot matters more than which style.
- **Keep the bed face and supports off visible faces.**

## Predicting perceived quality

- **Geometry explains little.** Held-out R² from geometric features is 0.05 for mugs and 0.48 for tables (Dev 2025, arXiv 2505.12373). Smooth curvature and balanced proportions help; high curvature variance hurts.
- **Curved objects are preferred.** Bar & Neta 2006: 67.2% vs 50.6%, d = 0.94, but only 14 participants.
- **Unity in variety** (Post, Blijlevens & Hekkert 2016 [abs]): unity and variety each raise appreciation. That maps onto a shared radius ladder and wall plus varied features.
- **Car split lines:** gap and flush strongly drive perceived quality [sec].
- **Nothing found** rates mechanical parts as professional vs amateur with measured geometric predictors. The link from these metrics to "amateur" is inferred, and has to be calibrated on your labels.

## Interventions with evidence

- **Visual review loops help fidelity.** In an LLM DFM-redesign paper (arXiv 2609.05559), removing the visual review loop was the largest ablation: Chamfer 3.50 → 11.50. Its guidelines were "chamfers over horizontal convex fillets; avoid sharp internal vertical corners". It has no manufacturability score yet.
- **Preference training trades validity for looks.** CADFusion's visual-preference training raised a VLM score from 7.69 to 8.96 and improved human rank from 2.03 to 1.86, but invalid outputs rose from 4.84 to 6.20.
- **Why generated parts come out boxy:** DeepCAD-era training data has no fillets or chamfers (GenCAD), and CAD-Coder ignored fillet commands.
- **Nothing measures the effect of style references, expert-part retrieval or fillet passes on human-judged quality.** The closest evidence is our own bench: shape recipes stopped shells looking like boxes, and prompt examples leaked into results.

## Recommended lint (WARN only until calibrated on your labels)

| Check | Threshold | Likely to predict "amateur" |
|---|---|---|
| Envelope sharp share | Warn above 0.6 and flag above 0.8 on parts over 20 mm, unless the design language says faceted | High ("boxy") |
| Radius ladder | At least 1 dominant envelope radius per exposed part; at most 4 radii per part and about 6 per robot, from one ladder | High |
| Printed brick | Solidity above 0.85, 2V/A above 8 mm and smallest side above 15 mm, unless it's a grip | High (Sprout has 11 such parts) |
| Shell wall consistency | Modal wall 1.6–3.5 mm, with at least 70% of samples within ±0.6 mm; nothing under 0.9 mm | Medium |
| Concentric corners | Outside radius = inside radius + wall, ±0.5 mm | Medium |
| Fastener vocabulary | At most 3 thread sizes or 2 head styles per robot (the servos' own screws excluded) | Medium-high |
| Exposed heads | Counterbored (head Ø + 0.4–0.5 mm) or on hidden faces | Medium-high |
| Split lines | Lip or step at exposed shell seams; flag coplanar butt seams | Medium |
| Bed edges and supports | 0.4–1.0 mm chamfer at 45° on the bed edge; no supports on cosmetic faces | Medium |
| Insert bosses | Per the CNC Kitchen rule above | Low for looks, high for function |

Caveats:
- The thresholds rest on 2 robots and 27 parts.
- Run checks on the app's own meshes, since coarse STL exports inflate edge sharpness.
- None of these capture silhouette or proportion, which stay with `compare` and the judge.

## Tested against your critiques (second round)

These metrics were replayed over 82 saved versions of Ribbit's and Beni's shells; see [`validation_against_basecase.md`](validation_against_basecase.md) §16.
- **Envelope sharp share followed explicit edge requests:** "rounded/beveled at the top" took it from 0.95 to 0.78, and "simplify the torso exterior" from 0.71 to 0.50.
- **It went the other way for "more craft and polish":** 0.41 → 0.7, because more detail means more crisp edges.
- **Neither it nor boxiness registered "more round, less rectangle".** Yet the head's fit to the SVG outline you supplied rose from 0.55 to 0.75.

So these are hints for the WARN-level lint, not measures of taste. When you supply a target, fit to that target is the measure.
