# LLMs writing CAD code, and making parts look expertly designed

> Audited 2026-10-25: several numbers here are corrected or withdrawn in [`citation_audit.md`](citation_audit.md), which takes precedence.

Research date: 2026-10-25. Builds on `docs/research/LLM robot design and BOM/llm_cad_generation_verification.md` (Query2CAD, CAD-Recode, CADCodeVerify, P3D-Bench, build123d-mcp, CADGenBench, Text2CAD-Bench, CAD-Coder, ProCAD). This note verifies and corrects those, and adds 2026 work, reward design, failure taxonomies, design quality and reusable repos. Items marked **[unverified]** were not confirmed from a primary source.

## Takeaway

1. **Frontier models stop at the coarse envelope.** CADBench (2605.10873): Opus 4.7 emits about 14 operations per part against 22–43 for specialist models. BenchCAD (2605.10865): models swap sweeps, lofts and twist-extrudes for plain extrudes and drop threads and chamfers. RealCADBench (2609.03773): "missing fine structures" and "loss of part identity". Shape metrics hide this: IoU barely moves when fillets or grooves are missing. This is the "too simple" failure, and it's systematic.
2. **Edge selection is the weakest B-rep skill.** Claude Sonnet 4.5 with renders and CadQuery selector docs picked the right edges at 21.5% F1 (FutureCAD, 2603.11831). In Multi-Agent-CAD's eval, every failure of the text-to-cad skill was a fillet-scope error. replicad shares OpenCascade, so it likely shares this (inference).
3. **Repair loops quietly delete features.** AIDL: on errors the LLM "usually removed constraints or structures" and never restored them. LL3M: without docs the agent deleted buggy lines or fell back to primitives. Basecase's own `soften` fallback (smaller fillet radius on failure) does this silently by design.
4. **"Done" is not "correct".** The silent-failure bench ([repo](https://github.com/rodriguescarson/cad-silent-failure-bench), build123d, 13 tasks, 122 kernel-checked requirements; small study): single-shot agents claimed done on 98% of attempts; silent failures fell from 14.1% to 3.2% with a measure-then-claim contract (claim precision 64% → 96%), and a planner-coder-checker split added nothing. Valid-but-wrong parts were mostly wrong internal features (counterbore on the wrong face, hole depth), rarely wrong envelopes, which is exactly what `expect_size` checks.
5. **The spec decides the outcome.** Jarvis-Onshape 2×2 with Opus 4.7: a hand-written spec scored 1.000 vs 0.533 for the agent's own spec; asking it to "look harder" (render-compare every 3 features) changed nothing ([RESEARCH.md](https://github.com/ReshefElisha/jarvis-onshape-mcp)).
6. **Code beats pictures for reasoning about geometry.** BenchCAD: Code QA 0.838 vs Vision QA 0.587. Give the agent textual geometry summaries next to renders.

## Corrections to the existing notes

- CAD-Recode's dataset is 1M in the abstract but 11M in Tables 1 and 3. Its 92.0% IoU uses best-of-10; a single sample has 4.9–16.8% invalid output.
- CADCodeVerify ran on `gemini-1.5-flash-latest`, not Gemini 1.5 Pro.
- Query2CAD's tables are internally inconsistent (failure counts vs success rates).
- ProCAD's "−79.9% mean CD" matches no single table row; ambiguous prompts give mean CD 0.63 vs 7.80 for Sonnet 4.5 alone, and Sonnet's invalidity is 14.6%.
- CADGenBench leaderboard (BenchLM, 25 Oct 2026): build123d-mcp + Claude Opus 5.5 is #1 at 86.9%, ahead of Godela at 84.5%; a plain Claude entry scores 37.3%. The harness dominates.

## Representation

- **OpenSCAD** has the highest first-pass validity (P3D-Bench 1.000 vs 0.91–0.94 for CadQuery, better geometry for every model); its errors are syntax, caught at parse. CadQuery fails later: 55% parameter errors, 24–27% kernel failures, ~16% undefined names. More thinking lowered CadQuery validity for 4 of 5 models.
- **But OpenSCAD fails silently on geometry.** ModelRift (Opus 5, Sep 2026): Manifold returned `NoError` on an STL with 4 non-manifold edges; B-rep code lets the agent query faces and assert on them. Run a topology audit (non-manifold edges, zero-area triangles, component count, genus) on every OpenSCAD output.
- **Language design matters less than tooling.** AIDL's solver-aided DSL matches OpenSCAD visually without training data but has a lower success rate (64% vs 79%). The measured gains come from verification tools. Basecase's OpenSCAD + replicad split is supported; the risk is replicad edge selection.

## Reward design (reusable as acceptance tests and best-of-N selectors)

| System | Reward |
|---|---|
| CAD-Coder (NeurIPS 2025) | Piecewise Chamfer + format. Authors flag reward hacking through thin walls and cavities that sparse sampling misses |
| cadrille (ICLR 2026), [repo](https://github.com/col14m/cadrille) (Apache-2.0) | 10·IoU, −10 if invalid; hard-example mining. Online RL beat DPO |
| CAD-RL (2508.10118) | exec × (IoU + GPT-4o intent score); ablation 49.5 → 60.8 (CoT) → 63.9 (reference image) → 72.3 (RL) |
| CME-CAD (2512.23333) | format · exec · (IoU + work-plane term): "any deviation in the coordinate system can result in a complete failure of the IoU metric" |
| BenchCAD | 0.2 · essential-operation recall + 0.8 · IoU. Fillet usage 0 → 87.5%, loft 0 → 77.8%, sweep 0 → 75% after training |

Pattern: an execution gate, a geometric term, and a frame term or an operation-coverage term. In a harness without fine-tuning these become part acceptance checks.

## Failure modes, with frequencies where reported

- **Pipeline:** silent-failure bench, 151 failed attempts: 95 never made a valid solid, 56 were valid but wrong. Query2CAD: 65–69% of failures non-executable.
- **Structure:** CADPrompt (50 GPT-4 samples): 48% structural configuration errors, 18% logical; over rounds feedback shifts from structural (52% → 38%) to dimensional (20% → 26%).
- **Frame:** models over-prefer the XY workplane (BenchCAD); right shape, wrong orientation is common.
- **Simplest-primitive fallback:** an offset pocket became a plain rounded rectangle (40% too much volume); boss/hole polarity errors; 8–12 px dimension callouts misread (Jarvis).
- **Advanced operations:** invalidity 11–25% at L1 → 68–92% at L3 (sweep, loft, shell; Text2CAD-Bench).
- **Gaps checks can't see:** CADSmith's quadcopter scored IoU 0.985 with gaps between arms and hub that metrics and three fixed views missed.
- **Function:** CAD-bench gearbox builds 96.9%, works 4.0% **[via summary]**.
- **Basecase's own chats** (14 conversations, 1,521 tool calls, 582 `model_part`, 97 failed = 6.4%): unbalanced braces after `diff()`, a rounding larger than half the block, booleans that silently came back empty ("the band cut failed silently and wiped out the ring", "the bezel came out empty"), kernel timeouts when three heavy compiles ran at once, scene reverts after kernel crashes, fillets timing out, mirroring sign errors.

## Design quality: what raises detail

1. **Documentation and example retrieval.** LL3M (2508.08228): complex operations ×5 (1.2 → 5.86) and execution errors −26% with doc RAG. CADSmith and CADEvolve retrieve before writing.
2. **Require operations explicitly.** Tag each feature-inventory item with its operation (loft, sweep, shell, fillet) and check the code contains it (BenchCAD's operation recall).
3. **Standards-anchored libraries instead of generated detail.** BenchCAD's typed family modules for ISO/DIN parts; SimpleCADAPI's `scad.std.*` gears, bearings and threads. Threads and gears are where generation fails functionally.
4. **Pairwise fresh-context critique against a real reference.** text-to-cad's radial-engine "gauntlet" ([GAUNTLET.md](https://github.com/earthtojake/text-to-cad/blob/main/models/radial/GAUNTLET.md)): a fresh critic sees our render and a museum photo in random order, judges which is better, and names ONE largest gap, which goes back to the part's owner. Verdicts vary between rounds, so take several votes. GPTEval3D: pairwise GPT-4V reached Kendall τ 0.795 with humans on geometry details; one criterion per prompt and ensembles improve agreement.
5. **Spec quality, separately from building** (Jarvis, above).

Aesthetic preference is hard to model from geometry: across 22,301 pairwise comparisons, single features correlate near zero and a full model explains R² 0.05 (mugs) to 0.48 (tables) (Dev 2025, [2505.12373](https://arxiv.org/abs/2505.12373)). So geometric metrics can flag amateur tells but can't certify good design; use a lint plus pairwise judging.

### What professional printed robots look like

- Two legitimate styles: **covered character** (Disney BDX, Sunday Memo, Reachy Mini) and **honest mechanism** (ToddlerBot, SO-101, Open Duck's exposed servos in brackets). Amateur output usually mixes them by accident.
- BDX: "a simple design which satisfies the creative intent", rounded foam soles, separate show functions. Memo: soft forms over rigid structure. Reachy Mini: character from two antennas and a 6-DoF head.
- Surface craft (repo B3 notes): split lines placed early, parallel, constant small gaps; a radius ladder of 3–4 radii in about 2:1 steps; walls uniform within ±25%; no screw heads on show faces; joint discs centered on axes; chamfered bed edges against elephant foot.

## Repos and corpora worth using

- [earthtojake/text-to-cad](https://github.com/earthtojake/text-to-cad) (23.1k stars, MIT): build123d skills. `skills/cad/references/` (positioning, repair loop, snapshot review, inspection, kinematics, CAD brief) is the best practitioner corpus found. Notable rules: snapshot review with `xray`, `hidden-line`, `parts` (per-part colour), clipping and exploded modes; "don't loop on snapshots"; "a failed computation is not a passing check, and an untested relationship has no verdict"; repair "preserves specified features and dimensions; disclose any necessary deviation"; required finite limits on every moving mate.
- [Pan-Chera/Multi-Agent-CAD](https://github.com/Pan-Chera/Multi-Agent-CAD) (MIT): staged briefs and a judge; 141 binary feature checks; 116× fewer tokens than the skill at similar pass rates (its own reproduction).
- [jarvis-onshape-mcp](https://github.com/ReshefElisha/jarvis-onshape-mcp): structured "truth" with deltas returned on every mutation.
- [Amagine3D](https://github.com/amagine-ai/Amagine3D): enclosures designed around internal parts; lofted envelopes from sections.
- [CADAM](https://github.com/Adam-CAD/CADAM) (GPL-3.0): browser OpenSCAD + BOSL2, the same stack as ours.
- Corpora: BenchCAD (17.9K CadQuery parts, CC-BY-4.0), CADEvolve generators (`kulibinai/cadevolve`), CADBench, cadqueryeval, CADGenBench. DeepCAD / Fusion 360 / ABC sketch-extrude data is too simple to teach detail.
- Expert robot CAD as render, proportion and feature exemplars: [SO-ARM100](https://github.com/TheRobotStudio/SO-ARM100) (36 STEP files, Apache-2.0), [Open Duck Mini](https://github.com/apirrone/Open_Duck_Mini) (Onshape, Apache-2.0), Berkeley Humanoid Lite, ToddlerBot (CC BY-NC-SA, reference only).
- Caveat from our own bench: prompt examples leak into results (the XL430 got vents). Retrieve several diverse examples on demand; never paste one into the prompt.

## Recommendations for Basecase

1. **Requirements in `model_part`, measured before "done".** Extend `expect_size` into an `expect` block: holes (count, Ø, axis, through/blind, pattern pitch), bosses, minimum wall, flat base area, symmetry plane, volume, genus, required operations, interfaces (`insert: "M3 heat-set"`). Return pass/fail with the measured value and a fix. The agent may only call a part done by citing them. CADTests (2605.07807, see `verification_and_vision.md`) supports executable tests strongly.
2. **Semantic edge selection in replicad.** Helpers: edges created by the last boolean, convex outer edges, edges on a plane, edges of a feature. Return "fillet hit N of M intended edges" and render the selected edges highlighted.
3. **No silent feature loss.** Fallbacks log what they changed; every rebuilt part is diffed against its feature inventory and requirements; omissions come back as problems.
4. **Topology audit on OpenSCAD output:** non-manifold edges, zero-area triangles, body count, genus.
5. **Post-edit lint** (3–8 lines on every `model_part`): new interferences with neighbours, screws without hosts, holes without screws, sharp visible convex edges, a solid part that should be a shell, wall-thickness outliers, a box-ness score (volume / OBB volume > 0.9 with mostly planar axis-aligned faces).
6. **`craft_review`** (WARN-only `verify_design` row): share of visible convex edges left sharp, radius family size and ladder, box-ness, feature density vs the catalog's manufacturer meshes, seam gap uniformity, mirror error, fastener expression, wall uniformity, colour count.
7. **A design-language sheet** posted with the reference sheet: style (covered character or honest mechanism), radius ladder, reveal width, wall, fastener style and where screws hide, colours, how the show features are expressed. Part designers inherit it as data.
8. **A library of proven modules, fetched by tool.** Grow `vendor/robotics/robotics.scad` and replicad recipes into tested parametric modules (`shell_with_reveal`, `boss_with_insert`, `rib`, `vent_slots`, `joint_disc`, `counterbored_screw`, `bed_chamfer`, a servo joint with idler, a battery bay). Each compiles in CI, passes assembly and craft checks, and has a thumbnail. Retrieve with `find_recipes(query)`. Harvest candidates from parts that passed every check in good runs; admit only after testing (Voyager's self-verification; CADEngBench: editing given CAD is much easier than generating it).
9. **Best-of-24-rotation flag in `compare`:** when a rotation fits much better than the placed orientation, say "right shape, wrong orientation".
10. **Pairwise critique against expert references** (see `harness_and_evals.md`).

## Open problems

- No benchmark scores professional craft (load paths, fastener logic, reveals, DFM, serviceability).
- No controlled study of replicad, of BOSL2 vs plain OpenSCAD, or of fillet-fallback strategies.
- Fine detail is invisible to IoU and Chamfer; surface IoU and feature F1 are early answers.
- Functional mechanisms (threads, gear meshes) remain near 0% functional success even when they compile.
