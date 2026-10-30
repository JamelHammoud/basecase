# Checking the roadmap against Basecase's own scenes

Research date: 2026-10-25. These experiments test the roadmap's claims on the scenes you saved, instead of trusting papers. The probe scripts are in `scratch/` (gitignored), listed with their options in `scratch/README-agent-harness-probes.md`. Run them with `npm run scratch -- scratch/<file>`. Sections 1–4 are the first round; 5 onwards the second. Ribbit was re-saved at 15:33 by another chat that was splitting its torso shell (§22), with 315 screws. Results before that use the 309-screw version.

Test scenes:
- **Ribbit** (`library/scenes/my-robotics-design.json`): 475 parts in all: 47 printed, 26 catalog, 402 hardware (309 screws, 91 heat-set inserts), plus 21 joints. This is the scene after your critiques ("How would I actually build the head?", "Do a full check on the robot", "I am about to actually print and build this for real").
- **Sprout** (`scene-mv94cy96.json`): 59 printed parts and no hardware at all. That matches the critique "How does the upper arm connect? … there's no screws".

## 1. A fastener probe

For each screw, the probe takes the axis from the part's rotation (local +Y points toward the head) and the head and tip from the mesh profile. Then it checks:
- whether the tip ends in an insert, in material, or in air;
- whether the shank runs through solid material;
- whether the underside of the head rests on a surface (sampled on a ring between the shank and head radius);
- what lies along the driver line within 30 mm.

The whole scene builds and runs in about 1.3 s in Node.

**Ribbit, 309 screws:**

| Result | Count | Reading |
|---|---|---|
| Threads into a catalog part (servo horn or case) | 218 | Legitimate. A real check needs catalog ports (1.3) to confirm that each catalog part really has a tapped hole there |
| Engaged in an insert | 91 of 91 inserts used | No orphan inserts, and no insert sits in solid (uncut) material |
| Shank inside solid material | 0 | Clearance holes are all cut |
| Tip in air | 0 | — |
| Head not seated | 16 | 4 are real: the end-effector screws float in an empty cavity after the "make the spheres larger" edit, with no material within 2.2 mm of the axis from the tip to 11 mm above the head. The other 12 are countersunk heads, which the probe's flat-ring test mishandles (axis traces show material right up to the cone) |
| Driver line hits solid material within 30 mm in the final assembly | 87 | Can't be judged without an assembly order: whether the blocker goes on after the screw. Two traced cases (shoulder-cap horn screws under the upper arm, torso-shell side screws under the arm) are service or order questions, not certain faults |
| Driver line touches a surface but no material | 9 | Probably access holes. A ray-only test would have marked them blocked |

What this says about Phase 1:
- **The agent can already get fastener chains right once pushed.** After your critiques, Ribbit's chains are clean: every insert engaged, no tip in air, no uncut holes. So the existence checks pay off mostly on *first drafts* (Sprout has no fasteners at all, so a held-by check would flag every one of its 59 parts) and as a **regression guard after edits**: the effector screws broke silently when the spheres changed.
- **Driver access is where it gets hard, and it depends on order.** 87 of 309 screws are covered in the final assembly. Only a build order says which of them are faults. That backs the roadmap's choice to put the removal-order planner inside `check_assembly`, and it argues against shipping an order-free access check: it would be noise.
- **False alarms are easy to make.** In a 6-case hand check the naive probe got 3 wrong:
  - countersunk heads;
  - a coaxial access hole;
  - the flat-ring seat test.

  The first version flagged 284 of 309 heads as unseated because of one sampling mistake. Seeded faults (1.2) aren't enough on their own. The check also needs **clean negatives**: real, buildable assemblies on which it must stay quiet. This matches the counter-evidence review (precision before gating).

### What the agent found by hand after "How would I actually build the head??"

In the same chat ("…fix them all. I am about to actually print and build this for real"), the agent spent a long run auditing by eye. Each problem it found maps to a check the roadmap proposes:

| Found by hand | Check that computes it |
|---|---|
| "Two back-top screws … buried under the shell's top skin" | Driver access in assembly order (1.1) |
| "Hip-yaw servo screws ended in blind holes, so they couldn't be fitted"; the right yoke "still has the old blind insert holes" | Driver access, plus the screw entering from the side it can be driven from (1.1, 1.4) |
| "Do the hip-yaw rear screws already exist in the model? Trying the naming pattern" | Held-by graph: a servo with no fastener (1.1) |
| "Screw tips going 2 mm into" the next part | Fastener chain: tip host and engagement (1.1) |
| "check_scene found the old cap screws … still at the 120°/240° positions" | A post-edit fastener re-check (3.2) |
| "The cap's mesh split apart because the bridge faces are exactly coplanar"; "printability measures only a 5 g piece of the cap, so the part may have split" | Topology audit on every compile (0.7) |
| "Re-modeling lost the right cap's mirroring, so it landed on the left side" | Mirror by datum, kept as a relation (0.4, 5.2) |

None of these needed a judgement call; each is a geometric fact. That is the strongest evidence for Phase 1 in this note: the failures you caught are the checkable kind, and the agent found them only when told to look, by eye, one at a time.

## 2. Mirroring catalog servos

`mirrorParts` (`src/agent/agentMirror.ts`) reflects a catalog part's position and conjugates its rotation (S·R·S), but it can't mirror the mesh.

- **Offset measured from the shipped GLB:** the STS3215 output cap centre sits **12.66 mm** from the mesh's bounding-box centre, along local X.
- **Run on Ribbit's 8 left servos with `mirror_parts` across X:** every copy's output lands **25.3 mm** from the true mirror position. The error equals 2 × 12.66 mm, whatever the servo's rotation, because conjugation flips the offset's local X component.
- **What the agent did instead:** in the saved Ribbit, all 8 right-side servos were placed by hand and their outputs mirror to within **0.3 mm**. So the bug doesn't show in the finished robot. It costs the agent turns and invites the "mirroring sign errors" seen in the chats.

Verdict: roadmap item 0.4 is confirmed and cheap. The test is exact: an output error under 0.1 mm.

## 3. Cost: Ribbit before and after "getting quite expensive"

**Before** (the chat "Looks like this robot is getting quite expensive…", 2026-10-25), in the agent's own words:
- **Servos:** 10 Dynamixel XM540 and 8 XM430 came to "$7,480 of ~$7,914", using the prices you'd checked.
- **Budget:** $4,200, so the design was 88% over it.
- **Torque margin:** the servos were "3–10× stronger than the joints need" by the static check.
- **Nothing flagged it.** Budget isn't a row in `verify_design`, so the design was "done" while nearly double its budget, and the overspend surfaced only when you noticed.
- **The agent worked around missing prices.** To price alternatives it "placed a few candidate servos to get catalog prices and then deleted them", because `find_parts` shows no prices. It still ended with "the catalog has no price for the STS3250 … XL430", and asked you to look them up.

These transcripts confirm 0.1 (prices at selection), 0.2 (budget as a check) and 2.1 (a solver that compares options) directly.

**After:** the Feetech version now saved as Ribbit.

Run through the app's own `runEngineering` and `buildBom`:
- **Mass and torque:** 3.44 kg. The worst static joint load is 0.85 N·m (hip pitch).
- **Servos:** 12 STS3215 C018 at $21.99 (list price) and 6 STS3250 at $60 (the price you recorded). That's $624, **54% of the $1,147 estimated BOM**.
- **Knees and ankles:** these 4 STS3250s need 0.49–0.50 N·m. An STS3215 C018 passes the strict 1/5-of-stall rule up to 0.59 N·m, so swapping them saves **$152 (13% of the BOM)** under the current check.
- **Hip pitch** (0.85 N·m) is above the STS3215's 1/5 stall but inside its rated torque. The STS3250 is the defensible pick there.
- **Budget:** after the switch, the estimate is $1,147 against the $4,200 budget.
- **Unpriced lines:** 20 of 40 BOM lines have no price, but they're all cheap: M2 and M2.5 screws, heat-set inserts, servo cables, a fuse holder and a switch. Probably $40–70 in all. Every component has a list price except the STS3250, which only has your recorded one. `listPrices.ts` already has the Pi 5 4 GB at $110, so 2.4 is partly done.

**That swap would be wrong.** The torque model counts only static holding and straight-legged stance in the modeled pose. Ribbit's thigh and shin are both 160 mm. On one leg, with the robot's full 3.44 kg on the knee, the knee carries m·g·shin·sin(bend/2):

| Knee bend | Single-leg knee torque | STS3215 C018 (1/5 stall 0.59, rated 0.98) | STS3250 (1/5 stall 0.98, rated 1.57) |
|---|---|---|---|
| 0° (what the check sees) | 0.49 N·m | Pass | Pass |
| 20° | 0.94 N·m | Warn | Pass, barely |
| 40° (a typical walking crouch) | 1.85 N·m | Over rated | Over rated |
| 60° | 2.70 N·m | Near stall (2.94) | Over rated |

So the STS3250 knees were justified, maybe even under-sized for a crouched gait. Today's Servo torque check passes Ribbit only because it never bends the knees. Builders' reports ([`counter_evidence.md`](counter_evidence.md), §4) also put real failures at stalls and duty cycles, not at static loads.

Two consequences:
- A "cheapest that passes" solver on today's load model would **under-size** exactly the joints that matter. `size_actuators` has to take its loads from the MuJoCo sim (peak torque over walk, hold and shove, plus a crouch case) with a duty margin, and offer the cheapest part *with margin* alongside one tier up.
- The current Servo torque check is itself optimistic for legged robots. It needs a working-pose case before anyone relies on it, cost solver or not.

On Ribbit, then, "overpriced" was mostly not true. The expensive servos sat where the real loads are, and the check that would have called them oversized is the thing that's wrong.

## 4. Image limits

From the Claude API reference bundled with Claude Code (2026-10):
- Opus 4.7 and later, including Opus 5.5, read up to **2,576 px on the long edge (3.75 MP)**, up to about 4,784 tokens per image.
- Coordinates map 1:1 to pixels.
- For technical drawings, higher resolution plus crop and zoom tools still add accuracy, and on Opus 5.5 tools are "a markedly more cost-effective lever than raising thinking".

Our caps are 1,568 px for photos, 1,024 px for renders and 768 px for pose previews, so 0.5 holds. The "≤ 2,000 px past 20 images" rule is confirmed by Anthropic's vision docs (see [`citation_audit.md`](citation_audit.md)). Oversized images are rejected, not resized, and images in the history and in tool results count.

## What the first round changed in the roadmap

1. `check_assembly` ships as **WARN until it's quiet on clean negatives**: Ribbit's verified chains, plus published buildable robots. Driver access is reported only together with the removal order, never on the final assembly alone. Countersunk seats and access holes become explicit test cases.
2. Seeded-fault evals (1.2) start from Ribbit: delete an insert, shorten a screw by 3 mm, enlarge a sphere over its screws (the real regression), move a screw 2 mm sideways.
3. Re-run the fastener checks after every edit to parts near fasteners, not only at the end: that's how the effector regression would have been caught.
4. `size_actuators` takes its loads from simulation and keeps a margin (see 7).
5. Price coverage is mostly there for components; add a list price for the STS3250 and pack prices for inserts and M2/M2.5 screws, so the running total in 0.3 has no gaps.
6. The overpricing failure is real (Dynamixel Ribbit: $7,914 against a $4,200 budget, nothing flagged), and so is the under-sizing risk of fixing it with the static check. Both point to the same order: budget row and prices first (Phase 0), then the crouch-aware load model, then the solver.
7. A new Phase 0 item: add a working-pose case to the Servo torque check (knee bent 30–40°, single-leg stance), or read peak torque from `simulate`. Without it, both the check and any cost solver are optimistic for legged robots.

## 5. Ribbit's knee torque in MuJoCo (second round)

`scratch/sim-torque.test.ts` builds Ribbit's MJCF with the app's own `buildMjcf` and runs `SimEngine` in Node. Catalog parts are box hulls with catalog masses. The robot holds each crouch for 3 s, standing on both legs. Each cell gives the mean over the last 0.5 s, then the peak including the landing after reset:

| Knee bend (hip and ankle at half) | Left knee | Right knee | Hip pitch | Ankle |
|---|---|---|---|---|
| 0° (modeled pose) | 0.06 / 0.06 N·m | 0.05 / 0.06 | 0.05 | 0.06 |
| 20° | 0.52 / 0.70 | 0.53 / 0.87 | 0.09 | 0.12 |
| 30° | 0.75 / 1.58 | 0.76 / 1.89 | 0.12 | 0.15 |
| 40° | 0.96 / 2.14 | 0.99 / 2.52 | 0.15 | 0.17 |
| 60° | 1.35 / 4.90 (saturated) | 1.40 / 4.90 | 0.19 | 0.20 |

- **The hand estimate holds.** Two legs share the load, so the steady knee torque at 40° (about 0.98 N·m) is half the single-leg estimate of 1.85 N·m.
  - On both legs it sits exactly at the STS3250's 1/5 of stall and at the STS3215's rated torque.
  - On one leg (every walking step) it's about twice that.
- **The app's static Servo torque check is wrong in both directions:**
  - Knees: 0.49 N·m from straight-legged stance, against about 1.9 N·m on one leg at a working crouch.
  - Hip pitch: 0.85 N·m from holding the leg out across its range, against 0.15 N·m measured in a crouch.
- So `size_actuators` and 0.8 need a crouch case or `simulate` peaks.
- Landing transients reach 2–4× the steady value, which is the kind of stall load builders report breaking STS3215 gears.

Ribbit's sim model already rates its legs from the servos (4.90 N·m for the STS3250), so the simulator is the better source of loads today.

## 6. An ordered assembly planner on Ribbit (second round)

`scratch/assembly-order.test.ts` is the reverse-disassembly fixed point recommended in [`assembly_planning.md`](assembly_planning.md). It works in two steps:
- **Precompute blocker sets once on the final assembly:**
  - for each screw, the driver envelope;
  - for each part, rays along each candidate direction, cast both from it and towards it.
- **Then remove repeatedly:**
  - a screw comes out when no part still present blocks its driver;
  - a part comes out when its screws are out and some direction is clear;
  - a unit comes out (an agent group, or two parts that block each other) when no screw crosses its boundary.

Removability only grows as parts come out, so the result doesn't depend on the order tried.

**Speed:** about 3.5 s in one Node thread for 475 parts and 309 screws: 1.8 s for the screw analysis, 1.5 s for the sweeps, a few ms for the fixed point. That's fine for an analysis worker.

**Results depend heavily on modelling choices:**

| Variant | Screws stuck | Parts removed (of 73) |
|---|---|---|
| ShanghaiTech envelope (2 mm × 30 mm bit, 6 mm × 60 mm handle); a screw holds every part near its axis | 204 | 7 |
| Same, with real servo meshes instead of boxes | 193 | 8 |
| Bit only (40 mm); a screw holds only the parts its shank passes through | 108 | 16 |
| As above, plus unit removal (subassemblies and interlocked pairs) | **70** | **42** |
| Full handle envelope, shank rule, units | 169 | 16 |
| **Realistic tool set** (straight driver; an L-key short arm with a 60° swing sector; a ball-end at 20° in 8 azimuths), shank rule, units | **84** | **30** |
| Straight driver only, and every tool and part path must leave the robot (strictest) | 211 of 315 | 8 of 74 |

What it shows:
- **Each modelling choice moved the verdict by 40–90 screws.**
  - A 6 mm handle clipping curved shells.
  - A part 1.5 mm above a screw head counted as clamped, which created false cycles: the upper-arm shell sits just over the shoulder-cap horn screws.
  - Servos as boxes.
  - No two-handed or subassembly removal: foot with ankle servo, shank with knee servo, the two upper-arm halves.
- **The checker's precision is the work, not the algorithm.** That matches every source in the assembly research, and it's why rows stay WARN until they're quiet on known-good robots.
- **With the realistic tool set,** the 309 screws come out as:
  - 107 pass with a straight driver in the finished robot;
  - 22 pass if driven before the parts that cover them (a build note);
  - 96 need an L-key or ball-end (WARN);
  - 84 stay stuck: 22 in the right arm against 10 in the left, and 12 in each leg.
- **The left/right difference isn't in the printed parts,** which are exact mirrors. The servos are rotated copies, not mirrors, and sit differently against the screws.
- **The tool model alone swings the result from 70 to 211 stuck screws** (the strictest row ran on a re-saved Ribbit with 315 screws). Calibrating it against real builds is the core open problem, more than the algorithm.
- **This can't certify Ribbit either way.** It might still not be buildable as modelled, or translation-plus-units may be too weak a motion model. Only a physical build or your review of the stuck list can say. That's why the roadmap needs clean negatives before any FAIL.
- **An earlier variant (bit only) still left 70 screws** in the neck, shoulders and torso. Hand traces found three kinds:
  - real-looking faults, such as the torso screws `ts-3`/`ts-4` with the battery and frame directly over the head;
  - envelope questions, a 40 mm bit clipping nearby walls, which an L-key or ball-end driver might reach;
  - two-handed moves the unit rule doesn't find yet.
- **A mirrored robot gave asymmetric verdicts.** Every left/right screw pair had symmetric stacks and blockers, but sampling every n-th vertex picks different points on mirrored meshes, so a thin feature is hit on one side and missed on the other. Good test for the real checker: a mirrored design must produce mirrored verdicts. Sample deterministically in the part's own frame, or confirm with an exact intersection.
- **Inside tests on catalog meshes need care.** Maker meshes are multi-body and often not watertight, so parity ray tests on them are unreliable. Use their convex pieces or a voxel occupancy for blocking.

## 7. Craft metrics on Ribbit and Sprout (second round)

These are the craft research's metrics ([`craft_and_design_language.md`](craft_and_design_language.md)), run on our parts as exported by the app's own mesh builder:
- **Envelope sharp share:** of the convex edge turning within 1.5 mm of the hull, the share at edges sharper than 60°.
- **Solidity:** volume divided by convex-hull volume.

| Robot | Parts | Envelope sharp share (median, IQR) | Parts above 0.8 | Solidity median | Parts above 0.85 solidity |
|---|---|---|---|---|---|
| SO-101 (expert reference) | 11 | 0.39 (0.14–0.71) | 0 | 0.55–0.58 (links) | 1 (a hand grip) |
| Open Duck Mini v2 (deliberately faceted style) | 16 | 0.72 | — | 0.08–0.19 (shells) | — |
| Ribbit | 47 | 0.73 (0.49–0.91) | 15 (32%): feet, hip brackets, charge port | 0.28 | 8 |
| Sprout | 59 | 0.46 (0.21–0.88) | 17 (29%) | **0.79** | **11**: knee and ankle bands, battery door, solid limbs |

- **The two robots fail differently:**
  - Ribbit's parts are hollow shells with hard outer edges.
  - Sprout's are rounded but solid: printed bricks.
- The metrics separate the two styles and both reference robots, but **nothing yet ties them to your judgement**. Calibrate on your labels before any threshold gates.
- **The tessellation is safe:** OpenSCAD's `$fa = 6` faceting is far under the 60° threshold, so fillets don't read as sharp edges.

## 8. Fasteners and the range-of-motion check

- The range-of-motion sweep moves only a joint's listed children (`downstreamOf`). Ribbit lists hardware among the children of 20 of its 21 joints: 28 of the left knee's 32 moving parts are screws.
- Without that hand bookkeeping, every horn screw stays still while its link turns and reads as a clash.
- That explains the FAIL row recurring in 23 of 30 `verify_design` calls, the agent toggling 144 screws to reference, and the 33 `define_joints` calls that attach screws as fixed joints.
- **Fix:** move each fastener (and insert) with the body of the parts its shank clamps, which the fastener chain already knows.

## 9. What `check_scene` reports on a finished robot

`scratch/flush-probe.test.ts` runs the app's own `collide` (tolerance 0.3 mm, 400 samples, flush-face detection on) over Ribbit's solid parts, with real servo meshes. It takes 3.3 s.

| Kind | Lines | Involving hardware | What they are |
|---|---|---|---|
| Interference | 76 | 76 | Every one is a screw or insert in its own hole: M2 self-tappers 0.6 mm into servo cases, heat-set inserts 0.5 mm into their bosses. All by design |
| Flush same-facing faces | 73 | 62 | 48 socket heads, 6 countersunk heads, 7 inserts and 1 dowel pin sitting flush in their seats (good design flagged as "flicker"), plus 11 between other parts |

**In short:**
- After your audits, every interference line and 85% of the flush lines describe intended contact.
- That's why the chats show `check_scene` returning issues on 92 of 92 calls, and why the agent stopped reading them.
- The "flicker" advice (set a part 0.2–0.5 mm proud or inset) changes the design to fix a rendering artefact. It belongs in the renderer (per-part depth offset), not in the design.

**Hiding expected fastener contact leaves 11 lines,** and one shows a left/right difference: the right shank shares **2,252 mm²** of coincident face with its ankle servo, against **206 mm²** on the left.

A twin check (`scratch/twin-probe.test.ts`) shows the printed parts aren't the cause:
- All 16 left/right pairs are exact mirrors: same code, 0.0% volume difference, centroids within 0.3 mm.
- The difference comes from the servo. A catalog servo can't be mirrored, so the right one is a rotated copy (Euler [0, 0, 90] against [180, 0, −90]) whose faces meet the shank differently.

So this is servo chirality, not the stale-geometry `mirror_parts` bug. It's still worth a lint: a mirrored pair whose contacts differ by 10× is where a chiral part broke the symmetry, which is where the 25.3 mm output error also lives.

**Recommended (roadmap 0.12):**
- Mask the screw against its stack and the insert against its host, up to their designed engagement and interference. Flush heads are fine.
- Report flush faces only between non-hardware parts.
- Add a **twin-difference lint:** mirrored pairs whose clashes, clearances, volumes or bounds differ by more than 10%, naming the chiral catalog part when one is involved. Don't compare raw contact area: Ribbit's correctly fitted right-side servos share 10× the area with their shank, with no interference on either side.

## 10. Topology of the parts the agent shipped

The parts were exported with the app's own mesh builder, then checked with trimesh after merging vertices by position:

| Robot | Parts | Non-manifold edges (more than 2 faces) | Several separate watertight bodies in one part |
|---|---|---|---|
| Ribbit | 47 (41 OpenSCAD, 6 replicad) | **16, all OpenSCAD**: shoulder yokes 374 edges each, neck-yaw bracket 108, hip cross brackets 65, upper-arm shells 28, thighs 9, forearms 8, torso frame 8 | 0 |
| Sprout | 59 | 15: torso grille 150, grippers 54, shins 37, feet 26… | 5: battery door, battery latches, gripper pads (2 bodies each), pelvis (5) |

- **Non-manifold edges** are places where solids touch only along a line, such as a web meeting a cheek edge-to-edge. They aren't fused, so the joint is weak in print and can confuse slicers.
- The OpenSCAD manifold backend reports no error for these. ModelRift saw the same: "NoError" on a mesh with non-manifold edges.
- **A part made of separate bodies** prints as loose pieces. Sprout's pelvis is 5.
- This confirms roadmap item 0.7 on finished, user-reviewed robots.
- **The audit to add after every compile:**
  - non-manifold edge count, located, with "fuse with at least 0.2 mm overlap" as the fix;
  - body count;
  - volume change from the previous revision (0.15).

## 11. Craft lint needs to know what's visible

Ribbit's per-part envelope sharp share shows a pattern:
- **Critiqued parts are the roundest.** The parts you critiqued through several rounds are torso shell 0.49, shoulder caps 0.39, torso frame 0.21. The head shell (0.77) and head back (0.58) are mid-range.
- **Internal parts are the sharpest.** Mechanism parts nobody commented on are 0.92–0.99: hip brackets, rolls trays, feet.

Expert parts keep interior and functional edges sharp too (SO-101's interior sharp share is 0.6–0.9). So a craft lint should weight each part by how much of it is visible from outside the robot: the share of its surface on the robot's overall hull, or seen in `look` renders. Applied to every part equally, it would flag the brackets that don't matter and dilute the shells that do.

## 12. Is the catalog ready for cost-aware selection?

Counted from `src/data/components.ts` and `src/data/listPrices.ts`:

| | Count | With a list price | With torque data (`actuator`) | With both |
|---|---|---|---|---|
| Servos, motors and linear actuators | 37 | 7 | 4 (STS3215, STS3250, SCS0009, LX-16A) | **1** |
| All components | 186 | 59 | — | — |

No torque data exists for:
- **Dynamixel:** XL330, XL430, XM430, XM540, XC330, 2XL430;
- **hobby servos:** MG996R, SG90, DS3218;
- **every QDD actuator:** CubeMars AK60/70/80, MyActuator RMD-X8, RobStride 02, Unitree GO-M8010, mjbots qdd100, ODrive D6374;
- **every stepper and gearmotor.**

So the torque check passes "No torque data" for most of the catalog. The sim falls back to "estimated from weight", which is what happened to the Dynamixel Ribbit. A `size_actuators` solver today could choose between four servos.

**Catalog data is the first deliverable of Phase 2,** before the solver: stall, rated or continuous torque, speed and voltage range per version from each datasheet, and a list price per actuator.

## 13. Seeded faults on Ribbit (a first recall test)

`scratch/assembly-probe.test.ts` takes `FAULT=[…]` edits, and its output is diffed against the clean run:

| Fault planted | Caught? | How |
|---|---|---|
| Delete the heat-set insert under `visor-screw-1` | Yes | "tip in air, no insert or nut" |
| Shorten `ts-1` from 12 to 8 mm, head kept in place | **No** | The insert is still on the axis; engagement depth isn't measured |
| Move `la-crf-1` 2 mm sideways | Yes | "shank inside material of left-shoulder-cap" |
| Sink `ll-cross-1` 3 mm into its part | Yes | "shank inside material" |
| Delete screw `ts-1` | Yes | Its insert is left orphaned |
| Pull `visor-screw-1` 4 mm out | Yes | Tip in air, head not seated, insert orphaned |

5 of 6, with no change on any other screw in all six runs. The miss shows the check that's needed: **thread engagement length**, the depth of thread inside the insert or host, against at least 1.5 × D in plastic and the insert's own length. 1.2's fault set should keep this case.

## 14. Ribbit with derated servos

The same MuJoCo model, with every actuator's force limit scaled to 0.7 × stall: the "Peak" test in [`actuator_sizing.md`](actuator_sizing.md).

- **Holding a crouch:** it still stands at every bend from 0° to 60°. Steady knee torque is unchanged (0.96–1.40 N·m), and only the 60° landing transient now clips at 3.43 N·m.
- **Shoves** of 0.1, 0.2 and 0.3 × body weight for 0.15 s don't topple it, at full or derated torque. The prompt's own simulate test uses 0.3.
- **A half-body-weight shove (the UI's Push) topples it at every bend, derated or not.** So the fall comes from the hold controller having no balance, not from torque.
- **Conclusion:** static and shove tests can't exercise the Peak result. It needs a walking gait or a trained policy in the loop, which is where landing loads come from.

## 15. Can fasteners be assigned to joints automatically?

`ATTACH=1 npm run scratch -- scratch/assembly-order.test.ts` derives, for each joint and screw, whether the screw moves with the joint. The rule: every part its shank clamps moves with the joint, ignoring the joint's own servo, whose horn turns with the child. It's then compared with the agent's hand-written joint children in Ribbit:

- **Agreement:** 6,457 of 6,489 decisions (99.5%): 704 moving screws found automatically, against 720 listed by the agent.
- **Disagreements:** all 32 are on `waist_fixed`, a fixed pseudo-joint the agent created to hang neck and shoulder screws on. That bookkeeping disappears once screws follow their clamped parts.
- **First attempt:** before the servo exception, horn screws (which clamp the servo and its bracket) were the 144 disagreements. A real implementation needs the servo's output face from catalog ports (1.3), to tell horn screws from case screws.

So roadmap item 0.10 can replace the agent's manual assignment of 720 screws, the 33 `define_joints` calls that attach screws, and the range-of-motion failures they caused.

## 16. Did the craft metrics track your critiques?

`scratch/part-history.mjs` recompiled every saved version of the head shell, head back, torso shell and upper arm from the chats: 86 versions, 82 compiled. Each was scored and lined up against your messages (`scratch/craft/history.timeline.txt`).

| Your critique | Part | Envelope sharp share before → after | Did the metric follow? |
|---|---|---|---|
| "They should be rounded/beveled at the top, just not overhand" | Upper arm | 0.95 → 0.78 | Yes |
| "Let's simplify the torso exterior … clean it up" | Torso shell | 0.71 → 0.50 | Yes |
| "Terrible torso / upper body … The arms are so fat" | Torso, then upper arm | 0.68 → 0.80, and 0.87 → 0.91 | No: the redesign added edges ("Looks so much better now!" came at 0.71) |
| "THe head shape is too basic, could do with some more craft and polish" (Beni) | Head | 0.41 → 0.66–0.77 | Opposite: "more craft" meant more detail, so more crisp edges. Boxiness stayed at 0.91 (hull ÷ oriented box) |
| "Ideally the head could be more round, less rectangle" (with an SVG outline) | Head shell | 0.79 → 0.75; boxiness 0.66 → 0.66 | No change in either scalar |

**The last row, measured against your own outline.** Your SVG's outer path is a 187 × 176 rounded rectangle with 80 mm corners. Front view, the model scaled to your outline's height (crude raster, so compare the values with each other only):

| Version | Width ÷ height (yours 1.06) | Overlap (IoU) with your outline |
|---|---|---|
| Before the critique | 1.25 | 0.55 |
| The agent's answer | 1.09 | **0.75** |
| Final | 1.09 | 0.76 |

The agent did move toward your outline: 23 mm taller, a rounder front. Neither scalar saw it.

**What this means for craft checks:**
- Scalar style metrics track explicit edge requests (bevel, simplify) but not "more craft", which means more detail, nor silhouette shape.
- When you give a target (a sketch, an SVG, a photo), the check that matters is **fit to that target**: "front outline 0.76 of yours; the corners are tighter than your 80 mm".
- The craft lint (3.5) stays a WARN-level hint. Comparing against what you provide becomes a first-class `compare` input (6.3b).

## 17. Serviceability: can you reach the torso without taking the robot apart?

You raised this mid-research: "Being able to replace something in the torso … without having to take the entire robot apart. The LLM seems like it likes generating complete parts, instead of splitting them in half when they should be." The planner can measure it directly (`EXIT=1 SERVICE=<ids> SPLIT=<ids>` in `scratch/assembly-order.test.ts`).

**Service depth** is the parts and screws that must come out before a part is free. It's computed by following, for each part, the removal direction with the fewest blockers, and for each screw its straight driver path.

**The first version was wrong in a telling way.** It said the leg regulator needed "0 other parts", because a part only had to move its own length and a driver only needed 92 mm of clear line. Inside a big closed torso both are true, but nothing actually leaves the robot. **Service needs every path to reach open space outside the robot,** both the part's travel and the tool's line.

**With exit paths required:**

| Part | Result |
|---|---|
| Battery | No path. In all six directions it's boxed in by the torso frame and shell, plus the arms, neck or legs |
| Pi 5, regulators, bus adapter | No path: inside the shell |
| Head camera, knee and neck servos | No path through the shells around them |

**Why:** the torso shell is one piece wrapped around everything. In every direction it's blocked by its own contents (the frame, Pi, regulators, battery), plus the arms and head. Its side screws (`lss-*`, `rss-*`) are driven from under the upper arms, so the arms come off first.

**A limit of this prototype:** the service-depth search doesn't remove units yet. A servo locked into its link (a knee servo in its shank) reads as "no path" even when the link comes off as a unit and the servo is then freed on the bench. The real check has to search units the same way the removal planner does, so the servo rows above are pessimistic.

**Where to split it.** Each candidate plane was tested by cutting the shell through its centre and moving each half away along its own axis, out of the robot:

| Torso shell split | Half moving + blocked by | Half moving − blocked by |
|---|---|---|
| Left/right (x) | 6 (left arm, shoulder parts) | 7 (right arm, charge port) |
| Top/bottom (y) | 5 (head, shoulder caps) | 7 (legs, pelvis, frame) |
| **Front/back (z)** | **0** | **1** (the charge port, which sits in that half) |

- **The front/back clamshell is the split an expert would pick.** The head shell and head back are already split the same way, and the head back's front/back test is also clear (0 blockers).
- **So a checker can name the split plane and the half each fitting belongs to.** It can't yet design the seam: lip, screws through it, or the electronics tray that makes the battery reachable once the front half is off.

**What this changes:**
1. **Service paths become a computed check (1.1).** Name the serviceable parts: battery, compute, regulators, every servo. Report each one's service depth, with every path required to exit the robot. Thresholds follow the EU and French repair-score step bands (battery ≤ 2 steps, electronics ≤ 5, each servo ≤ 10; see [`serviceability_and_splitting.md`](serviceability_and_splitting.md)), adjusted by your answer to "what should be replaceable without a full teardown".
2. **Enclosure and split suggestions:**
   - A part blocked in every direction by parts it contains is flagged "must be split, or its contents can never be serviced".
   - The check proposes the split plane with the fewest blockers.
   - This is the deterministic answer to the agent preferring one-piece parts.
3. **Agent guidance at the block-out:** every enclosing shell gets a split plane and a removal direction before it's modelled, chosen from the computed suggestion. Electronics sit on a tray or sled reachable from that opening.

**The claim the agent made.** After "The battery hatch doesn't make sense?", the agent removed the hatch, added a charge port, and wrote: "The battery now stays in the robot. To replace it, you lift the torso shell off."
- The planner shows the shell can't lift off: it's blocked in every direction by the arms, the head and its own contents, and two of its side screws are driven from under the upper arms.
- The prompt does ask for "battery and compute bays with an access panel" (lines 440 and 468), but nothing checks it.
- This is the same pattern as the 98% "done" claims in the silent-failure study: a serviceability statement made without a measurement. A service-depth check turns it into a number in the reply.

**Flagging enclosures automatically.** `ENCLOSURES=1` flags every part that contains other parts (by bounds) and can't leave the robot in any candidate direction because of them. On Ribbit it flags 4, and the split test picks a plane for each:

| Part | Contains | Best split | Blockers per half |
|---|---|---|---|
| Torso shell | 17 (Pi, IMU, buck, charge port…) | Front/back | 0 and 1 (the charge port) |
| Torso frame | 13 (battery, Pi, shoulder servos…) | Front/back, but see below: a frame should stay whole | 2 and 3: only the pelvis and shell, which come off first, plus the battery on one side |
| Head back | the neck pitch servo | Front/back | 0 on one side (already a half; it holds the servo) |
| Neck-yaw bracket | both neck servos | Front/back or top/bottom | 3–7 (the neck stays a subassembly) |

**The frame is the wrong part to split.** Splitting the torso frame would free the battery geometrically, but it's the load-bearing part. Design-for-service practice keeps frames whole and never puts the battery inside a structural part ([`serviceability_and_splitting.md`](serviceability_and_splitting.md), rules 7 and 10). So the frame flag means "move the battery out of the frame": a bay or slide-in tray behind the torso shell's front or back cover, with the electronics tray beside it rather than in front.

The split suggestion is right for covers (the torso shell, the head) and, for frames, points at a layout problem rather than a cut.

**Applying the split** (`SPLITAPPLY=torso-shell,torso-frame`). The two meshes are cut front/back by triangle position, crude but enough for blocking rays, then service depth is recomputed:

| Part | Before the split | After the split |
|---|---|---|
| Pi 5 | no path | **1 part first: the front shell half** |
| Battery | no path | still no path |
| Regulators, bus adapter, buck | no path | still no path |

Why the battery stays buried:
- Toward the front it sits behind the electronics shelf: the Pi, buck converter, bus adapter and three regulators.
- The regulators' and shelf's screws (`tp-reg-screw-*`, `tp-shelf-screw-*`) are driven from above, under the shoulder yokes, the shoulder servos and the head.
- So the electronics stack can't come out through the front opening, and the battery can't pass it.

That's a layout rule the split can't fix: **a serviceable item's fasteners must face its service opening, and nothing serviced less often may sit between it and the opening.** The battery should be the outermost item behind the front half, or have its own bay.

**The same check on Sprout,** a different robot with no fasteners. It flags 4 enclosing parts:

| Part | Contains | Best split | Blockers per half |
|---|---|---|---|
| Head shell | face plate, ZED camera, light bar | Left/right (each eyebrow goes with its half) or front/back | 1 and 1, or 4 and 0 |
| Torso shell | grille, battery door | Front/back | 2 and 4 (the waist and neck pass through either way) |
| Grippers | the pads | Top/bottom | 6 and 1 |

The suggestions are plausible on a second robot. They're still suggestions: the seam, its lip and its screws are design work for the agent, checked afterwards by the same service depth.

## 18. What holds Ribbit's electronics?

Fastening of each electronic part, from hardware within 6 mm of its bounds and the agent's own notes:

| Part | Fasteners modelled | What the agent's note claims |
|---|---|---|
| Raspberry Pi 5 | **none** | Only its datasheet holes ("4× Ø2.7 mm holes (M2.5)") |
| IMU (BNO085) | **none** | Only its datasheet holes |
| Battery | none | "Held by a 20 mm hook-and-loop" strap, not modelled |
| Buck converter | none | "Double-sided foam", not modelled |
| Bus adapter | 4 M2.5 screws into inserts | Matches |
| Regulators | 3 M2 screws into inserts each | Matches |
| Head camera | 4 M2 screws | Matches |

So after your audit and the agent's "full check":
- **two boards are held by nothing at all;**
- **two parts are held only by a sentence in a note.**

The held-by check (1.1) flags the first pair outright. For the second pair it applies the declaration rule: a strap or tape is either modelled as a part with its geometry (a strap with its slots, a tape pad) or reported as an unverified declaration in the final report.

## 19. Can `compare` measure your photos?

`compare` measures silhouettes only after segmenting the photo, using `photoProfile` in `src/utils/silhouette.ts`:
- it gives up when the border colour varies (spread over 14);
- otherwise it flood-fills everything within 12 colour units of the border as background.

The same rule, replicated (`seg.py` in `scratch/agent-harness-py/`), on every image attached in your chats and on the bench photos:

| Images | Measured | Refused: background not plain |
|---|---|---|
| Your 13 chat references (`library/references/`) | 5 | 8 |
| Memo bench inputs | 1 of 4 (the studio front render) | 3 |
| Reachy Mini bench inputs | 0 of 2 | 2 (an office scene) |

Even where it measures:
- **White plastic on a white backdrop:** up to 18% of the robot's pixels lie within 25 colour units of the background. Memo's front render and two of your references are like this, so thin or pale parts can leak into the background.
- **Most real photos give no silhouette numbers at all,** which may be part of why `compare` saw little use (9 calls against 188 `look`s).

**Robust foreground masks (6.2: Apple Vision, BiRefNet-lite, SAM 2.1) are a prerequisite** for the camera fit (6.1) and the automatic comparison (6.0), not an add-on.

**Apple Vision as the fix.** A 40-line Swift tool (`mask.swift` in `scratch/agent-harness-py/`) uses `VNGenerateForegroundInstanceMaskRequest`, built into macOS, on-device, no model download. It was run on the photos the flood fill refused, plus Memo's white-on-white render:

| Photo | Result |
|---|---|
| 4 refused chat references | A mask for each, 0.03–0.30 s (the first call loads the model) |
| Memo front (white on white) | Clean outline, thin wrists and hands included |
| Memo kitchen (busy) | Clean outline, robot only |
| Reachy Mini office (busy) | The robot plus a slice of the monitor behind its head |

**Vision masked all 13 of your chat references** (one instance each, about 0.03 s). Comparing robot shares between the two methods also exposed a **silent error in today's flood fill**:

| Reference | Flood fill robot share | Vision robot share | Verdict |
|---|---|---|---|
| ref-1, ref-12, ref-13, ref-9 | 0.19–0.54 | 0.20–0.51 | Agree |
| ref-6 (a Unitree G1 marketing image on a dark gradient, with text labels) | **0.74** | 0.11 | The flood fill accepted the gradient as "plain" and counted 74% of the image as robot. Its band numbers for this photo would be meaningless, and nothing says so |

So 6.2 can start on macOS with a small native helper the Electron main process spawns. The Reachy case shows the one refinement needed: crop or prompt by the model's projected bounds, or pick the instance nearest the image centre. BiRefNet or SAM stay the fallback for other platforms.

## 20. Was the "Memo trap" perspective?

Memo's front studio render (masked with Apple Vision) against its held-out orthographic front drawing (flood-filled from the outline), both scaled to the same height (`persp.py` in `scratch/agent-harness-py/`):

- **Silhouette IoU:** 0.955.
- **Width ÷ height:** drawing 0.387, photo 0.395.
- **Widest width per tenth of height:** within ±2% in 9 of 10 bands. The exception is band 7, where the photo is 3.6× wider: **the photo's hands hang lower and angle out**, a pose difference.

So the Memo trap was the pose of the hands, not lens perspective. Matching the photo band by band (r20) lowered the drawing score because the agent copied a pose the drawing doesn't have.

**What this changes:**
- **6.1 (camera fit) matters less for studio renders** like this one, which are near-orthographic. It still matters for close-range phone photos.
- **The 24° render camera's own perspective is untested here.**
- **What `compare` needs most:** masks that work (6.2), and pose awareness. Flag bands where the reference's pose differs (hands, head turn) instead of treating them as shape errors.

## 21. Are Ribbit's screw lengths right?

The fastener probe, extended to measure thread engagement (the overlap of the screw with its insert along the axis):

- **97 screws thread into heat-set inserts.**
  - **29 engage less than 1.5 × their diameter.** For example, all five M2 visor screws reach 2.0–2.5 mm into 3 mm inserts.
  - **27 run past the insert's far end.** That's fine only if the printed hole continues past it, which nothing checks today.
- **218 screws thread into catalog parts** (servo horns and cases). The probe can't judge these: it treats catalog parts as solid boxes, so it can't see the real tapped depth. That's what catalog ports (1.3) supply.

So about a third of the insert-threaded screws in a reviewed design have a length the agent picked by eye. `fasten` (1.4) picks the stock length from the grip and the receiver's thread depth, and closes this class.

**The render camera's own perspective.** Ribbit's printed parts, front view, all scaled to the same height (`camfov.py` in `scratch/agent-harness-py/`):

| Camera | IoU against orthographic | Width ÷ height (orthographic 0.398) | Worst band ratio |
|---|---|---|---|
| 24°, `compare`'s camera at its own distance | 0.855 | 0.390 | 0.92 |
| 50° | 0.774 | 0.385 | 0.92 / 1.09 |
| 70°, about a phone's main camera up close | 0.736 | 0.382 | 0.93 / 1.10 |

**What this means:**
- **Studio references are fine as they are.** Against a near-orthographic studio image like Memo's, the 24° render stays within `compare`'s 15% band tolerance.
- **Phone photos aren't.** Against a close-range phone photo, the camera difference alone moves the silhouette IoU by about 0.12 with the model unchanged, which `compare` would count as design error.
- **So the camera fit (6.1) is about phone photos.** It's worth doing after masks (6.2), and the reference's EXIF focal length is the cheap first estimate.

**An open-loop walk doesn't measure walking loads.** The app's own gait builder (`buildGait`, both feet, default stride) gives a 0.74 s cycle with 3.5 mm IK misses. Played open-loop in MuJoCo, Ribbit **falls at 0.8 s** (tilt 91°). The joint numbers from that run are mostly the fall: hip pitch and knees saturate at 4.9 N·m, and knee RMS reads about 2.0 N·m.

Two consequences:
- The **Heat and Peak results in 0.8 need a balancing controller.** That means a trained Walk policy (the app's Train tab), not a keyframe gait. Until one exists, the Stance result at the gait's crouch is the dependable one.
- The prompt's line 493, "Walk cycles: simulate controller "animation:<name>" shows whether it really walks", follows its rule to fix the design, not the test. Open-loop gaits will mostly fall. That's a property of open-loop keyframes, not of the design, and the agent shouldn't "fix" the design to make an open-loop gait stand.

**Measuring visibility for the craft lint.** A first proxy weighted each part by the share of its vertices within 4 mm of the whole robot's convex hull:
- **Robot-level envelope sharp share:** Ribbit 0.67 weighted (0.64 unweighted); Sprout 0.42 (0.52).
- **The proxy ranks the wrong parts as most visible:** the soles first, while the torso shell between the arms barely counts.

So visibility has to come from rendered views. A cheap version (`render_vis.py`): 4,000 surface samples per part, depth-buffered on a 160 × 160 grid in front, back, left, right and top views.

**It ranks the right parts:**
- **Ribbit:** torso shell 14% of what you see, head back 14%, head shell 13%, pelvis 7%.
- **Sprout:** torso shell 11%, head shell 9%, thighs 5% each.

**Weighted by visibility,** envelope sharp share is 0.65 for Ribbit, 0.49 for Sprout, and SO-101's median is 0.39.

**The lint can name targets:** Ribbit's **pelvis is 7% of the visible surface at 0.91 sharp**, and the head shell 13% at 0.77. Those are the first places to round edges. The torso shell (0.49) and frame (0.21) already went through your critique rounds.

## 22. A live edit, checked as it happened

While this research ran, a new chat (`chat-mvoe3xit-qlo`) began reworking Ribbit. The torso shell is being split into `torso-shell` and `torso-shell-front`, with spacers and front and rear shell screws: the serviceability change you asked about.

Rerun on the 15:33 save, the fastener probe reports, against the earlier version:
- **`cp-screw-1` and `cp-screw-2`** (the charge-port screws) now end in air, with no insert or nut;
- **`lfs-s1`, `lfs-s2`, `rfs-s1`, `rfs-s2`** (the new front shell screws) have nothing under their heads, and their drivers are blocked within 10 mm;
- the new rear shell screws are clean;
- the four effector screws still float, as in §1.

This was a work-in-progress save, so some of these may be fixed by the end of that chat. It's still a clean example of the regressions a check run after every edit would put in front of the agent at once, instead of after you notice.

**Follow-up on §10: is it a merge artefact?** No. The non-manifold edges are in the kernel's own stored meshes (`cad.indices`), not created by the STL export. Edges shared by more than two faces, counted on the stored indexed mesh:

| Part | Edges by face count |
|---|---|
| Left shoulder yoke | 254 with 4 faces, 111 with 6, 8 with 8, 1 with 10 |
| Neck-yaw bracket | 64 with 4, 39 with 6, up to 18 |
| Left hip cross bracket | 46 with 4, 19 with 6 |
| Torso frame | 10 with 4 |

- **Why:** OpenSCAD's manifold backend keeps sub-solids that touch exactly, without overlapping, as separate sheets sharing positions. Merged by position (every STL consumer does this), they become 4- and 6-face edges.
- **The replicad pelvis** looks broken in index form (OCCT tessellates each face separately) but merges to zero bad edges. It's clean.
- **The fix holds:** overlap features by a small amount (0.01–0.2 mm), or union with a deliberate overlap.
- **Unverified:** whether a slicer prints these parts cleanly. Bambu Studio usually repairs non-manifold meshes and flags them, and edge-only contacts would still be weak.

## 23. Volume drops: collapse or hollowing?

Every revision in the recompiled shell history whose volume fell below half the previous one (`scratch/agent-harness-py/vol_drops.py`):

| Part | Volume | Solidity (volume ÷ hull) | Reading |
|---|---|---|---|
| Head shell | 1,155k → 74k mm³ | 1.00 → 0.11 | **Deliberate hollowing:** a solid block-out became a shell |
| Left upper arm | 75k → 33k mm³ | 0.22 → 0.20 | Unclear; the new mesh has 153 face-connected pieces, which suggests a broken result |

So a raw "volume below 50%" rule (0.15) would fire on correct shelling. Two better signals:
- the **convex hull** shrinking by more than half (the part lost its outline);
- the **body count** rising (the part fell apart).

Hollowing keeps the hull and the single body.
