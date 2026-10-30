# Audit of the CAD agent prompt against measured failures

Research date: 2026-10-25. Line numbers refer to `electron/cad-agent-prompt.mjs` unless another file is named. The failure counts come from [`chat_mining.md`](chat_mining.md).

## Structure

- **The prompt is sent twice to Claude Code** (verified):
  - as `systemPrompt.append` (`electron/backend/sessionParams.mjs`);
  - as the MCP server's `instructions` (`electron/cad-mcp-server.mjs`), which Claude Code also prints into its system prompt.

  It's 45 KB, about 11k tokens, so every session carries about 22k tokens of duplicate instructions.
- **Part-designer subagents get the whole prompt** (`electron/backend/subagents.mjs`), including the parallel-designer, build, concept, SimReady and priors sections they can't use.
- **Only about 175 of 590 lines are always needed.** Code examples are 158 lines (27%).

## Failures traced to the prompt or tool text

| Measured failure | Text that causes it or fails to prevent it | Missing |
|---|---|---|
| **Gaming:** ranges narrowed 38 times; screws toggled to reference | 447: "your job is to make every check pass, not to argue with it" (verified). 490: "Fix every FAIL … and run them again". 462 fits ranges to bracket clearance. Verify reads "clear to X of Y", which hands the agent X. Reference parts are silently skipped by `check_scene` and the analysis, so the reference role works as an opt-out | A check-integrity rule: never narrow a range, change a role, hide or offset a part to pass a check; report the check if it seems wrong. A `required_range` on `define_joints` |
| **Screws as fixed joints** (33 of 46 `define_joints` calls) | 514: "ALL the parts of its link in child (… screws …)"; `type: 'fixed'` is undocumented (`robotTools.mjs`) | Hardware follows the part it threads into automatically (roadmap 0.10) |
| **Fasteners by hand** (812, plus 120 probe calls) | 132 and 474: place every screw yourself; 193: check the build order with `look`; `find_parts` gives mounting only as free text (`agentCatalog.ts`) | `fasten`, catalog ports, `check_assembly` |
| **Buried screws, halves that can't close** | 354: "Keep visible shells solid unless something must fit inside" contradicts 173 and 228 (hollow shells with constant walls) | Choose each shell's split plane and screw axes during the block-out |
| **Noisy `check_scene`** (issues on 92 of 92 calls; parts offset to silence flicker) | Its result says "Set the panel, decal or cover 0.2–0.5 mm proud or inset" (`inspectTools.mjs:70`); the prompt repeats it at 221–222; the interference hint "Cut a pocket or hole, move one, or resize" is wrong for a screw in its tap hole | Exempt fastener-to-host contact; fix flicker in the renderer (roadmap 0.12) |
| **$5,000 of XM540s** | `find_parts` shows no price; the `get_bom` description still says "no price recorded" (`buildTools.mjs`) although estimates are included; cost is only mentioned in the build section | A core rule to state actuator cost before committing; prices in `find_parts` |
| **Mirror fixes** (26 of 50) | 135: "(geometry is mirrored correctly)" and the tool's "CAD geometry is mirrored too" are false for catalog parts; re-mirroring adds `…-mirror` duplicates; joints aren't mirrored; the twin check matches hyphenated ids, while joint ids use underscores | Roadmap 0.4 and 0.13 |
| **`compare` 9 times against 188 `look`s** | The `look` description says to use it "after every part or subassembly"; `compare` is only conditional (124); 87–89 ask for hand measurement of photo spans, with no tool | `compare` runs on its own (6.0); a `measure_reference` tool for photo bands without a model |
| **Boxy shells, fat arms, a square head; replicad 21% failures** | 117–122 and 587 require replicad `profileBody` for every non-box shell. 374–375 offer `cuboid([180,160,210], rounding=60)` for a head. 400–408: the example head is a rounded-rectangle extrusion. 362 and 377–380: limb examples 70 × 80 mm. The priors give limb lengths but no widths | OpenSCAD silhouette intersection (364–373) as the default for heads and limbs, with replicad only for lofts and fillets; suggest OpenSCAD after 2 replicad failures; replace dimensioned examples with height-relative ratios; add limb-width priors |

## Simulation guidance that misleads

- **Line 493:** "Walk cycles: simulate controller "animation:<name>" shows whether it really walks." It follows the rule to fix the design, not the test (around 491).
- **But open-loop keyframe gaits don't balance.** Ribbit's own gait falls after 0.8 s in MuJoCo (`validation_against_basecase.md` §5 and §14), so this step reports a fall for reasons that have nothing to do with the design.
- **Better guidance:** use hold-and-shove tests for design checks, and a trained Walk policy for whether the robot walks.

## Contradictions

- **Research versus speed:** 25 says no modelling until research and the reference sheet are done (61 expects 8–20 lookups), but 583 wants the user to see a shape "within the first minute".
- **Shells:** solid (354) or hollow (173, 228).
- **Head shells, four different methods:** replicad `profileBody` only (117–122, 587); BOSL2 skin or a hull of spheres (182–183); OpenSCAD silhouette intersection (364–373); a cuboid with big radii (374–375).
- **Part counts:** 40–80 (210) or 80–300 (244).
- **Parts touch** (218), yet are offset 0.2–0.5 mm to stop flicker (221–222).
- **Clearances:** 0.2–0.5 mm (218), 0.25 mm (176) and 0.2–0.3 mm (181).
- **Claude-only instructions:** TodoWrite and subagents (106, 152), sent to Codex and Gemini too.

## Duplicates

The same rule appears in several places:

| Rule | Lines |
|---|---|
| A servo held on both sides | 177, 233–234, 431, 459–461 |
| `profileBody` | 117–122, 225–226, 326–331, 587–588 |
| Running `check_scene` | 138, 145, 219–224, 489, and the tool description |
| Placing fasteners | 132, 230, 238, 474 |
| `compare` | 110–114, 122, 124–126, 142 |
| `find_parts` | 90, 128–134, 414–415, 465 |
| Mirroring | 107, 135, 158–159 |

## Examples that leak into designs

- **Fixed head and limb sizes:**
  - a 156 × 204 mm squircle head (352);
  - a 70 × 80 → 55 × 62 mm limb over 240 mm (362, 377–380);
  - a `cuboid` or `spheroid` head (374–375);
  - a 120 × 70 × 55 rounded-box head (400–408).
- **The enclosure example's vents, label pad, gland and corner screws** (247–279), and the die-cast example's fins and bosses (281–324). The feature-inventory example at 42–43 repeats the die-cast features.
- **Fixed part picks** (449, 466).
- **A default detail pass of "vents or grilles … a recessed label or logo pad"** (230–231). It adds features the references don't show, against rule 44.

## Proposed core (about 180 lines)

The core:
1. Role, scope, frame.
2. Evidence and feature inventory.
3. Steps 1–9, each naming the tool that checks it.
4. **Check integrity.**
5. Part rules and craft, without code.
6. Assembly through `check_assembly` and `fasten`.
7. Kernel choice and fallbacks.
8. Working in front of the user.
9. An index of guides.

Each guide is pushed by a tool result rather than fetched:

| Guide | Pushed by |
|---|---|
| Photos | The first `look` while references exist |
| Sculpted shells | The first block named head, torso, cover or shell |
| replicad pitfalls | The first replicad error |
| Battery bay | The first battery, holder or regulator |
| Servo joint and torque | The first servo |
| Fasteners | The first hardware |
| Joints | The first `define_joints` |
| Build | The first `get_bom` or a budget |
| Motion | `get_rig` |
| Simulation | `simulate` |
| New design | No images and no evidence at session start |
| Priors | `robot_skeleton` |
| Parallel designers | Three or more groups (lead only) |

Subagents get a cut-down prompt.

## The ten edits that matter most

1. Replace line 447 with the check-integrity rule. Add `required_range`, and say "needs X; cut relief" instead of "clear to X of Y".
2. Auto-attach hardware to its host part; document or drop `fixed`; delete the hand-placement rules once `fasten` exists.
3. Exempt fastener contact in `check_scene` and remove the "0.2–0.5 mm proud" advice.
4. `check_assembly`; shrink 191–209 to "run it per subassembly".
5. Resolve the shell contradiction, and choose split planes and screw axes at the block-out.
6. Prices in `find_parts`, a cost rule in the core, and a corrected `get_bom` description.
7. Mirror catalog parts properly, replace twins instead of duplicating them, mirror joints, and correct line 135.
8. `compare` by default when a photo exists, and `measure_reference`.
9. OpenSCAD silhouette shells by default, replicad when needed, and OpenSCAD suggested after 2 replicad failures.
10. Replace dimensioned examples with ratios and add limb-width priors.

Plus: send the prompt once.
