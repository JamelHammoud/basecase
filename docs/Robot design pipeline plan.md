# Robot design pipeline: build plan

Goal: design a brand-new robot in the studio that you can print on a Bambu Lab P1S, buy from a BOM of US Amazon links with dated prices and a budget, and build now. The first test is a small Sprout-class humanoid.

Decisions so far:
- **Amazon:** dated checks, no live prices. Each purchasable line stores the exact product (ASIN), the price and pack size you saw, and the check date. The app never scrapes Amazon, and the agent never invents an ASIN or a price.
- **Slicer:** no slicer integration yet. The app estimates printability, filament and print time itself, and labels them as estimates.
- **First robot:** a small humanoid in Sprout's design language, sized for the P1S.

Grounding: [`LLM robot design and BOM.md`](LLM%20robot%20design%20and%20BOM.md) (the research report). Nothing is borrowed from other projects on this machine; every design rule comes from independent research.

## What the research says matters most

1. **Every LLM-designed robot that was actually built needed hand fixes.** The closest work, ShanghaiTech's Agentic Robot Creation (Oct 2026), gated printing on a 23-item fabrication checklist. Its best model passed only 15 of 23, and the misses were the classic ones: missing mounts, links intersecting, too little clearance around actuators.
2. **Numeric checks beat visual self-critique.** A model asked to verify its own renders answered its own questions correctly only about 65% of the time. Compile feedback, per-part pass/fail tests and best-of-N candidates moved results the most.
3. **Declaring joints at design time works.** In ArtiCAD it gave 100% success vs 89% when joints were added afterwards. Joints are also what make torque, range and stability checks possible.
4. **Professional printable robots share the same habits:**
   - bought-in actuators with a bearing on the far side of every joint
   - a torque table with real margins
   - inserts and through-bolts across weak layer lines
   - few screw sizes, cable paths, an electronics bay, and covers over the frame
5. **The P1S slicer profile is the real build volume:** 256 × 256 mm with an 18 × 28 mm keep-out at the front left, and 250 mm high (not 256).

## Phases

### 1. Project, BOM and budget
- **Project settings per scene:** printer (P1S), default material (PLA; TPU for soles), budget in USD.
- **BOM built from the scene, never from agent text.** Catalog components are counted by part; hardware by exact spec, rounded up to packs; printed parts become filament grams per material, then spools.
- **Purchase records** (`library/purchases.json`, app-wide). Each record holds the Amazon ASIN, the listing title, pack quantity, the price seen, the check date and a note. Status is Checked, Stale (over 60 days old) or Not checked; unchecked lines show "Check price" and never count toward a confirmed total.
- **Build tab in the right panel:**
  - budget bar (confirmed total vs budget, plus unpriced lines)
  - Parts to Buy (quantity, packs, unit and line price, checked date, open link, Check… to record what you saw)
  - Printed Parts (count, grams, estimated hours, plates)
  - Export BOM (CSV spreadsheet and Markdown)
- **Agent tools:** `get_bom` (totals vs budget, unpriced lines, over-budget warnings) and the project brief in the prompt, so the agent designs to the budget.

### 2. P1S printability
For every printed part:
- **Orientation:** the best of the axis-aligned orientations, chosen for least overhang area and a flat base.
- **Bed fit:** 256 × 256 × 250 mm with the keep-out zone. Parts that don't fit get a split suggestion.
- **Overhangs:** area beyond 45°, and an estimate of the support needed.
- **Thin walls:** anything under 0.8 mm, found by inward rays on the BVH.
- **Filament and time:** grams from walls, top and bottom shells and infill (15% default), using PLA 1.24, PETG 1.27 and TPU 1.21 g/cm³; hours from a flow-rate model. Both are labelled estimates.
- **Plates:** parts packed per plate.

The agent gets `check_printability`; the Build tab lists the issues.

### 3. Joints and engineering checks
- **`define_joints`.** The agent declares every joint: name, type (revolute/fixed), axis, origin, parent and child parts, the actuator (catalog servo), and its range.
- **Checks on top of the joints:**
  - Mass and centre of mass: printed volume × density, plus catalog component weights.
  - Static torque per joint: worst-case gravity pose over the range, against the servo's continuous torque, with 2× margin for arms and 3× for legs.
  - Joint sweep: interference across the range, using exact meshes.
  - Stability: centre of mass over the support polygon, with tipping angle.
- **Results** come back as a table where each check passes, fails with a measured number, or says why it couldn't run. The agent gets `verify_design`.

### 4. Production-grade fidelity
- **Fabrication checklist** in the prompt and in `verify_design`. Where possible each item is a numeric check:
  - two-sided joint support (horn plus idler bearing)
  - servo held by its mounting pattern, not by friction
  - screw length vs clamped thickness plus thread engagement
  - insert hole sizes, and a 0.2–0.3 mm per side clearance around actuators across the range
  - cable path and strain relief at each joint
  - electronics bay with access and a battery that can be swapped
  - covers that are separate parts with reveals
  - no interference, no flush overlaps, no leftover blocks
- **Per-part acceptance in `model_part`.** The agent states the target size, hole count and wall; the tool rejects parts that miss.
- **Joint modules:** a bus-servo joint library (STS3215 bracket + horn + MR/608 idler bearing, with inserts), so every joint starts from a real, buildable mechanism.
- **Design-language brief:** a style spec for the robot, written before modeling, so shells, caps, gaskets and colours stay consistent.

### 5. Design the humanoid
1. Brief:
   - size ~50 cm on the P1S
   - bus servos with arms, legs and neck
   - Pi 5 + camera + IMU + battery
   - claw grippers
   - Sprout-style shells, joint caps and visor head
   - a budget target
2. Run the agent in the app through the same headless harness as the benchmark.
3. Iterate on whatever the checks and renders show.
4. Deliver renders, the BOM with totals (unchecked prices flagged for your check), the printability report and the verification table.

## Acceptance
- **BOM:** every line traces to a catalog key, and no ASIN or price comes from the agent.
- **Totals:** confirmed totals add up only from checked lines.
- **Printability:** every printed part fits the P1S bed, or is flagged with a split.
- **Verification:** `verify_design` returns PASS or a named failure for every check, and the humanoid passes torque, interference and stability before it's called buildable.
- **Quality bar:** build and lint pass, AGENTS.md is updated, and new UI follows the design system.
