# Assemblability, mates and interfaces: making robots that can be put together

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Scope: why LLM-designed assemblies can't be put together, what the field does about it, and what a deterministic checker in Basecase can compute. Builds on `docs/research/LLM robot design and BOM/` (which covers ArtiCAD, AssemCAD and Agentic Robot Creation at summary level). Items marked **[unverified]** were not confirmed from a primary source.

## Takeaway

No published system or model gets assemblability right, and no benchmark even measures it. In ShanghaiTech's Agentic Robot Creation (arXiv 2610.17881), every one of four frontier models failed the same six of 23 pre-fabrication checks: tool access (A06), fastener interfaces (A07), static assembly clearance (A09), fit tolerance (A05), continuous clearance (B05) and cable routing (C05). MUSE (arXiv 2605.28579), the strongest multi-component CAD benchmark, leaves assembly sequence, insertion paths and tool access out of scope. GPT-5 and Gemini 2.5 Pro reach under 58% part accuracy on 2–5 part CAD assemblies (CADMATE, ACL 2026).

The answer is classical geometry, not a better prompt:
1. **Assembly by disassembly** over directional blocking graphs. Real products come apart with one or a few straight moves, so straight-line translation sweeps decide almost every case.
2. **Correct by construction**: typed ports and closed-form mates, connectors decided before geometry, and a fasten operation that sizes the screw and cuts every hole.
3. **Relations, not coordinates**: every controlled ablation found favours relational placement for physical validity.

## Evidence

### Assembly planning

| Work | What it shows | Numbers |
|---|---|---|
| Wilson & Latombe, "Geometric reasoning about assembly" (AIJ 71, 1994) | Non-directional blocking graph (NDBG): for each direction d, an edge p→q means q blocks p moving along d; a strongly connected component with no outgoing edges is a removable subassembly. Polynomial for one-step translations | Finding *a* feasible sequence is easy; an *optimal* one is NP-hard to approximate. Goldwasser's STAAT ran 20–40 parts. [from prior knowledge] |
| Assemble-Them-All (Tian et al., SIGGRAPH Asia 2022), [arXiv](https://arxiv.org/abs/2211.03977), [repo](https://github.com/yunshengtian/Assemble-Them-All) | Physics-based disassembly with BFS over pushes along ±x/y/z, reversed into an assembly | Two-part: 99.8% vs RRT 84.5%. Screws: 75.0% vs 0–12.5% for baselines. Geometric baselines on multi-part sets: 90 / 78 / 44% (small / medium / large); its method 99 / 97 / 77%. 53-part engine in 5 minutes. "Most real-world assemblies are designed to be easily assembled/disassembled within one or a few actions" |
| ASAP (ICRA 2024), [arXiv](https://arxiv.org/abs/2309.16909), [repo](https://github.com/yunshengtian/ASAP) | Sequences with gravity stability; tries the 6 axis pushes per part (`get_R3_actions`); per-pair collision threshold = initial penetration + 0.01 | 67.1% (GNN) / 66.7% (outside-in heuristic) on 240 assemblies vs 30.4% for Assemble-Them-All. The simple heuristic is as good as the learned one |
| Agentic Robot Creation (2610.17881) | The only robot-design paper with explicit assembly checks | Tool access A06: coaxial bit r 2 mm × 30 mm plus handle r 6 mm × 60 mm. Horn engagement DC03: L − g ∈ (0, 3] mm. Clearance budget 0.4 manufacturing + 0.1 assembly + 0.2 elastic + 0.05 thermal + 0.05 model + 0.2 safety mm |
| LegoGPT / BrickGPT (2505.05469) | Validity check with physics rollback during generation | Stable designs 12.8% → 24.0% (rejection) → 98.8% (rollback) |

### Correct-by-construction assemblies

- **AssemCAD** (2607.05123): spec of Parts, Mates and Axioms. A port is (name, type, frame L ∈ SE(3), params) with 12 types (BOLT_SEAT, SHAFT, BORE, GEAR_MESH, THREAD_*, PRESS_FIT, FLAT_FACE, CLEARANCE_HOLE, CBORE_SEAT, HOLE, SNAP_FIT) and a compatibility matrix. Mates solve in closed form, T = L_b · R_flip · R_α · L_c⁻¹. Each port is checked against the B-rep by solid classification (a bore's axis samples must be outside material, a shaft's inside). AssemBench (120 tasks): SR 89.2 / APR 87.5 vs GPT-5.5 79.2 / 66.7. Failure taxonomy: "phantom bore" from the XZ workplane sign, disjoint compounds, all parts coincident, port-frame surprises. No repo, no ablations.
- **ArtiCAD** (2604.10992): connectors (origin, z, x, label in the part frame) fixed at plan time; deterministic alignment; a router that sends failures back to code (one part) or design (the connector plan). Late relations 89.2% vs 100% success; no rollback 95.0%.
- **Articraft** (2605.15187, [repo](https://github.com/articraftresearch/Articraft), Apache-2.0): `model.joint(name, base.at(face/edge/axis), child.at(...))`, with a `TestContext` of `expect_contact`, `expect_gap`, `expect_within`, `expect_coaxial`, `*_at_poses`, `allow_overlap(reason)` and `fail_if_articulation_separates_child`. "Use topology queries instead of copied coordinates." 91.8% of 10,909 assets kept at $1.14 per attempt; no renders by default.
- **text-to-cad** ([repo](https://github.com/earthtojake/text-to-cad), MIT, 23k stars): practitioner skill for build123d. Placement by functional datums and native joints (`RigidJoint.connect_to`); alignment checked by measuring signed gap and parallel error between the selected mating faces; kinematics as typed mates (revolute, slider, cylindrical, fastened) with required finite limits. Its rule: "an untested relationship has no verdict."

### Relational vs absolute placement

| Study | Relational | Absolute |
|---|---|---|
| Real2Code, pivot error at 4+ parts ([arXiv](https://arxiv.org/abs/2406.08474)) | 0.03–0.04 (pick an OBB edge) | 0.6–0.7 (regress numbers) |
| BesiegeField, Claude Opus 4 valid files ([arXiv](https://arxiv.org/abs/2510.14980)) | 8/8 (construction tree, parent face) | 0/8 (global poses) |
| Holodeck, human MRR ([arXiv](https://arxiv.org/abs/2312.09067)) | 0.706 | 0.364 (random 0.369) |
| LayoutVLM in-bounds rate ([arXiv](https://arxiv.org/abs/2412.02193)) | 94.9 | 14.1 without constraints |
| SpatialGrammar collision rate, same Claude Sonnet 4 ([arXiv](https://arxiv.org/abs/2604.27555)) | 13.6% | 66.7% |
| ArtiCAD success | 100% (early) | 89.2% (late) |
| Kinematify pivot error ([arXiv](https://arxiv.org/abs/2511.01294)) | 0.23 (contact-region pivots) | 1.34 |

Caveats: keep numeric starting values (LayoutVLM without numeric init drops to PSA 41.0); repair in program-parameter space, not by nudging objects (PSDL); 2026 models are much better at absolute layout than 2023 ones (R3L, 4.3% collisions), so the gain is mostly physical validity.

**Rotations are the riskiest number the agent writes.** VLM angle answers collapse to {0, 90, 180}° in 91.8–100% of cases, even without the image (OR-Bench, 2610.05715); mental rotation is at chance (SpatialViz). Every working layout system restricts orientation (four yaws, attach faces, point-towards). Basecase's own chats show Rx(±90) sign confusion and flipped servos after mirroring.

**Discrete choices to the LLM, continuous values to code.** AssemCAD's factories, the 2026 LLM-plus-optimizer linkage paper (error down up to 68%), GearFormer and LInK all split it this way. CAD-bench (ICML 2026 workshop): a right-angle gearbox *builds* 96.9% of the time and *works* 4.0% **[via summary]**.

### Design for assembly (DFA) rules

- Boothroyd–Dewhurst: a part is theoretically necessary only if it moves relative to the parts already assembled, must be a different material, or must be separate so other parts can be assembled. Design efficiency E = N_min · 3 s / T_total. Main levers: fewer parts, fewer insertion directions. Chart times (about 8–10 s per hand-driven screw, 2–3 s per snap) **[unverified]**.
- Thread engagement: about 1×D in steel, 1.5×D in cast iron or brass, 2×D in aluminium and plastics, 2.5×D in tapped plastic ([RoyMech](https://roymech.org/Useful_Tables/Screws/Thread_Calcs.html)). Through a nut, at least one full thread protruding.
- Heat-set inserts (repo research): M3 hole about 4.1–4.2 mm modeled, blind depth ≥ insert length + 1 mm, ≥ 1.6 mm wall around it, axis along print Z, about 1,400 N pull-out in PLA.
- Snap fits: cantilever deflection y = 0.67 · ε · L² / h; PLA permissible strain 4–8% per Fictiv looks optimistic; halve it for cantilevers printed along Z.
- Commercial CAD separates **expected** overlaps (threads in a tapped hole) from real interference, and sizes fasteners from the hole stack (SolidWorks Smart Fasteners; Interference Detection's Fasteners folder; Hole Alignment). Onshape has no collision during motion.

## What Basecase has today (checked in the code)

- `electron/cad-agent-prompt.mjs` "Design for assembly" asks the agent to write a build order and check each step with `look`: the weakest verifier available (VLM self-QA is about 65% accurate).
- `check_scene` (`electron/cad-mcp/inspectTools.mjs`) covers interference at the modeled pose, coplanar faces, floating parts (bounding-box gap ≤ 1 mm, which missed real 0.005–0.8 mm gaps in part generation), primitives and left/right twins. Nothing tests insertion paths, driver access, screw hosts or retention.
- `src/three/analysis/collide.ts` (BVH point samples, 0.3 mm tolerance) and `sweep.ts` (rotational sweeps about a joint with a baseline of ignored overlaps) exist. A translational sweep doesn't.
- The build guide (`src/guide/guideOrder.ts`, `guideExplode.ts`) orders parts by bounding-box contacts and cover words in names, and explodes fasteners along their axis. `fastenerHomes` and `insertHosts` pair screws with hosts. No step is collision-checked, so the PDF can show impossible steps.
- Catalog `mounting` in `src/data/components.ts` is free text, so fastener chains into catalog parts can't be checked.
- `mirrorParts` (`src/agent/agentMirror.ts`) mirrors a catalog part's position and conjugates its rotation (S·R·S) but can't mirror its mesh. A chiral part like the STS3215 (output 12.5 mm off the case center) lands 25 mm off on the mirrored side, matching "right-side axes were off by 25 mm" in saved chats.

## Proposal

### `check_assembly` (MCP tool and a `verify_design` row)

Runs in the analysis worker pool over world meshes, hardware records, joints, materials and groups. Pure functions over plain data, testable in Node.

1. **Contact graph and normals.** Pairs within 0.3–0.6 mm, plus declared expected overlaps (shank in insert, insert in boss, servo in pocket, bearing press fit). Sample contact normals with BVH `closestPointToPoint`.
2. **Fastener chains.** Ray along each screw axis from under the head to the tip: clamped stack and grip, host where the thread ends (insert, coaxial nut, catalog tapped port, bare plastic), engagement length, tip into air or a hole bottom, head seated, shank passing through a part with no clearance hole, inserts and nuts with no screw. Suggest the stock length from `hardware.ts`.
3. **Held-by graph.** Edges are fasteners, press fits, declared snaps and capture. A part with no path to the base is "held by nothing"; contact alone never counts. Also try ±2° about each single screw axis to catch parts that spin on one screw.
4. **Disassembly by straight translations (NDBG-lite).** Candidate directions per part: ±world axes, ±its OBB axes, ±fastener axes, the center of its local freedom cone (d · n ≥ 0 for all contact normals), plus a declared `insert_from`. Sweep with conservative advancement or small steps. A pair's initial overlap is masked only if it is an expected relation, and penetration must not increase along the path. Don't reuse `sweepClashes`' ignore-every-baseline-pair approach: a shell already overlapping a servo would slide off "freely". Fasteners come out first along their axis, then covers, then outside-in (ASAP's heuristic). Mutually blocked sets that are free as a whole come off as a subassembly.
5. **Driver access** at the step each screw goes in, against the parts present then: bit r = max(2 mm, recess) × 30 mm, handle r = 6 mm × 60 mm (A06); optional 15° tilt for ball-end hex or Torx and an L-key swing.
6. **Service paths.** Parts tagged `service` (battery, SD card) report how many parts come off before them; a battery that can't pass its hatch is blocked in every direction once the hatch is gone.
7. **DFA line.** Part count, N_min, screw sizes, insertion directions, estimated time.
8. **Range of motion.** The existing sweeps, plus "a child stays in contact with its parent across the range".

Report at most 12 lines, worst first, part names not ids, each with the fix:

```
Assembly: FAIL (4 problems). Order found for 61 of 64 parts; 5 insertion directions; 2 screw sizes.
1. Head back can't come off: blocked in every direction. Along −Y the Pi 5 blocks it after 12 mm (3.4 mm deep). Move the Pi 4 mm forward or split the shell front/back.
2. M3 × 8 at left hip bracket threads into nothing: tip ends 1.2 mm past the bracket in air. Use M3 × 12 into hardware:heat_insert|M3|4.
3. M3 × 10 at torso front cover: driver blocked by torso frame 22 mm out at step 18. Drive it from inside or add a Ø7 hole.
4. Battery is held by nothing. Add a strap or a screwed retainer.
```

The proven order replaces `guideOrder`'s heuristics, so the build guide only shows sequences that work. Limits: straight moves only (snaps need declared deflection), no cables, point sampling misses penetrations under about 0.3 mm, no gravity stability.

### `fasten` / `place_fasteners` (correct by construction)

`{ screw: 'M3', through: [parts], into: insert | nut | port, at, from: '+z' }`. The app computes grip, picks the stock length inside the engagement window (insert: thread through ≥ 75% of the insert, tip ≥ 0.5 mm short of the bottom; nut: 1 pitch to 1×D proud; tapped port ≥ 1.5×D), places screw, washer and insert or nut, cuts the clearance hole, counterbore and insert hole or nut trap (BOSL2 `screw_hole` / `heatset_hole` sizes) or returns the cutter snippets in each part's frame, records the fastening for `check_assembly`, and runs the driver-access sweep immediately.

Needs structured mounting ports on catalog components: servo output and horn hole circle, case screws, board holes, camera mounts, from the datasheets already cited.

### Ports and `mate`

- Catalog parts carry authored ports; hardware gets head seat, shank axis and thread zone automatically; `model_part` exports ports (OpenSCAD `echo("PORT", …)` parsed by the kernel, BOSL2 `named_anchor`s; replicad returns `{ shape, ports }`). Each port is verified against the mesh like AssemCAD.
- `mate { part, port, to, to_port, type: fastened | coaxial | face_to_face | gear_mesh | press_fit | slider, angle (multiples of 90° by default), offset, flip }`, solved in closed form. Revolute and slider mates become joints. Absolute position and rotation stay for free-standing parts and as starting values.
- Mirroring a catalog part becomes mirroring its mate: the copy keeps an unmirrored mesh and is placed by its datum (output axis) on the mirrored port, which fixes the 25 mm bug for good.

### Skeleton first and interface contracts

- `define_skeleton` before the block-out: joint frames (origin, axis, zero), link lengths, the actuator per joint, symmetric pairs, a reserved envelope per link. `robot_skeleton` already yields this for published robots. Block-out parts are placed in a joint frame (`{ frame: 'left_knee', offset, spin }`), mirroring becomes skeleton mirroring, and a link-length change moves everything attached.
- `define_interfaces` after the block-out, before part designers start: id, two owners, a frame on the skeleton, kind (bolt pattern, servo horn, bearing seat, shaft, flat face, cable pass, envelope), params, male/female side, tolerance; a keep-in envelope per subassembly and shared keep-out volumes (each moving link's swept range, cable channels). `check_interfaces(subassembly)` runs before a designer hands back; a failure blocks handback unless it files a change request. MUSE shows that correctly typed interfaces can still fit badly, so check geometry, not just type.

### Mechanism generators

Each returns geometry, ports, mates, fasteners, an insertion direction and its own test: gear pairs, racks, worms and planetaries (BOSL2, checked for center distance and backlash), GT2 belt reductions, four-bar linkages (closed-form Freudenstein with Grashof and transmission-angle checks; needs MuJoCo equality constraints for closed loops), a servo joint module with idler bearing, a shell seam with lip, bosses and a declared split direction, a battery bay and hatch with a tested service path, snap pins, knuckle hinges, dovetails, threaded rods. BOSL2 is already vendored; avoid GPL libraries.

## Evals

- **Detector validity (seconds, no agent):** take known-good assemblies (hand-built fixtures in code, and verified agent builds) and inject faults: shorten a screw 3 mm, delete an insert, add a rib over a screw head, widen a shell lip past its opening, grow a board 2 mm past its hatch, delete a retainer. Target ≥ 95% recall and zero FAILs on the clean originals. Cross-check the straight-line planner on Assemble-Them-All's multi-part set (expect about the 90% geometric-baseline rate on small assemblies).
- **Agent effect:** build tasks (`build-humanoid` plus a desk pet with a battery hatch and a gripper) with and without the tools: share of runs with a complete order, fastener-chain errors, inaccessible screws and unheld parts per run, DFA index, share of screws placed with `fasten`.

## Unverified and open

- No paper measures LLM assemblability as a benchmark metric.
- NDBG theory, Boothroyd chart times, engagement and transmission-angle thresholds are textbook rules of thumb, not re-read this session.
- AssemCAD's Claude-4.8 APR of 0.83 looks like a baseline artifact; no ablations. Articraft's SDK has no numeric ablation.
- Driver envelope dimensions: no standard found; A06's are the best published.
