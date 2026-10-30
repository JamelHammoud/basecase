# Order-aware assembly checking: fasteners, driver access and removal order

Research date: 2026-10-25. This builds on [`assembly_and_mates.md`](assembly_and_mates.md), with corrections in [`citation_audit.md`](citation_audit.md). It was tested on Ribbit in [`validation_against_basecase.md`](validation_against_basecase.md) §6.

Source tags: **[full]** read in full, **[abs]** abstract only, **[sec]** secondary source.

## Findings

1. **Fastener-first gating plus a fixed point is the established method, and it's polynomial.**
   - Wilson ("Geometric reasoning about assembly tools", *AI* 98, 1998 [abs]) models a tool as a *use volume*. For tools applied after the parts mate, as screwdrivers are, assembly planning stays polynomial.
   - Kiyokawa et al. (arXiv 2509.14564, 2025 [full]) build a contact-connection-constraint graph: fasteners are their own nodes, and a part is admitted only once its fasteners are out. Choosing the part farthest from the base made 100% of initial sequences feasible on a 74-part condenser and a 133-part TV, against 22% and 46% for the older seeding.
   - Smith & Chen (*Adv. Eng. Informatics* 25, 2011 [abs]) use the same recursion: a part's fasteners first, and a fastener can be blocked too.
2. **With translation-only moves and hand tools, removability only grows as parts are taken away.** That gives a unique fixed point, independent of the order tried.
   - Precompute blocker sets once on the final assembly, then run set logic in milliseconds.
   - Our Ribbit prototype took about 3.5 s in one thread for 475 parts.
3. **Commercial tools check driver access per fastener with user-set cylinders, and keep a person in the loop.**
   - DFMPro "Fastener accessibility" takes head Ø, tool Ø and tool height as user values, and can ignore threaded regions [full page].
   - CATIA DMU Fitting is interactive [sec]. I found no automatic per-screw access feature in Siemens Process Simulate.
   - Wrench-type tools need about 60° of swing (30° when the key can be flipped) [sec].
   - Ball-end hex keys enter at up to 20–25° (ISO 2936L listings) [sec].
   - DIN 911 L-keys: 2.5 mm is 56 × 18 mm and 3 mm is 63 × 20 mm (Böllhoff sheet).
4. **False collisions are the main risk.** Mitigations from the sources:
   - Mask expected contacts explicitly: a screw against its own stack, an insert against its host, a servo against its pocket.
   - Penetration per pair must not grow beyond baseline + τ, with τ = 0.05–0.1 mm.
   - Fusion 360 Gallery counts faces within 0.1 mm as contacts.
   - Assemble-Them-All drops pairs with more than 10% volume overlap as untrusted.
   - Rays along the motion, cast both ways, instead of discrete steps. Steps tunnel through 0.84 mm walls, and stepping meshes was far too slow on Ribbit: over 10 minutes, against 1.5 s with rays.
   - GLARE (arXiv 2609.17263 [full]) casts rays to find blockers, then confirms with one collision check. It stays robust to ISO 2768 f/m/c tolerances and allows small interference for threads.
5. **Subassemblies and two-handed moves matter.** Ribbit's foot and ankle servo, shank and knee servo, and the two upper-arm halves block each other in every direction, and only come apart as units.
   - Wilson–Latombe NDBG: a strongly connected component with no outgoing edges is a removable subassembly.
   - Group by the agent's groups, then by the components of the fastened graph.
6. **No published system checks both build order and tool access on generated designs.**
   - MUSE says it "does not evaluate the feasibility of assembly sequences" (Claude Opus 4.7 is overlap-free in 60.4% of cases).
   - CADEngBench checks joints only.
   - An Oct 2026 preprint (arXiv 2610.09777 [abs]) repairs LLM-designed wooden assemblies to be screwdriver-compatible: 86.7% of 60 prompts, 10 built by robots. It has no build order.
7. **Clean negatives with full fastener CAD:**
   - The Voron 2.4 r2 STEP (printed parts, M3 into heat-set inserts, T-nuts) is the closest public match to our domain. Unconfirmed that every screw is modelled.
   - Fusion 360 Gallery Assembly has hole annotations but no fastener labels (non-commercial licence).
   - AutoMate has 92,529 Onshape assemblies.

## Recommended design for `check_assembly` (removal-order part)

1. **Units:**
   - A heat-set insert belongs to its host.
   - A catalog servo is one unit; its horn screws are screws.
   - Cables, belts and TPU skins named as such don't block.
2. **A fastener's stack** is the part its head rests on, the parts its shank passes through, and the receiver. Use the shank zone only: a part sitting above the head is not clamped. Getting this wrong created false cycles on Ribbit.
3. **Blocker sets on the final assembly:**
   - **Driver use volumes,** in up to three options:
     - straight bit plus handle, scaled to the drive size;
     - a ball-end key, tilted 20–25°;
     - an L-key: short arm along the axis, long arm swinging ≥ 60°.
     Each is tested as capsules with three-mesh-bvh shapecast, starting above the head.
   - **Screw extraction** along its axis.
   - **Part moves** along its fastener axes, its contact normals and ±x/y/z, using rays from its vertices plus reverse rays, both sampled deterministically in the part's own frame.
   - **Catalog meshes** are often multi-body and not watertight: use their convex pieces or voxel occupancy for "inside" tests.
4. **Fixed point** over screws, parts and units (groups, fastened components, pairs that block each other). Then rerun inside each removed unit to get the bench build.
5. **Verdicts per screw:**
   - **PASS:** clear in the final assembly.
   - **PASS with a build note:** "drive before installing X, Y".
   - **WARN:** only a ball-end or L-key fits, clearance under 0.3 mm, or it depended on masking an overlap.
   - **FAIL:** only when part of a provable cycle, or when blocked by fixed material or by its own stack. Report the cycle in words.
   - **Unknown:** stuck without a cycle (rotation, snaps or bayonets may be needed), or an untrusted overlap is involved.
6. **Fixes to suggest:**
   - an access hole of at least the bit diameter + 1 mm along the axis;
   - flip the screw to the nut side;
   - move it into a module so it's driven on the bench;
   - a longer bit.
7. **Self-tests:**
   - Seeded faults (roadmap 1.2).
   - Mirror consistency: mirrored designs must give mirrored verdicts.
   - Clean negatives: Voron, SO-101 and Open Duck Mini, if their CAD with fasteners can be imported.

## Known failure modes

- **Rotational insertion** (a servo tilted into its pocket, captive nuts slid into traps, snaps) reads as stuck. Report Unknown, and add nut-trap slot axes as candidate directions.
- **Gravity, holding parts while driving, and soldering-iron access for inserts** aren't modelled. Report them as WARN after the order is chosen.
- **FAIL is only as complete as the motion model.** That's why a FAIL needs a cycle or fixed-material explanation.

## Notes added later

- **Precedent for `fasten`.** Onshape's standard content sizes a fastener automatically from a selected circular edge or cylindrical face, rounding down to avoid interference, and its iScrews add-on mates placed screws automatically ([Onshape standard content](https://cad.onshape.com/help/Content/Assembly/standard_content.htm), [iScrews guide](https://grandavehousing.calpoly.edu/news/iscrews-for-onshape-a-guide)) [sec]. Professional CAD already treats "pick a hole, get the right screw" as a tool, not a manual placement.
- **Clean negatives are still open.** A search found no public printed robot whose CAD models every screw and insert. Voron 2.4 (a printer) and Upkie, a wheeled balancer whose build docs use M3 inserts ([wiki](https://github.com/upkie/upkie/wiki/2)-3D-printing)), are the nearest leads. Your own builds are the best clean negatives.
