# Design for FDM printing of robot parts on a Bambu Lab P1S, automated printability checks, and headless slicing

Research date: 2026-10-17. "Accessed" dates are 2026-10-17 unless noted. Primary sources: Bambu Lab's own profile JSON and CLI source on GitHub (read directly via raw.githubusercontent.com), the OrcaSlicer wiki, and the BambuStudio wiki. Bambu's own web pages (bambulab.com specs, wiki.bambulab.com filament table, us.store.bambulab.com product pages) returned HTTP 402/403 or Cloudflare challenges to the fetch tool, so some P1S and price facts come from search snippets of those pages or from retailers. Each case is flagged.

## 1. Bambu Lab P1S specs relevant to design (build volume, nozzle, temps, materials, AMS)

### Takeaway
The P1S is an enclosed CoreXY with a 256 × 256 × 256 mm volume, a 0.4 mm stainless-steel nozzle by default (0.2/0.6/0.8 optional), a 300 °C hotend and a 100 °C bed. PLA, PETG, TPU, ABS and ASA are its "ideal" materials. PA and PC are "capable". Carbon- and glass-fibre filaments need a hardened-steel nozzle and are "not recommended" with the stock nozzle. For automated bed-fit checks, use the slicer profile, not the marketing number: XY 0–256 mm, minus an 18 × 28 mm excluded corner, with `printable_height` inherited as 250 mm.

### Cited Findings
- Build volume is 256 × 256 × 256 mm and max nozzle temperature is 300 °C (official wiki unboxing page, seen via search snippet). Stock nozzle is 0.4 mm stainless steel, with 0.2/0.6/0.8 mm options — [Bambu Lab Wiki: Unboxing P1S](https://wiki.bambulab.com/en/p1/manual/unboxing-p1s); [Bambu Lab P1 product page](https://bambulab.com/en-gb/p1)
- Max bed temperature is 100 °C — [Makerpoint retailer listing](https://makerpoint.nl/en-gb/3d-printing/3d-printers/fff/210000005619); [PB Tech listing](https://www.pbtech.com/product/PTRBAM0005/category/brand/bambu-lab?pg=2)
- Filament compatibility, as retailers copy it from Bambu: PLA, PETG, TPU, PVA, PET, ABS and ASA are "ideal", and PA and PC are "capable". Carbon- and glass-fibre-reinforced polymers are "not recommended" (the official wiki wording, as summarised by the search). The P1S is fully enclosed with an activated-carbon filter — [PB Tech listing](https://www.pbtech.com/product/PTRBAM0005/category/brand/bambu-lab?pg=2); [Bambu Lab Wiki: Unboxing P1S](https://wiki.bambulab.com/en/p1/manual/unboxing-p1s)
- Bambu's hotend listing text: for CF/GF filaments it is "highly recommended to use a hardened steel 0.6 mm nozzle". Fibre-, metal- or particle-filled filaments tend to clog a 0.2 mm nozzle. Bambu PLA-CF and PETG-CF are "extensively tested" with low clog risk on a hardened-steel 0.4 mm nozzle — [Robu.in hardened-steel hotend listing (Bambu copy)](https://st.robu.in/product/bambu-lab-complete-hotend-assembly-with-hardened-steel-nozzle-0-6mm-for-p1pp1s); [PB Tech hardened-steel hotend](https://www.pbtech.com/product/PTABAM0019/Bambu-Lab-Accessories-Hotend-with-Hardened-Steel-N)
- **Slicer profile ground truth** (BambuStudio `master`, read 2026-10-17):
  - `Bambu Lab P1S 0.4 nozzle.json` has `"printer_model": "Bambu Lab P1S"`, `"setting_id": "GM014"` and `"inherits": "fdm_bbl_3dp_001_common"`.
  - `"bed_exclude_area": ["0x0","18x0","18x28","0x28"]` is an 18 × 28 mm keep-out at the front-left origin corner.
  - `machine_max_speed_x` is 500 mm/s and `machine_max_acceleration_x` is 20000 mm/s².
  - `"default_filament_profile": ["Bambu PLA Basic @BBL P1S 0.4 nozzle"]` and `"default_print_profile": "0.20mm Standard @BBL X1C"`.
  - `extruder_variant_list` is "Direct Drive Standard,Direct Drive High Flow".
  — [BambuStudio profile: Bambu Lab P1S 0.4 nozzle.json](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/Bambu%20Lab%20P1S%200.4%20nozzle.json)
- `fdm_bbl_3dp_001_common.json` sets `"printable_area": ["0x0","256x0","256x256","0x256"]`. `fdm_machine_common.json` sets `"printable_height": "250"`, and neither the P1S file nor `fdm_bbl_3dp_001_common` overrides it (grep found no `printable_height` key in either) — [fdm_bbl_3dp_001_common.json](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/fdm_bbl_3dp_001_common.json); [fdm_machine_common.json](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/fdm_machine_common.json)
- P1S-specific filament profiles in BambuStudio include Bambu ABS, PC, PC FR, PETG HF, PLA Basic, PLA Matte and PLA Silk+, each "@BBL P1S" with nozzle variants. `Bambu PLA Basic @BBL P1S 0.4 nozzle` has `filament_max_volumetric_speed` of 21 / 29 mm³/s (standard / high-flow extruder variant) and `filament_flow_ratio` of 0.98 / 0.985 — [BambuStudio filament profiles dir](https://github.com/bambulab/BambuStudio/tree/master/resources/profiles/BBL/filament)
- A real P1S G-code header includes `; filament_density: 1.26` (PLA Basic) and `filament_cost = 24.99` per kg (the profile default) — [MIT 863.24 sample Bambu G-code](https://fab.cba.mit.edu/classes/863.24/people/JanaHaasDavis/assets/janaprint2_1h56m.gcode)

### Inferences
- Bed-fit check for the app: the footprint must fit within 256 × 256 mm and stay out of the 18 × 28 mm front-left exclusion. Use 250 mm max Z, the profile value, because that is what the CLI will enforce. Keep a 5–10 mm XY margin for brim and skirt. Exceeding the area likely yields `CLI_GCODE_PATH_OUTSIDE (-104)`, `CLI_OBJECTS_PARTLY_INSIDE (-52)` or `CLI_GCODE_PATH_IN_UNPRINTABLE_AREA (-102)` (see §4).
- Material policy for robot parts on a stock P1S:
  - PLA: default for brackets and covers.
  - PETG: tougher, more heat-tolerant.
  - ABS/ASA: heat- and UV-tolerant. The enclosure makes them practical.
  - TPU 95A: feet and bumpers. Prefer direct feed over the AMS.
  - PA/PC: possible.
  - CF-filled grades: require the hardened-steel hotend, which is an upgrade to flag in the BOM.
- The 300 °C limit and 100 °C bed limit high-temperature nylons and PC, so warn when a part specifies PA6-GF or PPS.

### Gaps
- The official P1S spec page (bambulab.com/en-us/p1/specs) and the Bambu wiki filament compatibility table returned 403/402/Cloudflare, so exact official wording on AMS material limits isn't verified here. Known community guidance says TPU and wet or brittle CF filaments shouldn't go through the AMS, but no source was retrieved.
- Chamber temperature (unheated passive enclosure) and max volumetric flow per material weren't verified from an official page.

## 2. FDM design rules with numbers for functional robot parts

### Takeaway
The few published numbers broadly agree:
- 45° overhang limit without support.
- Bridges under about 5–10 mm.
- Walls at least 0.8 mm (two 0.4 mm lines). Use about 1.2–1.6 mm or more for anything load-bearing.
- Pins under 5 mm diameter are perimeter-only and weak.
- Chamfer bed-facing edges (45°) rather than filleting them.
- Holes print undersized. Clearances are about 0.05–0.15 mm per side for press fits and 0.2–0.3 mm per side for sliding fits.

Every source says to print a test gauge, as SO-ARM100 does. Heat-set insert holes are about 3.2 mm (M2), 3.7 mm (M2.5), 4.0 mm (M3) and 5.3 mm (M4) for common tapered inserts, with blind holes about 1 mm deeper than the insert.

### Cited Findings
**General geometry**
- Overhangs: usually printable up to 45° without support, above which add support — [Hubs/Protolabs Network: How to design parts for FDM](https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/); [Hubs: Key design considerations](https://www.hubs.com/knowledge-base/key-design-considerations-3d-printing/)
- Bridges: some sagging or support marks are "always present" unless the bridge is less than 5 mm — [Hubs: How to design parts for FDM](https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/)
- Walls: "All 3D printers can successfully print components with wall thicknesses greater than 0.8 mm" — [Hubs: Key design considerations](https://www.hubs.com/knowledge-base/key-design-considerations-3d-printing/)
- Corners: the corner radius equals the nozzle diameter, so sharp internal corners can't be printed. Add a 45° chamfer or radius on edges touching the build plate; this also reduces elephant's foot and warping — [Hubs: How to design parts for FDM](https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/)
- Vertical pins: pins over 5 mm diameter print with perimeters and infill. Pins under 5 mm are perimeter-only and weak, so fillet their base or use an off-the-shelf metal pin — [Hubs: How to design parts for FDM](https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/)
- Vertical holes print undersized by an amount that depends on printer, slicer, size and material. For critical diameters, print undersized and drill. Horizontal holes avoid support if the part is rotated 90° — [Hubs: How to design parts for FDM](https://www.hubs.com/knowledge-base/how-design-parts-fdm-3d-printing/)

**Fits and clearances** (watch whether a value is per side or on diameter)
- Press fit: 0.05–0.15 mm per side (bearings, dowel pins, heat-set bosses). Sliding fit: 0.2–0.3 mm per side (lids, drawers, guides). For snap fits, "deflection does the latching, not the gap". Internal holes print slightly undersized. ABS shrinks 0.5–0.8% and nylon 1–2% — [Sovol: FDM tolerances & clearances](https://www.sovol3d.com/blogs/news/fdm-3d-printing-tolerances-clearances-how-to-design-parts-that-fit)
- Alternative convention: for press fits, 0.1–0.2 mm interference gives a light hand press and 0.2–0.4 mm a mallet fit. Add a roughly 0.5 mm lead-in chamfer on press-fit parts. Avoid supports on mating surfaces — [Zbotic: 3D printing tolerances](https://zbotic.in/3d-printing-tolerances-designing-gaps-for-press-fits-threads-and-snap-fits/)
- Ultimaker-oriented university guide: 0.3 mm or more for parts that must move freely. Some guides read "0.1 mm tolerance" as 0.1 mm per side, so a 10 mm peg gets a 10.4 mm hole — [UAL CCI wiki: Design the clearance and tolerance](https://wiki.cci.arts.ac.uk/books/digital-fabrication-lab/page/design-the-clearance-and-tolerance)
- A well-tuned FDM printer typically holds ±0.1–0.3 mm — [Zbotic](https://zbotic.in/?p=595941)

**Bearings (608: 8 × 22 × 7 mm; MR series)**
- Printed bearing seats need about 0.2–0.5 mm of allowance, versus about 21 µm for a machined "hammer-in" fit. The right value is printer- and material-specific — [OpenSCAD mailing list thread](https://lists.openscad.org/empathy/thread/U5XIT6YYMQ53VY5CWK3GOSYZR6T7SINH?page=2)
- An academic PETG press-fit study tested housings at nominal, −0.1 mm and −0.2 mm relative to the bearing OD — [SCIDAR (Univ. Kragujevac) bearing seat study](https://scidar.kg.ac.rs/handle/123456789/21571?mode=full)
- An "Ultimate 608 Bearing" calibration kit binary-searches the minimum radial tolerance with test prints, on the grounds that no single number works — [Printables 276409](https://www.printables.com/model/276409-ultimate-608-bearing-with-calibration-kit-v2)
- Berkeley Humanoid Lite sizes its 6512 actuator around a 6811ZZ bearing and embeds a brass hex standoff in the printed input shaft for stiffness — [Berkeley Humanoid Lite paper (arXiv 2504.17249)](https://arxiv.org/html/2504.17249v1)

**Heat-set inserts**
- CNC Kitchen (2021-10-01):
  - Make blind holes about 1 mm deeper than the insert. Through holes needn't be longer than the insert.
  - Holes "should be straight (not tapered)". No chamfer is normally needed.
  - Respect the poster's minimum wall thickness.
  - Size the bore so the tip enters without a burr, and test because printed holes come out small.
  - Horizontal holes may print undersized at the top.
  - Exact per-size numbers are only in CNC Kitchen's PDF poster, which wasn't retrieved.
  — [CNC Kitchen: Tips & tricks for heat-set inserts](https://www.cnckitchen.com/blog/tipps-amp-tricks-fr-gewindeeinstze-im-3d-druck-3awey)
- Generic heat-set insert spec table (Albany County Fasteners, 2025-12; this matches the common Ruthex/CNC Kitchen tapered sizes):

  | Thread | Hole Ø | Insert OD | Insert length | Min boss OD |
  |---|---|---|---|---|
  | M2 | 3.2 mm | 3.5 mm | 3–5 mm | 5.0 mm |
  | M2.5 | 3.7 mm | 4.0 mm | 3.5–6 mm | 5.5 mm |
  | M3 | 4.0 mm | 4.6 mm | 4–6 mm | 6.5 mm |
  | M4 | 5.3 mm | 6.0 mm | 5–8 mm | 8.5 mm |

  — [Albany County Fasteners heat-set insert specs PDF](https://www.albanycountyfasteners.com/media/64/3d/5a/1764619189/heat-set-insert-specs.pdf)
- PartsBuilt recommends hole Ø 4.0 mm for its 4.6 mm OD M3 insert, 3.10 mm for its M2.5 and 5.25 mm for its M4. Values vary by insert design — [PartsBuilt heat-set inserts](https://partsbuilt.com/heat-set-thread-inserts)
- A Stanford SSI wiki lists "5 mm for M3, 5.5 mm for M4", tuned to Prusa printers. It's ambiguous whether that is the hole or the boss, so treat it as printer-specific — [Stanford SSI wiki](https://ssi-wiki.stanford.edu/Special:MobileDiff/4445)

**Layer-line strength (anisotropy) and reinforcement in real robots**
- Berkeley Humanoid Lite:
  - Uses through-screws and embedded brass hex standoffs to reinforce parts against failure along layer boundaries.
  - Merges subcomponents into single prints to avoid stress concentrations at fasteners.
  - Lists PLA's anisotropy and lower strength as limitations: transmission stiffness was about 319 Nm/rad, versus about 1468 Nm/rad for a CF-PA reference reducer.
  - Chose cycloidal over planetary gears because they spread load over many teeth and tolerate desktop-printer resolution.
  — [arXiv 2504.17249](https://arxiv.org/html/2504.17249v1)
- Splitting to fit the bed: Berkeley Humanoid Lite designs every printed part to fit 200 × 200 × 200 mm. SO-ARM100 ships separate plate files for 220 × 220 mm (Ender) and 205 × 250 mm (Prusa/UP) beds — [arXiv 2504.17249](https://arxiv.org/html/2504.17249v1); [SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)

**Servo interfaces and fit gauges**
- SO-ARM100/101 tells users to print a fit gauge first: "Gauge Zero" and "Gauge Tight" for STS3215 servos, or a zero and −0.1 gauge with a LEGO brick. If the fit is wrong, adjust printer settings before printing the set — [SO-ARM100 README](https://github.com/TheRobotStudio/SO-ARM100)

**TPU feet**
- Open Duck Mini v2 prints `foot_bottom_tpu.stl` (×2) in TPU at 40% infill. Everything else is standard PLA at 15% infill — [Open Duck Mini print guide](https://github.com/apirrone/Open_Duck_Mini/blob/v2/docs/print_guide.md)

### Inferences
Rule set for automated checks (P1S, 0.4 nozzle). Values are drawn from the findings above; anything marked "heuristic" isn't directly sourced:
- **Wall thickness:** at least 0.8 mm is an error threshold (2 lines). Warn under 1.2 mm on load-bearing parts. For structural parts, prefer 3–4 perimeters, about 1.6 mm or more (heuristic). Make walls integer multiples of about 0.4–0.45 mm line width so they don't leave gap-fill (heuristic).
- **Overhangs:** flag downward-facing faces steeper than 45° from vertical (normal · −Z > cos 45°) that aren't touching the bed. Flag bridges over 5 mm (warning) and over 10–15 mm (error, heuristic).
- **Pins:** warn when a free-standing vertical pin is under 5 mm diameter, and suggest a metal dowel or a fillet at its base.
- **Bed-facing edges:** prefer 45° chamfers of about 0.5–1 mm over fillets. A fillet on a bed-facing edge becomes an overhang near the plate.
- **Holes:** treat vertical holes as about 0.1–0.2 mm undersized (heuristic). For critical bores, design to nominal + clearance and offer a "drill to size" note. Prefer teardrop or flat-top profiles for horizontal holes over about 6 mm (heuristic, not sourced here).
- **Fits (diameter = 2 × per side):**
  - Press: 0–0.1 mm on diameter.
  - Snug/locating: 0.1–0.2 mm.
  - Sliding: 0.4–0.6 mm.
  - Free-running: 0.6 mm or more.
  - Always generate a test gauge, as SO-ARM100 does.
- **Bearings:** start the 608 seat at 22.0–22.1 mm (nominal OD 22.00 mm) and offer a ±0.1 mm gauge strip. The same approach applies to MR bearings, e.g. MR105 is 10 mm OD (dimension from general knowledge, not verified here).
- **Heat-set inserts:** use the table above. Make blind depth equal to insert length + 1 mm, and make boss OD at least the table value, roughly 1.4–1.6 × insert OD. Keep inserts perpendicular to layers where pull-out matters (heuristic).
- **Anisotropy:** orient so the main bending stress runs along layers, not across them. Through-bolt across layer lines, or use embedded metal standoffs or shafts, as Berkeley Humanoid Lite does.
- **Splitting large parts:** when a part exceeds 256 × 256 × 250 mm (or the user's chosen safety box), split with dowel pins or a dovetail plus screws across the joint. Note that open robot projects target 200–220 mm cubes so they print on most printers.

### Gaps
- CNC Kitchen's and Ruthex's official per-size insert dimension sheets weren't retrievable (the PDF poster, and no Ruthex datasheet in results). The table above is a third-party table, consistent with common practice.
- No authoritative numeric sources were found for: snap-fit cantilever design (strain limits for PLA/PETG), rib-to-wall thickness ratios for FDM, screw boss OD-to-screw ratios for self-tapping screws into plastic, dovetail clearances, or servo horn spline fits. The usual practice for spline fits is to bolt to the metal horn rather than print splines, but that isn't sourced here.
- Hubs' FDM rule table (minimum feature size, embossed/engraved detail, recommended moving-part clearance) is linked from the Hubs pages but its contents weren't retrieved.

## 3. Automatic printability analysis: algorithms, tools, libraries

### Takeaway
Most checks are simple mesh geometry: overhang faces by normal threshold, thin walls by inward ray casting, bed-fit from the oriented bounding box, and watertight/manifold checks. Orientation optimisation is available off the shelf as Tweaker-3 (Python, GPL-3.0, used as Cura's Auto-Orientation). Both slicer CLIs also expose `--orient` and `--arrange`. The most reliable printability verdict is the slicer itself, through its error codes in `result.json` (§4).

### Cited Findings
- **Overhang detection:** compute the angle between each face normal and the build plane in the negative direction, and flag the face as overhanging when the angle exceeds a threshold T — [US patent 9916684 (via USPTO)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9916684). Commercial CAD (TurboCAD/ViaCAD) compares facet normals with the work-plane direction and highlights faces at 45° or less from horizontal — [TurboCAD Overhang Analysis](https://turbocaddoc.atlassian.net/wiki/spaces/TMP/pages/34177449/Overhang+Analysis)
- **Thickness:** Blender's Mesh Analysis measures wall thickness by ray casting, because printers have a minimum printable wall — [Blender manual: Mesh analysis](https://docs.blender.org/manual/ru/3.3/modeling/meshes/mesh_analysis.html)
- Watertightness and winding consistency are the usual pre-checks, as exposed by trimesh-based tools — [ComfyUI GeometryPack Check Normals](https://www.runcomfy.com/comfyui-nodes/ComfyUI-GeometryPack/geom-pack-check-normals). trimesh itself is MIT-licensed (GitHub API, 2026-10-17) — [mikedh/trimesh](https://github.com/mikedh/trimesh)
- **Tweaker-3:**
  - An auto-rotate tool whose parameters are "trained by an evolutionary algorithm". It minimises support volume by default, or support surfaces with `-min sur`.
  - CLI flags: `-i <file or 'glob'>`, `-x` (extended mode, more reliable but slower), `-o <out>`, `-t asciistl|binarystl` (no 3MF output), `-c` (convert only), `-r` (results only), `-p` (progress), `-fs` (favour a side), `-vb`.
  - Python, GPL-3.0. Integrated as Cura "Auto-Orientation" and an OctoPrint PrePrint plugin.
  - The method is in the whitepaper "Tweaker – Auto Rotation Module for FDM 3D Printing" (C. Schranz).
  — [Tweaker-3 GitHub](https://github.com/ChristophSchranz/Tweaker-3); its predecessor STL-tweaker (LGPL-3.0) is deprecated — [STL-tweaker](https://github.com/iot-salzburg/STL-tweaker)
- **Slicer-side analysis:**
  - BambuStudio CLI exposes `--orient`, `--arrange`, `--info` (prints object counts and dimensions, on the unrepaired model), `--no-check` and `--normative-check`.
  - It reports per-object bboxes and triangle counts in `result.json`.
  - Its per-plate timing breakdown includes `TIME_DETECT_OVERHANGS` and support-generation stages.
  — [BambuStudio wiki: Command Line Usage](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage); [OrcaSlicer wiki: CLI actions](https://www.orcaslicer.com/wiki/cli/cli_actions); [BambuStudio.cpp source](https://github.com/bambulab/BambuStudio/blob/master/src/BambuStudio.cpp)

### Inferences
- A Node-native pipeline is possible without Python. three-mesh-bvh, which the repo already uses, supports ray casts for:
  - **Overhangs:** faces with nz < −cos(45°) and z above the first layer. Sum their projected area as a support-area proxy. Approximate support volume as Σ projected area × height to the surface below, found by a downward ray.
  - **Thin walls:** cast a ray from each face centroid along −normal. Thickness under 0.8 mm is an error.
  - **Small features:** connected components with bbox under 2 mm.
  - **Bed contact:** area of faces with nz ≈ −1 at z_min. Warn when the contact area is a small fraction of the footprint, since tall parts with little contact tip over.
  - **Orientation search:** evaluate those metrics over the 24 axis-aligned orientations plus a few candidate face-down orientations. That is a cheap version of what Tweaker-3 does.
- Tweaker-3 is GPL-3.0. Calling it as a separate process is the low-risk route (see §4 licensing); don't link or port its code into a non-GPL app.
- Use the slicer as the final arbiter: run the CLI and map `return_code` (§4) to user-facing errors.

### Gaps
- PrusaSlicer's own auto-orient algorithm (SLA-only historically, FDM in newer versions) wasn't documented in retrieved sources.
- No retrieved source documents trimesh's exact printability APIs, or support-volume algorithms beyond the face-normal method.

## 4. Headless slicing: OrcaSlicer / Bambu Studio / PrusaSlicer CLI, extracting time, filament and cost, macOS notes, AGPL

### Takeaway
BambuStudio and OrcaSlicer (its fork) share nearly the same CLI. For example:

```
BambuStudio --orient 1 --arrange 1 --load-settings "machine.json;process.json" --load-filaments "filament.json" --slice 0 --outputdir out --export-3mf out.gcode.3mf model.stl
```

The settings files must be full (flattened) configs, not stock profiles that `inherits` a parent. Results come from three places:
- `result.json`, always written to `--outputdir`. It has `return_code`, `error_string`, per-plate `total_predication` (print-time estimate in seconds) and per-filament `total_used_g`.
- `Metadata/slice_info.config` and `Metadata/plate_N.gcode` inside the `.gcode.3mf`.
- The G-code `HEADER_BLOCK`, which gives total estimated time, length, volume and weight in grams.

Cost is grams × `filament_cost`/1000. All three slicers are AGPL-3.0. Running an installed slicer as a separate process with files and CLI arguments is, per the FSF, normally "separate programs", but this isn't legal advice.

### Cited Findings
**BambuStudio CLI (official wiki + source)**
- Flags per the official wiki:
  - `--debug <0–5>`
  - `--load-filaments` (semicolon-separated; count should not exceed the filaments used in the 3MF)
  - `--load-settings` (one machine and one process config; "must be full configs, not the stock profile files")
  - `--outputdir`
  - `--arrange` (0 off, 1 on, other values auto)
  - `--orient`, `--scale <float>`
  - `--export-3mf`, `--export-settings`, `--export-slicedata <dir>`, `--load-slicedata <dir>`
  - `--info`, `--pipe <name>`
  - `--slice <0 = all plates | i = plate i>`
  - `--uptodate`, `--help`
  Setting precedence, highest first: CLI `--key=value`, then `--load-settings`/`--load-filaments`, then values in the 3MF. Documented use cases: slice a 3MF with its own settings; slice a 3MF with replacement settings; slice STLs with `--orient` + `--arrange` + machine/process/filament configs + `--slice` + `--export-3mf`.
  — [BambuStudio wiki: Command Line Usage](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)
- Other CLI options defined in source (`PrintConfig.cpp`, master, 2026-10-17): `min_save`, `mtcpp`, `mstpp`, `no_check`, `normative_check`, `repetitions`, `skip_objects`, `clone_objects`, `uptodate_settings`, `downward_check`, `load_assemble_list`, `enable_timelapse`, `load_filament_ids`, `allow_rotations`, `avoid_extrusion_cali_region`, `skip_modified_gcodes`, `makerlab_name`, `metadata_name`, `allow_newer_file`, `curr_bed_type`. On the command line they appear with dashes, e.g. `--min-save` — [BambuStudio PrintConfig.cpp](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/PrintConfig.cpp)
- **`result.json` schema** (from `record_exit_reson()` in `src/BambuStudio.cpp`, master, 2026-10-17):
  - Written to `<outputdir>/result.json`, or `./result.json` without `--outputdir`.
  - Top-level keys: `plate_index`, `return_code`, `error_string`, `times` {`prepare_time`, `export_time`, `export_3mf_time`, …}, `peak_rss_mb`, `layer_height`, `wall_loops`, `sparse_infill_density`, and optionally `downward_compatible_machine` / `upward_compatible_machine`.
  - `sliced_plates[]`, each with:
    - `id`, `times{sliced_time, …per-stage}`, `triangle_count`, `warning_message`
    - **`total_predication`** and **`main_predication`**: the print-time estimate. The log line labels it `pring_time_s`, i.e. seconds.
    - `filament_change_times`, `layer_filament_change`
    - `feature_type_times{}`: time per extrusion role
    - `objects[]{id, name, triangle_count, bbox{x,y,z,width,depth,height}}`
    - `filaments[]{id, filament_id, total_used_g, main_used_g}`
  — [BambuStudio.cpp](https://github.com/bambulab/BambuStudio/blob/master/src/BambuStudio.cpp)
- **CLI return codes** (`src/libslic3r/Utils.hpp`), useful for mapping to user-facing printability errors:

  | Code | Constant |
  |---|---|
  | 0 | `CLI_SUCCESS` |
  | −1 | `CLI_ENVIRONMENT_ERROR` |
  | −2 | `CLI_INVALID_PARAMS` |
  | −3 | `CLI_FILE_NOTFOUND` |
  | −5 | `CLI_CONFIG_FILE_ERROR` |
  | −14 | `CLI_OUT_OF_MEMORY` |
  | −17 | `CLI_PROCESS_NOT_COMPATIBLE` |
  | −20 | `CLI_PRINTABLE_SIZE_REDUCED` |
  | −21 | `CLI_OBJECT_ARRANGE_FAILED` |
  | −22 | `CLI_OBJECT_ORIENT_FAILED` |
  | −50 | `CLI_NO_SUITABLE_OBJECTS` |
  | −51 | `CLI_VALIDATE_ERROR` |
  | −52 | `CLI_OBJECTS_PARTLY_INSIDE` |
  | −58 | `CLI_SLICING_TIME_EXCEEDS_LIMIT` |
  | −59 | `CLI_TRIANGLE_COUNT_EXCEEDS_LIMIT` |
  | −61 | `CLI_FILAMENT_NOT_MATCH_BED_TYPE` |
  | −62 | `CLI_FILAMENTS_DIFFERENT_TEMP` |
  | −67 | `CLI_ONLY_ONE_TPU_SUPPORTED` |
  | −100 | `CLI_SLICING_ERROR` |
  | −101 | `CLI_GCODE_PATH_CONFLICTS` |
  | −102 | `CLI_GCODE_PATH_IN_UNPRINTABLE_AREA` |
  | −103 | `CLI_FILAMENT_UNPRINTABLE_ON_FIRST_LAYER` |
  | −104 | `CLI_GCODE_PATH_OUTSIDE` |
  | −105 | `CLI_GCODE_IN_WRAPPING_DETECT_AREA` |

  — [BambuStudio Utils.hpp](https://github.com/bambulab/BambuStudio/blob/master/src/libslic3r/Utils.hpp)
- Known pitfall: when external presets aren't applied (reported on a Linux Flatpak build), the CLI falls back to defaults, outputs `"filament_id":"unknown"`, `"total_used_g":0.0` and a wrong time, and rejects some documented options. The thread links GitHub issue #2889 — [Bambu forum: CLI cannot apply external presets](https://forum.bambulab.com/t/cli-cannot-apply-external-presets/197842)
- Stock profiles use inheritance. `Bambu Lab P1S 0.4 nozzle.json` has `"inherits": "fdm_bbl_3dp_001_common"` and `"from": "system"`, plus `include` templates for start, end and filament-change G-code. They therefore aren't "full configs" as `--load-settings` requires — [P1S machine profile](https://github.com/bambulab/BambuStudio/blob/master/resources/profiles/BBL/machine/Bambu%20Lab%20P1S%200.4%20nozzle.json); [BambuStudio wiki](https://github.com/bambulab/BambuStudio/wiki/Command-Line-Usage)

**OrcaSlicer CLI**
- Syntax:
  - Any argument not starting with a dash is an input file, and `--` stops flag parsing.
  - Values can be given as `--flag value` or `--flag=value`.
  - Setting names use hyphens instead of underscores on the command line (e.g. `--layer-height 0.1`).
  — [OrcaSlicer wiki: CLI mode](https://www.orcaslicer.com/wiki/cli/cli_mode)
- Actions:
  - `--export-3mf <file>` (default `output.3mf`)
  - `--export-slicedata <dir>` / `--load-slicedata <dir>` (mutually exclusive)
  - `--export-stl`, `--export-stls <dir>`, `--min-save`
  - `--export-settings <settings.json>` (default `output.json`)
  - `--slice <0|i>`
  - `--mtcpp` (max triangles per plate, default 1,000,000), `--mstpp` (max slicing time per plate, default 300 s)
  - `--no-check`, `--normative-check` (default on)
  - `--info`, `--uptodate`, `--load-defaultfila`, `--pipe <name>`
  — [OrcaSlicer wiki: CLI actions](https://www.orcaslicer.com/wiki/cli/cli_actions)
- Printago's reference, from the OrcaSlicer 2.4.0 `--help` output (article dated 2026-04-16):
  - Flags: `--load-settings "machine.json;process.json"` (machine first, then process), `--load-filaments "f1.json;f2.json"` (one per slot), `--load-filament-ids "1,2,3,1"`, `--load-assemble-list`, `--allow-newer-file`, `--arrange 0`, `--no-check`, `--debug 0–5`.
  - Version notes: 2.4.0 adds `--logfile`; 2.3.2 adds `--allow-mix-temp`.
  - The machine JSON's `printer_model` must match the one in the 3MF's `Metadata/project_settings.config`.
  - Output is `.gcode.3mf` (a ZIP). `Metadata/slice_info.config` holds filament mm and grams per slot, the estimated print time and the layer count. The G-code is at `Metadata/plate_N.gcode`.
  - Thumbnails are blank headless, since they need OpenGL.
  - Each job uses about 200–500 MB of temp files.
  - Pipe progress lines are JSON with `plate_index`, `plate_count`, `plate_percent`, `total_percent`, `message`, `warning`.
  — [Printago: OrcaSlicer CLI reference](https://printago.io/blog/orca-slicer-cli-reference)
- Example invocation:

  ```
  orca-slicer --slice 1 --load-settings "machine.json;process.json" --load-filaments "filament.json" --export-3mf out.gcode.3mf model.3mf
  ```

  For plain STLs and non-Bambu 3MFs, a nonzero `--slice` index is reset to 0 — [Printago: orca](https://printago.io/slicer-cli/orca); [Printago: slice](https://printago.io/slicer-cli/slice)
- Flag names have shifted across Orca 2.x releases, including `--export-3mf` availability, so check `--help` per version — [orca-mcp on PyPI](https://pypi.org/project/orca-mcp/)
- Printago says Bambu Studio 2.6.0's `--slice`, `--load-settings`, `--load-filaments`, `--export-3mf` and `--pipe` are identical to Orca's, and that `result.json` always lands in `--outputdir` (or the CWD) — [Printago: Bambu Studio CLI reference](https://printago.io/blog/bambu-studio-cli-reference); [Printago: outputdir](https://printago.io/slicer-cli/outputdir)

**G-code header (Bambu/Orca)**
- Real P1S file from BambuStudio 01.09.07.52, verbatim:

  ```
  ; HEADER_BLOCK_START
  ; BambuStudio 01.09.07.52
  ; model printing time: 1h 50m 36s; total estimated time: 1h 56m 23s
  ; total layer number: 339
  ; total filament length [mm] : 12354.49
  ; total filament volume [cm^3] : 29716.03
  ; total filament weight [g] : 37.44
  ; filament_density: 1.26,…
  ; max_z_height: 47.00
  ; HEADER_BLOCK_END
  ```

  The `CONFIG_BLOCK` that follows includes `; filament_cost = 24.99,…`, `; filament_type = PLA;…`, `; filament_settings_id = "Bambu PLA Basic @BBL X1C";…` and `; printer_model = Bambu Lab P1S`. The "volume [cm^3]" value is actually mm³: 12354.49 mm × 2.405 mm² ≈ 29716 mm³, and 29.716 cm³ × 1.26 g/cm³ = 37.44 g — [MIT sample G-code](https://fab.cba.mit.edu/classes/863.24/people/JanaHaasDavis/assets/janaprint2_1h56m.gcode)
- Older Bambu Studio builds (01.08.04.51) had print time in the header but no filament weight — [Bambu forum: Add used filament to gcode](https://forum.bambulab.com/t/add-used-filament-to-gcode-file/55112). Users report per-plate weights are approximate and don't always sum to the project total — [Bambu forum: Total filament not calculating correctly](https://forum.bambulab.com/t/total-filament-not-calculating-correctly/106051)

**PrusaSlicer CLI (alternative)**
- Pattern:

  ```
  prusa-slicer --load <profile.ini> [--key value …] --export-gcode --output <out.gcode> <in.stl>
  ```

  `--load` can be repeated, and `--info` gives only generic model info — [Debian manpage prusa-slicer(1)](https://dokk.org/manpages/debian/12/prusa-slicer/prusa-slicer.1.en); [Prusa forum: How to get duration and filament usage on CLI](https://forum.prusa3d.com/forum/prusaslicer/how-to-get-duration-and-filament-usage-on-cli/)
- Time and filament are only in G-code comments. Grep for `estimated printing time (normal mode)` and `filament used [mm]/[cm3]`. Grams appear only if density is set. One wrapper reports estimates differ from real prints by 5–20% — [Prusa forum: estimated time from CLI](https://forum.prusa3d.com/forum/prusaslicer/estimated-time-from-cli/); [@casys/mcp-prusaslicer](https://jsr.io/@casys/mcp-prusaslicer)
- No per-feature breakdown is available from the PrusaSlicer CLI, as of a 2025 forum thread — [Prusa forum: export detailed printing info by CLI](https://forum.prusa3d.com/forum/prusaslicer/export-detailed-printing-info-by-cli/)

**Licensing**
- Licenses from the GitHub API, 2026-10-17: BambuStudio AGPL-3.0, OrcaSlicer AGPL-3.0, PrusaSlicer AGPL-3.0, Tweaker-3 GPL-3.0, trimesh MIT — [bambulab/BambuStudio](https://github.com/bambulab/BambuStudio); [OrcaSlicer/OrcaSlicer](https://github.com/OrcaSlicer/OrcaSlicer); [prusa3d/PrusaSlicer](https://github.com/prusa3d/PrusaSlicer); [Tweaker-3](https://github.com/ChristophSchranz/Tweaker-3)
- FSF GPL FAQ (quoted in search results):
  - Where "separate programs" ends is "a legal question, which ultimately judges will decide".
  - Pipes, sockets and command-line arguments are "communication mechanisms normally used between two separate programs".
  - Exchanging complex internal data structures could make them one program.
  - Mere aggregation on one medium is allowed.
  — [GNU GPL FAQ (MereAggregation / exec)](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation); CiviCRM's AGPL FAQ makes the same separate-programs reading — [CiviCRM License FAQ](https://civicrm.org/about/license/faqs)

### Inferences
- **Recommended integration:**
  - Detect an installed Bambu Studio or OrcaSlicer and run it with `child_process.spawn`. Pass an STL/3MF plus flattened `machine.json`, `process.json` and `filament.json`, and set `--outputdir` to a temp directory.
  - Parse `result.json` for `return_code`, `total_predication` (seconds) and `filaments[].total_used_g`.
  - Fall back to the `HEADER_BLOCK` in `Metadata/plate_1.gcode` inside the `.gcode.3mf` (unzip), or to `slice_info.config`.
  - Delete the temp directory in `finally`.
- **Profile flattening:** walk the `inherits` chain in the app's resources (`resources/profiles/BBL/{machine,process,filament}`), merge child over parent, and drop `inherits`. Alternatively, run `--export-settings` once and reuse the merged JSON. This avoids the "presets ignored → 0 g" failure.
- **Likely macOS executable paths** (not verified from a source): `/Applications/BambuStudio.app/Contents/MacOS/BambuStudio` and `/Applications/OrcaSlicer.app/Contents/MacOS/OrcaSlicer`. Expect blank thumbnails headless, and Gatekeeper/quarantine prompts on first launch from a spawned process.
- **Licensing posture:** don't bundle or link slicer code into the closed app. Calling the user's installed copy as an external process with files is the conventional "separate programs" pattern. Shipping a slicer binary inside the app installer would be "aggregation", but then the app must also distribute the AGPL source for that binary, and changes to it trigger AGPL obligations. The AGPL network clause applies if a modified slicer is offered as a network service. Get legal review before shipping.
- **Cost formula:** cost = Σ_filaments (total_used_g / 1000) × $/kg. Optionally add a machine-time charge, e.g. P1S power of about 0.1–0.2 kWh/h × local rate (heuristic, not sourced), and a failure or overhead factor of about 10% (heuristic). Bambu profiles already carry `filament_cost` (24.99 default) and `filament_density`, so the slicer's own cost field can be used once those values are set.

### Gaps
- The exact JSON schema of `Metadata/slice_info.config` comes only from Printago's description, not verified against a file. Some Bambu builds write it as XML-like config, so verify on a real output.
- OrcaSlicer's `result.json` presence and schema weren't verified from Orca source (only BambuStudio's). Orca is a fork and probably similar.
- No official documentation was found for macOS-specific CLI limitations, beyond blank thumbnails (Printago).
- The FSF GPL FAQ page itself wasn't fetched; the quotes come from search excerpts of it.

## 5. Filament cost (US) and per-part cost

### Takeaway
Bambu's US store lists PLA Basic, PETG HF and ABS at about $22.99 with spool or $19.99 as a refill per 1 kg roll. Multi-roll discounts drop that to $14.99 (4+) or $13.99 (6+) per roll. TPU 95A HF is about $38–42/kg. Bambu profiles default to `filament_cost = 24.99`. Per-part material cost is grams × $/kg / 1000; a typical 40 g PLA bracket is about $0.80–1.00.

### Cited Findings
- US store (us.store.bambulab.com/pages/bambu-filament), via search summary: PETG HF and ABS cost $22.99 with spool and $19.99 as a refill, then $14.99 each for 4+ rolls and $13.99 each for 6+, with discounts applied at checkout — [Bambu Lab US store: Bambu Filament](https://us.store.bambulab.com/pages/bambu-filament)
- TPU 95A HF is shown at $37.79 and $41.99 on the US TPU collection page (which one is the sale price is unclear) — [Bambu US store: TPU](https://us.store.bambulab.com/collections/tpu). A US retailer lists TPU 95A HF 1 kg at $39.00 — [3D Printing USA](https://3dprintingusa.com/collections/bambu-lab-tpu)
- PLA Basic in USD on Bambu's Asia store: $22.99 with spool, $19.99 refill, and a bulk sale "4 rolls from $14.99, 6 rolls from $13.99" — [Bambu Asia store promotion](https://asia.store.bambulab.com/pages/promotions/filament-bulk-sale)
- The default Bambu PLA profile carries `filament_cost = 24.99` ($/kg) and `filament_density = 1.26` — [MIT sample G-code config block](https://fab.cba.mit.edu/classes/863.24/people/JanaHaasDavis/assets/janaprint2_1h56m.gcode)
- Project-level printed-part costs from Berkeley Humanoid Lite: 6512 actuator printed parts cost $4 (US) or $1 (China); 5010 actuator $3 or $1; all printed parts for the robot $200 (US) or $84 (China), out of a total under $5,000 — [arXiv 2504.17249](https://arxiv.org/html/2504.17249v1)

### Inferences
- Default $/kg table for the app (US, Oct 2026): PLA $20, PETG $20, ABS/ASA $20–25, TPU 95A $40, CF-filled grades unknown (see gaps). Let the user override it. Show cost as grams × $/kg plus an optional 10% waste for purge, brim and failures.

### Gaps
- Live US product pages returned 402, so current sale status and exact per-SKU prices (ASA, PLA Basic US, PA6-CF, PAHT-CF, PETG-CF) aren't confirmed. Price data is from a search summary of the US store, not a page fetch.
- No source found for how open robot projects compute per-part cost beyond the Berkeley Humanoid Lite totals.

## 6. How open-source printable robots document printing

### Takeaway
Projects document material, infill and supports, but rarely total print time or filament mass:
- SO-ARM100/101: PLA+ at 15% infill, 0.2 mm layers, supports except on slopes over 45°, and a gauge print first.
- Open Duck Mini v2: PLA at 15%, TPU feet at 40%.
- Berkeley Humanoid Lite: PLA, every part within a 200 mm cube, about $200 of printed parts.
- ToddlerBot: a MakerWorld profile of 11 plates totalling about 67 h, at 0.2 mm layers, 6 walls and 25% infill.

### Cited Findings
- **SO-ARM100/101:**
  - PLA+. Either a 0.4 mm nozzle at 0.2 mm layers or a 0.6 mm nozzle at 0.4 mm layers. 15% infill.
  - Supports everywhere except slopes over 45°, and none inside the horizontal-axis screw holes. Parts are oriented Z-up to minimise supports.
  - Plate files for 220 × 220 (Ender) and 205 × 250 (Prusa/UP) beds.
  - Print "Gauge Zero"/"Gauge Tight" (STS3215) or LEGO gauges first. Bambu A/P/X are listed among sample printers.
  - No print time or filament mass is given.
  — [SO-ARM100 GitHub](https://github.com/TheRobotStudio/SO-ARM100)
- **Open Duck Mini v2:**
  - All parts in standard PLA at 15% infill, except `foot_bottom_tpu` (×2) in TPU at 40%.
  - 51 printed pieces by count of the guide's list.
  - No walls, supports, layer height or print time given.
  - BOM "should be under $400".
  — [Open Duck Mini print guide](https://github.com/apirrone/Open_Duck_Mini/blob/v2/docs/print_guide.md); [Open Duck Mini README](https://github.com/apirrone/Open_Duck_Mini)
- **Berkeley Humanoid Lite:**
  - PLA, FDM, every part within 200 × 200 × 200 mm.
  - Cycloidal gearboxes (housing, cycloid, input and output shafts) are printed.
  - A 60-hour durability test showed slight backlash growth from wear.
  - Printed parts cost about $200 (US).
  - No infill or print time stated.
  — [arXiv 2504.17249](https://arxiv.org/html/2504.17249v1); [RSS 2025 proceedings](https://roboticsproceedings.org/rss21/p062.html)
- **ToddlerBot:** the "Toddlerbot Release V1.0" MakerWorld model lists 67.3 h total over 11 plates, 0.2 mm layer height, 6 walls and 25% infill, in a Bambu Studio profile. The material wasn't visible in the snippet — [MakerWorld search result (ToddlerBot listing)](https://makerworld.com/en/models/1068768). The page itself returned 403, so the model id/URL mapping comes from the search engine and isn't verified.

### Inferences
- Defaults the app's agent can propose for robot parts:
  - Structural: PLA/PLA+ (PETG where warmth or toughness matters), 0.2 mm layers, 15–25% infill, 4–6 walls. ToddlerBot uses 6.
  - Feet: TPU 95A at about 40% infill.
  - Supports only where overhangs exceed 45°, kept out of screw and bearing bores.
  - Ship a fit gauge for servo pockets and bearing seats.
- Projects keep each part at 200–220 mm or less for portability. The P1S's 256 mm allows bigger parts, but designing to a 200–220 mm cube makes the files printable on most hobby printers.
- Reporting total print hours per plate, as ToddlerBot's MakerWorld profile does, is rare. The app can add value by summing `total_predication` across plates.

### Gaps
- LeRobot (the software stack around SO-100/101) and Poppy (Poppy Humanoid; historically SLS/PA12-oriented) weren't researched within the tool budget.
- No total print-time or filament-mass figures were found for SO-101, Open Duck Mini or Berkeley Humanoid Lite.
