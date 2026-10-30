# Serviceability and when to split a part

Research date: 2026-10-25. This was prompted by your note that Ribbit wasn't serviceable until you asked, and that the agent prefers one-piece parts. It was tested on Ribbit and Sprout in [`validation_against_basecase.md`](validation_against_basecase.md) §17.

Source tags: **[P]** primary text read, **[S]** secondary, **[A]** abstract only, **[R]** recollection, unverified.

## How to count service effort

**A step**, following EN 45554 and the JRC and French repair-score methods [P]:
- **What counts as one step:**
  - Removing one part, or one bundle that comes out together.
  - A tool change.
  - Fasteners removed in a row with the same tool, which count together as one step (JRC: eight Phillips screws are one step).
  - Unplugging connectors in a row, likewise.
- **Other rules:**
  - Removing by hand is a "no tools" step.
  - Calibration needed after a swap adds a step.
  - Counting starts from the fully assembled product.

**Published bands:**

| Scheme | Steps → score | Tools | Fasteners |
|---|---|---|---|
| JRC method behind the EU repairability index [P] | ≤2 = 5; 3–5 = 4; 6–10 = 3; 11–15 = 2; >15 = 1 | none 5, basic 4, supplied 2–3, commercial 1 | reusable 5, removable 1 |
| French repairability index, smartphones [P] | 1–5 = 3; 6–10 = 2; 11–15 = 1; ≥16 = 0 | tool-free or common 4, specific 2, proprietary 1 | removable and reusable 2, removable only 1 |

**EU battery rule** (2023/1542 Art. 11, from Feb 2027) [S]: portable batteries must be removable and replaceable by the end user with commercially available tools. No proprietary tools, heat or solvents.

## How real robots do it

- **Fauna Sprout** (arXiv 2601.18963) [P], the robot Ribbit was modelled on:
  - a **swappable battery** for daily use, and a rear handle;
  - standard cells with a commercial battery management system "to support serviceability";
  - motor modules plugged into a backplane.
- **Petoi Bittle** [S]: the battery slides into a belly track and plugs into a keyed socket, with no tools.
- **Unitree G1 / Go2** [S]: quick-release, tool-free packs; Go2's bay takes packs of different capacity.
- **Open Duck Mini v2** [P]: the battery pack is screwed to the *outside* of the trunk through M3 inserts. The trunk is two halves held by 2 × M3 × 10 screws.
- **ToddlerBot** [P]: a broken part is fixed with 21 min of printing and 14 min of assembly, calibration included. End effectors swap in under 2 minutes, and each part is designed to be replaced on its own.
- **A product redesign** (De Fazio et al. 2021, the Disassembly Map) [P]: grouping the service parts and moving their screws to the outside cut depth from 8 steps to 1, and disassembly time by 38–60%.

## A service check for a small printed robot

These thresholds are our synthesis of the bands above:

| Item | Pass | Fail |
|---|---|---|
| Battery | ≤ 2 steps, tool-free or one basic tool already used on the robot; not glued; connector reachable once open | > 5 steps, or reaching it removes any part that carries a joint, or a structural part |
| Electronics (compute, regulators, power board as one tray) | ≤ 5 steps, one tool, nothing actuated removed | > 10 steps |
| Each servo | ≤ 10 steps, touching no servo outside its joint and the two links next to it | A torso servo or board needs another limb removed |
| Printed links that break in falls | Swappable without removing the neighbouring links' servos | — |
| Fasteners opened for service | Into inserts or nuts (reusable), with a straight driver path from outside | Self-tapping into plastic for anything serviced; heads hidden under other parts |
| Wiring | Every cable from a serviced item ends at a connector inside the opened volume | A plug trapped behind a closed hole |

**Ribbit today:** the battery has no path at all. The front/back split the check suggests makes the Pi one part away (§17), but the battery stays behind the electronics stack.

## When to split a part

The default is one piece. Under DFA, a part is separate only if it moves, is a different material, or must be separate so other parts can be assembled or *serviced*. Service is the third reason. Split only when one of these fires:

1. **It doesn't fit the printer** (P1S 256 × 256 mm, minus the keep-out). Use the fewest planar cuts, with connectors at each cut (Chopper).
2. **It encloses a serviced part.**
   - Make a clamshell or a body plus a cover, with the parting plane perpendicular to the item's removal direction.
   - The cover goes on the service side (back or underside, not the side that carries limbs), and its screws are reached from outside.
   - Removing the cover must not unload a joint.
   - The check's split suggestion finds this plane.
3. **A captive part can't be inserted** (a servo, a bearing). Split through the actuator's output axis so it drops in and both halves clamp it.
4. **Print strength.** Layers can be up to about 10× weaker between them. If two regions need different print orientations, split at the boundary.
5. **Unremovable supports in a closed cavity.** Split so each half prints face-down on its open rim.
6. **Group what gets serviced.** The battery, compute and power go on one tray behind one cover, with connectors at the edge facing the cover.
7. **Keep structure and covers apart.** Load-bearing frames stay whole and are never the part you open. Covers split and come off.
8. **Seams** go on creases or under details, with a lip or dowels (about 0.2 mm printed clearance), and screws into inserts in the half that stays.
9. **Don't split without a reason.** A shell that holds nothing serviced and fits the bed stays one piece.
10. **The battery never sits inside a structural clamshell.** Give it a bay with a door, a slide-in tray, a latch, or at least an outside strap.

## What to tell the agent at the block-out

1. List the serviceable items (battery always; compute, power, each servo, breakable links), each with a removal direction and a target depth.
2. Choose the torso's service face, and put the battery and the electronics tray behind one cover there, with screws facing out.
3. For each shell, decide: frame (whole) or cover (splits). Name the split rule that justifies each cut.
4. For each servo pocket, put the split through the output axis.
5. Plan print orientation and bed fit, 1–2 screw sizes into inserts, and connectors inside the opened volume.
6. Report the computed step count for each serviced item, and fix the design until it meets the targets.

## Evidence that LLM CAD agents make monolithic parts

- **AssemCAD** (arXiv 2607.05123) [P, Tables 3–4, verified]: on AssemBench, the share of runnable programs that keep the intended assembly structure, as scored by an LLM code judge (≥ 4 of 5):

  | Model | Preservation rate (%) |
  |---|---|
  | GPT-5.5 | 66.7 |
  | Claude 4.8 | 0.83 |
  | Claude Opus 4.8 | 0.00 |
  | Claude 4.8 inside AssemCAD's specification-first framework | **82.5** |

  The framework first writes a spec of typed parts, ports and mates, then uses a deterministic interface library. The paper doesn't say why plain Claude scores near zero.
- **ArtiCAD** (arXiv 2604.10992) [P]: a single-script baseline "often collapses [a drawer] into a solid block". Planning components and connectors before geometry gave 100% success, against 89.2% when they were planned late.
- **Physics-in-the-Loop** (arXiv 2605.19717) [A]: disconnected parts were the most common failure.
- **Our chats:** by name, 29 of 49 enclosing parts were single pieces. Geometrically, the check flags 4 enclosing parts in Ribbit and 4 in Sprout.

**The shared lesson:** plan the decomposition before the geometry (parts, connectors, a joint tree, split planes, service faces), and check between stages so a deterministic check can send the plan back. That is roadmap item 1.5b plus the service check.

## Key sources

- JRC repair score (JRC128672): https://susproc.jrc.ec.europa.eu/product-bureau/sites/default/files/2021-12/JRC_Report_Repair_Score_Smartphone_Tablets_v2.pdf
- French index (TRIS notification): https://technical-regulation-information-system.ec.europa.eu/en/notification/18539/text/D/EN
- Disassembly Map (De Fazio et al. 2021): https://www.circonl.nl/resources/uploads/2022/02/JoCP21-The-disassembly-map.pdf
- Fauna Sprout: https://arxiv.org/html/2601.18963v1
- ToddlerBot: https://arxiv.org/html/2502.00893v4
- Open Duck Mini assembly guide: https://github.com/apirrone/Open_Duck_Mini/blob/v2/docs/assembly_guide.md
- AssemCAD: https://arxiv.org/html/2607.05123
- ArtiCAD: https://arxiv.org/html/2604.10992v1
- Chopper: https://pixl.cs.princeton.edu/pubs/Luo_2012_CPM/index.php
- Interlayer strength (Kuznetsov et al. 2018): https://pmc.ncbi.nlm.nih.gov/articles/PMC6414919
