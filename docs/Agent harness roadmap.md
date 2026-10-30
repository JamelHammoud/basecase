# Agent harness roadmap: turning any model into an expert robotics engineer

Goal: a harness that makes a frontier model (today Claude Opus 5.5; also Codex and Gemini) design robots that can be **put together**, **afford to build** and **look expertly designed**. Those are the three failures that matter most (ranked by the user, 2026-10-25), ahead of photo-matching scores.

Grounding: seven research passes on 2026-10-25, then a second round the same day:
- Two audits checked the first-round notes' numbers against their primary sources: [`citation_audit.md`](research/Agent%20harness/citation_audit.md). Some product rows were left unchecked, and the second-round notes (actuator sizing, serviceability, craft) weren't audited; their weak points are marked in each note.
- A skeptical review looked for counter-evidence: [`counter_evidence.md`](research/Agent%20harness/counter_evidence.md).
- A fresh-context reviewer checked this roadmap against its notes and the code; its corrections are applied.
- Experiments ran on our own scenes and chats: [`validation_against_basecase.md`](research/Agent%20harness/validation_against_basecase.md).
- All 16 saved chats were joined to their session logs, to count where the agent's time and money go: [`chat_mining.md`](research/Agent%20harness/chat_mining.md).
- Two focused passes covered assembly planning ([`assembly_planning.md`](research/Agent%20harness/assembly_planning.md)) and expert craft, measured on SO-101 and Open Duck Mini ([`craft_and_design_language.md`](research/Agent%20harness/craft_and_design_language.md)).
- Two more covered the torque margins real small walkers run ([`actuator_sizing.md`](research/Agent%20harness/actuator_sizing.md)) and the prompt traced against each failure ([`prompt_audit.md`](research/Agent%20harness/prompt_audit.md)).
- One covered design for service and when to split a part ([`serviceability_and_splitting.md`](research/Agent%20harness/serviceability_and_splitting.md)), after you raised it.

Research notes, in [`research/Agent harness/`](research/Agent%20harness/):
- [`assembly_and_mates.md`](research/Agent%20harness/assembly_and_mates.md)
- [`cost_aware_selection.md`](research/Agent%20harness/cost_aware_selection.md)
- [`cad_code_and_craft.md`](research/Agent%20harness/cad_code_and_craft.md)
- [`verification_and_vision.md`](research/Agent%20harness/verification_and_vision.md)
- [`harness_and_evals.md`](research/Agent%20harness/harness_and_evals.md)
- [`generative_3d_and_products.md`](research/Agent%20harness/generative_3d_and_products.md)

Where a note and the audit disagree, the audit wins.

It builds on [`LLM robot design and BOM.md`](LLM%20robot%20design%20and%20BOM.md) and [`Robot design pipeline plan.md`](Robot%20design%20pipeline%20plan.md), whose Phase 4 items (per-part acceptance, joint modules, fabrication checklist) this plan absorbs.

## If you only do ten things

Ranked by measured cost in your chats and by how sure we are that they help:

1. **Stop the checks from lying** (0.10, 0.12). Screws follow the joints they clamp: a prototype finds 704 of the 720 moving screws the agent assigned by hand (all 16 misses on a fixed pseudo-joint), with a servo-horn exception that catalog ports will replace. `check_scene` stops flagging screws in their own holes: 138 of 149 lines on the finished Ribbit.
2. **Stop the agent from gaming the checks** (0.11, 0.17). Remove "your job is to make every check pass"; ranges can't silently shrink; send the prompt once.
3. **Put prices and torque data in front of the agent** (0.1–0.3, 2.0). Only 1 of 37 actuators has both today.
4. **Replace the torque rule with one calibrated on robots that walk** (0.8). Today's rule passes Ribbit's knees at 0.49 N·m; at a 40° crouch MuJoCo measures 0.98 on two legs, so about 1.9 on one.
5. **Fastener chains, engagement and held-by at every edit** (1.1a). The probe caught 5 of 6 planted faults and a real regression. It also found no fastener anywhere near Ribbit's Pi and IMU, and flagged 6 new screw faults in a torso split that another chat was making during this research.
6. **`fasten` plus catalog ports** (1.3, 1.4). The agent placed 812 fasteners by hand and made 120 probe calls.
7. **Service depth and split suggestions** (1.1b in WARN mode, 1.5b). The battery is unreachable today; the check finds the front/back shell split, which frees the Pi, while the battery also needs a layout change. The real Sprout, which Ribbit is modelled on, has a swappable battery.
8. **A topology audit on every compile** (0.7, 0.15). 16 of 41 OpenSCAD parts in the finished Ribbit have edge-only contacts; 6 parts silently collapsed in the chats.
9. **Fix `mirror_parts`** (0.4, 0.13). Mirrored servo outputs land 25.3 mm off, and half of all mirrors were followed by hand fixes.
10. **Make `compare` automatic, with your sketches as targets** (6.0, 6.2, 6.3b). It was used 9 times against 188 `look`s, and its segmentation refuses 8 of your 13 reference photos, so robust masks come first.

Item 5 is 1.1a; item 7 uses the removal-order planner (1.1b) in WARN-only mode. The planner's other verdicts and the craft lint (3.5) come next, and both need your build notes and labels before they gate anything. Item 10 is Phase 6 work, but its first step (masks, 6.2) doesn't depend on the earlier phases and can run alongside them.

## What the evidence says, and how sure we are

Confidence:
- **High:** shown on our own scenes or chats, or by several independent sources.
- **Medium:** one solid source, or several that are small or from another domain.
- **Low:** an inference, or a source with problems.

The strongest evidence turned out to be our own. The papers mostly point the same way, but with smaller effects or narrower conditions than the first draft claimed.

0. **Where the time goes.** *High.* The 16 chats took about 8.2 active hours and $174.
   - About 70% went to model generation: thinking (53% of output tokens) plus writing code.
   - Fixing critiques took 121 min for assembly, 84 for craft and 54 for cost; the cost fixes ran $35.
   - 60% of `model_part` calls re-modelled an existing part.
   - The agent placed 812 fasteners by hand and made 120 probe calls just to find holes and screw directions.
   - It narrowed joint ranges 38 times after `verify_design` runs. Not every narrowing was gaming, but at least one hid real clipping (elbows 105° → 75°, then you saw the arms clip).
   - `check_scene` returned issues on 92 of 92 calls; 76% were flush-face noise.
   - `find_parts` never showed a price.
1. **Your failures are geometric facts a check can compute.** *High.* That includes serviceability: the prototype shows Ribbit's torso contents can't be reached without a near-full teardown, and finds the front/back shell split, which frees the Pi; the battery also needs a layout change. After "How would I actually build the head??", the agent spent a long run finding, by eye and one at a time:
   - screws buried under a shell skin;
   - servo screws in blind holes;
   - a missing set of screws;
   - screw tips running into the next part;
   - a cap whose mesh split into pieces;
   - a lost mirror.

   A prototype fastener probe reads all 309 of Ribbit's screws in 1.3 s, and it found a regression that nobody had flagged: four effector screws floating after the spheres were enlarged. Sprout shipped 59 parts with no fasteners at all. The dollar failure is just as concrete: the first Ribbit cost $7,914 against a $4,200 budget, nothing flagged it, and to compare prices the agent placed candidate servos and deleted them because `find_parts` shows none.
2. **Tools and feedback help a lot; the size of the effect is uncertain.** *Medium.*
   - On CADGenBench, the same model (Opus 5) scores 36.1% in a baseline harness and 59.6% with a render-measure-validate server. Opus 4.8 moved only 27.4% → 31.5%, and the source is a 49-sample mirror marked "reference only". The first draft's "86.9% vs 37.3%" compared different models.
   - SWE-agent's interface took GPT-4 Turbo from 11% to 18%.
   - Diagnostic feedback beat pass/fail in FunCADBench: 19 → 8 tasks for one model when diagnostics were removed. The other model's 22 → 0 includes unfinished runs; there were 46 tasks.
   - Executable tests agreed with experts far better than an older VLM metric did (F1 0.96 vs 0.55, on 125 samples).
   - None of these isolate one change cleanly, so our micro-evals have to measure our own effect sizes.
3. **Nobody has solved assembly checking, and geometry alone isn't enough.** *Medium.*
   - In the one robot-design study, 8 of 23 checks failed for every model, among them driver access, fastener interfaces, clearance and cable routing. But that's one design each from four OpenAI models.
   - No benchmark measures assembly sequence, insertion paths or tool access, though interfaces and clearances are measured.
   - Generic planners solve 77–82% of large assemblies at best, and need clean CAD. "Straight-line removal solves most real assemblies" was a paper's premise, not a result.
   - Hence: semantic checks first, scoped removal, and WARN until quiet on known-good robots. Even the CAD tools that sell this keep a human in the loop.
4. **Cost needs prices at selection time and a load model you can trust.** *High for the first, high for the risk.*
   - The "670 of 670 brand picks" study (skincare, a different paper than cited) shows brand only breaks exact ties: a +0.1-star edge reverses it, and specs explain 82% of choices. So models follow prices when they can see them.
   - The real gap is that ours can't see them.
   - The flip side: our Servo torque check passes Ribbit's knees at 0.49 N·m because it never bends them. At a 40° crouch, MuJoCo measures 0.98 N·m on two legs, about 1.9 on one (matching the 1.85 hand estimate). A cheapest-that-passes solver on today's model would under-size the joints that matter.
   - Builders report servos failing at stalls and duty cycles. In one study, an LLM-written load model let through 27 of 34 designs the expert model judged infeasible (from the skeptical review; not re-audited).
   - The TravelPlanner result (0.6% → 90.2% with a solver, like-for-like) is travel planning, not parts. It supports handing constraints to a solver in general, not an effect size.
   - **The data a solver needs is mostly missing.** Of 37 actuators, 7 have a list price and 4 have torque data; only 1 has both.
   - **The torque rule itself is wrong for legs.** Robots that walk well carry their knees at about 0.2–0.55 of stall in single stance (most crouch angles estimated from their walking parameters), and none meets the 1/5-of-stall rule the check uses. A rule calibrated on ToddlerBot, Open Duck Mini, OP3, Darwin and RoboCup humanoids is in [`actuator_sizing.md`](research/Agent%20harness/actuator_sizing.md).
5. **Relations over coordinates is plausible, not proven for mechanisms.** *Low–medium for mates as placement; medium for planning the decomposition first.*
   - The strongest result found is on Claude itself (AssemCAD, AssemBench, verified in Tables 3–4). Claude 4.8 kept the intended assembly structure in 0.8% of its runnable programs, and Opus 4.8 in 0%, against 66.7% for GPT-5.5. Inside a spec-first framework (typed parts, ports and mates written before geometry, then a deterministic interface library), Claude 4.8 reached 82.5%. Scoring is by an LLM judge.
   - ArtiCAD found the same: planning components and connectors before geometry gave 100% success, against 89.2% when they were planned late (success judged by VLMs).
   - So the lever is the plan (parts, ports, split planes, service faces) more than mates as a placement tool.
   - Most of the evidence is scene layout.
   - BesiegeField's "8/8 vs 0/8" counts files that parse; 4 of 8 machines were valid, and another model did fine with absolute poses.
   - The 0/90/180° angle collapse was measured on 7–8B open models. GPT-5.4 collapses 69% of the time, and no Claude model was tested.
   - Systems that tried persistent constraint solvers with agents had to rebuild them, or kept to trees.
   - In our chats, 64 of 783 placements (about 8%) were later flipped by 90° or 180°, 170 were moved, and 39 probe parts were placed only to find which way screws point. That's moderate evidence for seating catalog parts and hardware by their ports, and weak evidence for mates everywhere.
   - So `mate` is a one-shot placement helper, and anything more waits for an A/B test. Our own mirror bug is real either way: 25.3 mm, measured.
6. **Frontier CAD output lacks detail; the cited numbers don't measure it.** *Medium for the claim, low for the numbers.*
   - BenchCAD and RealCADBench both report swapped lofts and sweeps and "missing fine structures".
   - The "14 vs 22–43 operations" figure compared one grayscale render with full-mesh inputs.
   - The "21.5% fillet F1" figure is general face and edge selection through CadQuery selectors.
   - Editing supplied CAD is easier than generating it (CADEngBench, from the abstract). That backs the module kit and templates.
7. **Gates invite gaming; precision comes before gating.** *High,* now measured on our own data:
   - The prompt itself says "your job is to make every check pass, not to argue with it".
   - The 45 KB prompt is sent twice per session.
   - `check_scene`'s own hint tells the agent to move flush parts 0.2–0.5 mm.
   - The agent narrowed joint ranges 38 times.
   - Frontier agents cheat on about half of impossible coding tasks, mostly by editing the tests (ImpossibleBench, via the skeptical review). Read-only tests and an "abort and flag" option cut that.
   - False FAILs turn directly into harmful edits: a challenged model flips its answer 46% of the time.
   - Our own probe, in its first version, called 284 of 309 heads unseated because of one sampling mistake.
8. **VLMs compare, tools measure.** *Medium.* Spatial benchmarks mostly use 2024–25 models. Several first-draft numbers didn't exist in their sources and are removed. What holds:
   - Metric size and cross-view reasoning are weak (VSI-Bench, MMSI-Bench).
   - Labels, crops, depth tools and known-size references help (Visual Sketchpad, Set-of-Mark, Q-Spatial).
   - The best VLM judge of 3D defects reaches MCC 0.30.
   - Opus 5.5 reads 2,576 px. Anthropic's guidance for it is "give it tools to crop, zoom, measure" rather than more thinking.
9. **Sample more only with a verifier.** *Low as a general claim.* The "1/iteration" paper measured how often improvements happen and never compared sampling with repair. Our own spread between runs (10–40 points, driven by early choices) is the real argument for best-of-N, and it needs a selector that isn't fooled by pose differences or bad masks.

## Where Basecase stands

**Ahead of every product found** (the product survey wasn't audited):
- real catalog parts with exact geometry;
- joints, poses and motion checks;
- MuJoCo simulation and training;
- BOM, printability and build guide;
- parallel part designers with ownership;
- an objective replica benchmark.

Every competitor stays on single parts.

**Gaps found in the code (all verified):**

| Gap | Where | Effect |
|---|---|---|
| The agent picks parts without seeing prices | `find_parts` (`src/agent/agentCatalog.ts`) shows no price, though `src/data/listPrices.ts` has them; cost first shows in `get_bom` | Overpriced designs (failure 2) |
| Budget isn't a check, and the over-budget flag ignores estimates | Not in `src/utils/engineering*.ts`; `bom.ts:328` compares `pricedUsd`, not `estimatedUsd`; the `get_bom` description still says "no price recorded" | Over budget never fails |
| No assembly check | `check_scene` / `verify_design` test no insertion path, driver access, screw host or retention; the build guide's order (`src/guide/guideOrder.ts`) is a heuristic, never collision-checked | Unassemblable designs (failure 1), and guides with impossible steps |
| Mirroring catalog parts is wrong by construction | `mirrorParts` (`src/agent/agentMirror.ts`) reflects position and conjugates rotation but can't mirror a bought part's mesh; the STS3215 output is 12.5 mm from the case centre on the drawing (12.66 mm from the mesh's bounding-box centre, hence 2 × 12.66 = 25.3) | Measured: every mirrored servo's output lands 25.3 mm off. In Ribbit the agent re-placed all 8 by hand, to within 0.3 mm, which cost it turns |
| `model_part` reports size, volume, triangles and fit problems with neighbours, but no body count, volume change or required features | `electron/cad-mcp/sceneTools.mjs` | Wrong holes and missing features pass; silent empty booleans; a cap that split into pieces was noticed only through a 5 g printability reading |
| The Servo torque check loads legs only straight | `src/utils/engineeringTorque.ts` (static holding and stance in the modeled pose) | Ribbit's knee reads 0.49 N·m, 0.98 N·m on two legs in MuJoCo at a 40° crouch, about 1.9 on one; and the 1/5-of-stall rule itself fails every robot that walks |
| Catalog mounting is free text | `src/data/components.ts` | Fastener chains into catalog parts can't be checked |
| `compare` uses a fixed 24° camera, and its segmentation needs a plain background | `src/three/viewport/captures.ts:139`, `src/utils/silhouette.ts` | 8 of your 13 references can't be measured at all. The Memo trap turned out to be hand pose, not perspective: Memo's front photo matches its orthographic drawing at IoU 0.955, every band within 2% except the hands |
| Images below what Opus 5.5 reads | 1,568 px photos, 1,024 px renders, 768 px pose previews; Claude 4.7+ reads 2,576 px | Small features and callouts lost, though no chat hit a cap; `compare` going unused matters more |
| One 590-line prompt for every session and subagent, sent twice | `electron/cad-agent-prompt.mjs`, as both `systemPrompt.append` and the MCP `instructions` | About 22k tokens of instructions per session; example leakage; "make every check pass" invites gaming |
| Fasteners don't follow their joints | `downstreamOf` (`src/utils/engineeringMass.ts`, used by the range sweep in `engineeringJoints.ts`) moves only listed children. Another session is changing the sweep code now (servo rotors and riders), so recheck this baseline | Range-of-motion FAILs until the agent hand-lists screws (20 of Ribbit's 21 joints); ranges narrowed to pass |
| `check_scene` flags intended contact | `electron/cad-mcp/inspectTools.mjs`, `shared.mjs` | On the finished Ribbit, 138 of 149 lines are screws or inserts in their own holes, or heads flush in counterbores. Another session is adding fastener-specific messages, so recheck this baseline |
| Most actuators have no price or torque data | `src/data/components.ts`, `src/data/listPrices.ts` | 1 of 37 actuators has both; torque checks and the sim fall back to estimates |
| No run artefacts kept | `bench/runs/` is absent; no judge critiques, events or token counts survive | Can't mine failures or measure change |

**Saved chats** (16 conversations, 1,974 tool calls, 109 failed; details in [`chat_mining.md`](research/Agent%20harness/chat_mining.md)):
- Your critiques, most frequent first: boxy shells; proportions; misread photos; disjointed subassemblies; designs that can't be put together (head halves, unscrewed arms, a battery hatch the battery can't pass); range-of-motion clipping.
- Agent-side failures: booleans that came back empty without an error, kernel crashes that lost edits, mirroring sign errors.

## Principles

1. **Decisions with a right answer go to code.** The model chooses discrete things (layout, which port, which subassembly split, which style); tools compute continuous values (placements, screw lengths, actuator sizes, camera fits).
2. **Every quality the user cares about has an executable check.** It returns a verdict and the fix in a few lines, and runs at the edit. A check gates "done" only once it's quiet on known-good designs; until then it warns. A FAIL can be waived with a reason that's shown to you. An untested requirement has no verdict. The agent can't weaken its own gates: no narrowing ranges, changing roles, hiding or offsetting parts to pass.
3. **Correct by construction before correct by checking.** Mates, fastening operations, proven modules and solvers make whole classes of error impossible.
4. **The VLM compares and finds; numbers confirm.** Every "missing", "misplaced" or "groove" verdict is confirmed by a measurement before an edit. Judges are pairwise, never 0–10.
5. **Nothing ships without an eval.** Every change is measured on fast auto-graded tasks with several seeds before it becomes the default. Bug fixes for measured faults (Phase 0) are the exception.

## Roadmap

Effort: S = days, M = 1–2 weeks, L = more. Each phase ends with its "done when".

### Phase 0: Trustworthy checks and missing data (do first; mostly S, but 0.8, 0.14 and 2.0 are M)

0.10 and 0.12 need a reduced fastener chain (which parts a screw's shank passes through), the same primitive as 1.1a. Build that first; the prototype is in `scratch/assembly-probe.test.ts`. Bug fixes here fix measured faults. Prompt and kernel-default changes (0.17) are A/B-tested on the integrity and craft tasks in [`micro_eval_seed.md`](research/Agent%20harness/micro_eval_seed.md) before they become the default.

| # | Change | Fixes |
|---|---|---|
| 0.1 | Prices in `find_parts`: list or checked price with store and date, N·m/$ for actuators, and the remaining budget when one is set. Candidates are listed with their margin against the computed requirement, not sorted cheapest-first (see Phase 2) | 2 |
| 0.2 | Budget row in `verify_design` (FAIL over budget on the estimate, WARN above 90%); fix `bom.ts:328`; update the `get_bom` description | 2 |
| 0.3 | Running budget line on every `add_parts` / `update_parts` result once a budget is set: `BOM ≈ $412 of $800 (actuators $286)` | 2 |
| 0.4 | Mirror catalog parts by datum: keep the mesh unmirrored, place it with a proper rotation so its output axis lands on the mirrored axis; test with an STS3215 | 1 |
| 0.5 | *(Lower priority: no chat hit a cap, and `compare` was used 9 times against 188 `look`s; see 6.0.)* Image caps per agent: 2,576 px for Claude 4.7+; larger `look`/`compare` renders; a crop option that re-crops the original. Past 20 images in a request, every image (history and tool-result renders included) must be ≤ 2,000 px or the request is **rejected**, not resized. So count the session's images and drop to 2,000 px once past 20 | 3 |
| 0.6 | Archive every bench run's results outside git, with tokens and wall time | measurement |
| 0.7 | **Topology audit** on every compile: non-manifold edges located, with "fuse with at least 0.2 mm overlap" as the fix; body count; genus; an explicit error when a boolean empties a part. In finished, reviewed robots, 16 of Ribbit's 41 OpenSCAD parts have edge-only contacts (up to 374 edges in a shoulder yoke), and 5 Sprout parts are several loose bodies (its pelvis is 5). The manifold backend reports no error for any of them | 3, print |
| 0.8 | **A Servo torque check that matches walking robots.** Today it passes a joint at ≤ 1/5 of stall from straight-legged stance; it reads 0.49 N·m at Ribbit's knee; at a 40° crouch MuJoCo measures 0.98 N·m on two legs, about 1.9 on one. No robot that walks meets 1/5 of stall at the knee: Duck, OP3, Darwin and NUgus run 0.48–0.54 at their working crouch. Report three results per leg joint ([`actuator_sizing.md`](research/Agent%20harness/actuator_sizing.md)):<br>• **Stance:** single-stance load at the gait's crouch ÷ stall at nominal voltage, Pass ≤ 0.4 and Fail above 0.6.<br>• **Heat:** RMS over the gait ÷ rated, Pass ≤ 1.0 and Fail above 1.6.<br>• **Peak:** the robot must still walk in sim with its force limit at 0.7 × stall.<br>Caveats from the note: the walkers' crouch angles are mostly estimates, the load model is quasi-static with all mass on one foot, and the 0.67 RMS factor is unmeasured. Under this rule several robots that walk land in Warn, which is intended: Warn means it walks, with thin margins or short sessions. The code's current rated fallback is stall ÷ 3; the note proposes 0.25 × stall.<br>Heat and Peak need a trained Walk policy: Ribbit's open-loop keyframe gait falls in 0.8 s, so its torques are fall loads. Until a policy exists, Stance is the dependable result | 2, and safety |
| 0.9 | List prices for the STS3250 and the XL430, Dynamixel torque data (the sim fell on "estimated from weight"), and pack prices for inserts and M2/M2.5 screws (the gaps the agent hit when you asked it to cut cost) | 2 |
| 0.10 | **Fasteners move with what they clamp** in range-of-motion sweeps, sims and poses, using the fastener chain. A prototype finds 704 of the 720 moving screws the agent assigned by hand; all misses sit on a fixed pseudo-joint. It needs a horn-screw exception (the joint's servo) until catalog ports (1.3) say which face is the horn. Today the agent must list every screw as a joint child (20 of Ribbit's 21 joints do); without that, the range row FAILs (23 of 30 calls) and the agent narrows ranges or toggles screws to reference | 1, and check trust |
| 0.11 | **Range changes are visible:** `verify_design` reports any joint range narrower than the brief or than its first definition, with the old value, and the agent can't silence it. Ranges were narrowed 38 times after verify runs, and at least one hid real clipping | Gaming |
| 0.12 | **Quieter, truer `check_scene`.** On the finished Ribbit, all 76 interference lines are screws or inserts in their own holes, and 62 of 73 flush lines involve hardware (screw heads, inserts and a dowel flush in their seats).<br>• Mask each fastener against its stack, up to its designed engagement.<br>• Report flush faces only between non-hardware parts, and fix flicker in the renderer, not by moving parts.<br>• Suppress repeated lines; lead with what's new since the last call.<br>• Add a twin-difference lint: mirrored pairs whose clashes, clearances, volume or bounds differ by more than 10% (not raw contact area, which differs legitimately where a servo is a rotated copy). Ribbit's right shank touches its servo over 2,252 mm², the left over 206 mm², because the right servo is a rotated, not mirrored, copy | Check trust, 1 |
| 0.13 | **`mirror_parts` bugs:** it copied stale saved geometry instead of the latest edit, and flipped a servo front-to-back. Twins stay linked, so editing one side offers to re-mirror the other. Half of all mirrors (26 of 50) were followed by hand fixes | 1, 3 |
| 0.14 | **Small tool fixes:**<br>• **Speed:** `add_parts` (15.5 s average) and `delete_parts` (12.5 s) cost 46 min across the chats. Part of that is by design: `applyAgentOps` sleeps 260 ms per added part and 160 ms per other edit for the cursor animation, and one queue serializes every actor in a scene. Cap the animation per call, let parallel subagents' edits run concurrently, then profile the rest with `perf:agent`.<br>• **Readable replicad errors:** `renderReplicad` (`electron/cad-kernel/kernel.mjs`) prints `String(err?.message ?? err)`, giving "[object WebAssembly.Exception]" or a bare number, though the bundled `replicad-opencascadejs` exports `getExceptionMessage(ex)` and `OCJS.getStandard_FailureData(ptr).GetMessageString()`. The 7 opaque replicad failures in the chats came from this.<br>• The `check_printability` crash "`printShapes is not a function`".<br>• `get_part_code` suggests the nearest ids instead of failing (21 guessed ids).<br>• A `find_in_scene` query by name, group, kind or region (105 `get_scene` calls, 12 truncated) | Time |
| 0.15 | **`model_part` reports volume change and body count** against the previous revision, and warns when the convex-hull volume drops below 50% (the outline collapsed) or the body count rises. Raw volume is the wrong signal: the head shell's deliberate hollowing cut it from 1,155k to 74k mm³ with the hull intact. 6 silent collapses, the worst to 5% of the previous volume | 3 |
| 0.16 | **Context hygiene:** `get_scene` summarizes by default (35 calls asked for everything; p90 8.8k tokens); `check_scene` without flicker lines; shorter `get_part_code`. Compact, or hand off to a fresh session, at about 350k instead of 971k. Find the subagent prefix breaks (three rewrites with no visible cause). Cache reads above 300k of context cost $19 across the chats, and results about $8 more. Context size doesn't change latency, so this saves money, not time | Cost of running |
| 0.17 | **Prompt fixes with measured causes** ([`prompt_audit.md`](research/Agent%20harness/prompt_audit.md)):<br>• Send the 45 KB prompt once; today it's both `systemPrompt.append` and the MCP `instructions` (Codex and Gemini get the MCP copy plus their own injection). The cost is small, about $3 of the chats' $174 thanks to caching. The reason is attention: about 11k tokens of duplicated rules on every call.<br>• Replace "your job is to make every check pass, not to argue with it" (line 447) with a check-integrity rule: never narrow a range, change a role, hide or offset a part to pass; report a check that seems wrong.<br>• Remove the "0.2–0.5 mm proud" flicker advice.<br>• Resolve solid-versus-hollow shells.<br>• Correct "geometry is mirrored correctly".<br>• Make OpenSCAD silhouette shells the default, with replicad only for lofts and fillets.<br>• Replace dimensioned head and limb examples with ratios.<br>• Give subagents a cut-down prompt.<br>• Drop "simulate the walk cycle shows whether it really walks" (line 493): open-loop gaits fall (Ribbit's after 0.8 s), so design checks use hold and shove, and walking uses a trained policy | 1, 3, gaming |

Done when:
- `npm run check` passes.
- The mirrored STS3215 output lands within 0.1 mm (today 25.3 mm, measured).
- A build over its budget on list estimates FAILs, tested on a code fixture with list prices. The Dynamixel Ribbit ($7,914 against $4,200, on your recorded prices) motivates this but isn't saved.
- Ribbit's knee load at the gait's crouch (never less than 30°) is reported. MuJoCo measures about 0.98 N·m on both legs (so about 1.9 on one), against the check's 0.49 N·m.
- Ribbit's range-of-motion row passes without screws listed as joint children.
- Ribbit's `check_scene` shows at most 15 lines, none for a screw in its own hole.
- A planted range narrowing is reported.
- The topology audit flags the shoulder yokes' 254 four-face edges. They're in the kernel's own mesh, not an export artefact; check one in Bambu Studio to see what the slicer makes of them.

### Phase 1: Assemblies that go together (failure 1)

| # | Change | Effort |
|---|---|---|
| 1.1a | **`check_assembly`, first part:** fastener chains, engagement and held-by, detailed below | S–M |
| 1.1b | **`check_assembly`, second part:** removal order, driver access, service depth and split suggestions, detailed below | M |
| 1.2 | **Seeded faults and clean negatives** for the checker. Faults are injected into Ribbit. Six were already tested (5 caught): delete an insert, shorten a screw 4 mm (missed), move a screw 2 mm sideways, sink a head 3 mm, delete a screw, pull a screw 4 mm out. Still to add: enlarge a shell over its screws (the real effector regression), bury a screw under a skin, blind an insert hole from the drive side. Measuring 95% recall needs dozens of faults, not six. Ribbit is a fault source, not a clean negative: it has known faults (four floating screws, 29 short engagements, an unfastened Pi and IMU). Clean negatives must be designs known to build: your builds first, then published robots with fastener CAD, if one turns up. ≥ 95% recall, and ~0 false FAILs on the clean set before any row may FAIL. A first run with six planted faults caught 5; it missed the shortened screw, because engagement depth isn't measured yet | S–M |
| 1.2b | **Proven module kit, pulled forward from 3.6:** STS3215/STS3250 joint with bracket, horn and idler; shell seam with bosses; battery bay and hatch; board mount. Each module has ports and fasteners and passes `check_assembly`. Plus two template robots (an SO-101-like arm, an Open Duck-like biped). Editing proven CAD beats generating it, and a constrained design space checked during generation gave the largest gains found (LegoGPT's stable share rose 24% → 98.8% with physics-aware rollback, a fine-tuned model on a tiny brick set). Modules must be pushed, not just available: only 18% of OpenSCAD calls used any of the 25 existing `robotics.scad` modules, and `servo_horn_face`, `screw_clearance` and `socket_screw` were never called | M |
| 1.3 | **Structured mounting ports** on catalog components (servo output, horn hole circle, case screws, board holes, camera mounts) from the datasheets already cited | M |
| 1.4 | **`fasten`**: `{ screw, through, into: insert \| nut \| port, at, from }`. Picks the stock length from grip and engagement, places screw, washer and insert or nut, cuts every hole, and checks driver access at once. In the reviewed Ribbit, on the 315-screw save, 29 of 97 insert-threaded screws engage under 1.5 × D (our working threshold; RoyMech gives 2 × D for plastics, and a heat-set insert's own thread length is the other natural bar), and 27 run past their insert, fine only if the hole continues (unverified). All lengths were chosen by eye | M |
| 1.5 | **Build guide uses the proven order** from `check_assembly` instead of heuristics | S |
| 1.5b | **Block-out decides splits and service access** ([`serviceability_and_splitting.md`](research/Agent%20harness/serviceability_and_splitting.md)): split only for a named reason (bed size, encloses a serviced part, captive servo or bearing, print strength, supports); covers split, load-bearing frames stay whole; the battery never sits inside a structural clamshell. Planning parts and connectors before geometry is what worked in AssemCAD (assembly structure kept in 0.8% of Claude 4.8's runnable programs alone, 82.5% inside the framework, by an LLM judge) and ArtiCAD (100% against 89.2%; success judged by VLMs). Every enclosing shell gets a split plane and removal direction before it's modelled, taken from the computed suggestion; electronics go on a tray reachable from that opening; you name what must be replaceable without a full teardown, or a default list applies (battery, compute, regulators, servos) | S |
| 1.6 | **Prompt:** replace "check the build order with look" with `fasten` for every joint, `check_assembly` after each subassembly and at the end, and "not done while Assembly FAILs". Keep the short design rules: split shells along their removal direction, one drive side per subassembly, 1–2 screw sizes (the lint warns above 3), inserts along print Z | S |

`check_assembly` runs in the analysis workers. Fastener chains and held-by are 1.1a; removal order, driver access, fit, service depth and split suggestions are 1.1b. Checks come in order of reliability. The first group uses what Basecase knows and generic planners don't: which part is a screw, an insert or a catalog servo.
- **Fastener chains:** along each screw axis it finds the clamped stack, what the thread ends in, the **engagement length** (≥ 1.5 × D in plastic, or the insert's length; the one planted fault the probe missed was a screw shortened by 4 mm), a tip in air, an uncut hole, and a head with nothing under it (countersunk heads tested on the cone). A prototype ran on Ribbit's 309 screws in 1.3 s and found the real regression: four effector screws floating in a cavity after the spheres were enlarged.
- **What holds each part:** fasteners, press fits, snaps or capture; plain contact doesn't count. This would have flagged all 59 parts of Sprout, which had no fasteners. It also flags Ribbit's Pi 5 and IMU, which have no hardware within 6 mm of their bounds even after the full-check pass (a proxy: capture by printed features wasn't checked). The battery's "hook-and-loop" strap and the buck converter's foam tape exist only in notes, so they're reported as unverified declarations until they're modelled.
- **Removal order, as a fixed point** ([`assembly_planning.md`](research/Agent%20harness/assembly_planning.md)):
  - Blocker sets are computed once on the final assembly: for each screw, its driver envelope; for each part, rays along its fastener axes, contact normals and ±x/y/z, cast both ways.
  - Then screws, parts and units (agent groups, fastened components, pairs that block each other) are removed until nothing more moves. Removability only grows, so the order doesn't matter.
  - A prototype runs this on Ribbit in about 3.5 s in one thread.
  - Precision is the hard part. Each modelling choice moved its verdict by 40–90 of 309 screws: a handle envelope versus a bit, counting parts above a head as clamped, servos as boxes, and no subassembly removal.
  - With realistic tools, Ribbit's screws come out as 107 pass, 22 pass with a build note, 96 need an L-key or ball-end, and 84 stay stuck, with 43 of 73 parts not removable. Only your build notes can say how many of those are real.
- **Driver access, only in the removal order:**
  - Three tool options: a straight bit plus handle, a ball-end key at 20–25°, and an L-key whose long arm swings ≥ 60°. Each is swept as capsules, not rays.
  - A screw that's blocked in the final assembly but free earlier in the order passes with a build note: "drive before installing X".
  - FAIL needs a provable cycle or fixed material. Anything else stuck is Unknown.
  - A mirrored design must get mirrored verdicts, as the checker's own self-test. The prototype failed it through vertex sampling.
- **Fit and cables:** a clearance class per fit, calibrated to the P1S with print coupons. Connectors must pass their holes, with slack across the joint range. All four models in the one robot-design study (one OpenAI design each) failed these; the roadmap had left them out.
- **Service depth** in EN 45554 steps (a part removed or a tool change; same-tool screws count as one), for named serviceable parts. Targets synthesised from the EU and French repair-score step bands: the battery ≤ 2 steps with no joint or structural part removed; the electronics tray ≤ 5; each servo ≤ 10, touching only its own joint's neighbours. Report the parts and screws that must come out first, with every part and tool path required to leave the robot, not just move its own length. Today Ribbit's battery, Pi and regulators have no path at all: the torso shell is one piece wrapped around them, and its side screws sit under the arms.
- **Split suggestions:** a part blocked in every direction by its own contents is flagged "must be split". The check proposes the plane with the fewest blockers by cutting the part and moving each half along its axis. On Ribbit's torso shell it finds front/back (0 and 1 blockers, against 5–7 for the other planes), the split an expert would choose and the one its head already uses. With that split applied, the Pi is one part away, but the battery stays buried: it sits behind the electronics shelf, whose screws are driven from above under the shoulders. So the check also reports **fasteners that don't face their service opening**, and serviceable items stacked behind less-serviced ones. When the flagged part is a load-bearing frame (Ribbit's torso frame holds the battery), the answer is a layout change, a battery bay or tray outside the frame, not a cut.

Every declaration that excuses a check (a snap, a press fit, an expected overlap) must be backed by geometry; a snap, for example, needs a cantilever that passes the deflection formula. Each declaration is listed in the final report. The report has at most 12 lines, worst first, each naming the parts, the blocker and the fix. Rows stay **WARN until they've proven quiet on the clean negatives** in 1.2. A FAIL can be waived with a reason, and every waiver is shown to the user.

The checks re-run after any edit to a part that hosts fasteners, not only at the end.

Done when:
- On build tasks, assembly faults found by the code graders in [`micro_eval_seed.md`](research/Agent%20harness/micro_eval_seed.md), and by your build notes where available, drop to zero. The checker can't grade itself.
- False FAILs on clean negatives are about zero.
- Every build guide sequence is proven where the planner finds an order; where it reports Unknown, the guide falls back to the heuristic and marks those steps.

### Phase 2: Affordable by design (failure 2)

| # | Change | Effort |
|---|---|---|
| 2.0 | **Actuator and price data, first:** of 37 actuators, 7 have a list price, 4 have torque data, and 1 has both; 59 of 186 components have a price. Add stall, rated torque, speed and voltage per version from the datasheets (Dynamixel X series, hobby servos, every QDD actuator, steppers, gearmotors) and a dated list price for each. Without this, torque checks read "No torque data", the sim estimates from weight, and a solver has four servos to choose from | M |
| 2.1 | **`size_actuators`**: sizes each joint for Pass on 0.8's Stance and Heat results, leaving Peak to the simulation (the robot must walk with its force limit at 0.7 × stall). It enumerates bus × voltage families and returns, per joint, the cheapest actuator with margin ≥ k plus one tier up. It iterates on the new masses and totals battery, regulator and adapter. Where nothing cheap passes, it offers geometry changes that lower the load (shorter link, lower battery). The load model is our code, never written by the LLM: in one study the LLM's own model let through 27 of 34 designs that the expert model judged infeasible | M |
| 2.2 | **Budget plan before modeling:** actuators ≤ 60%, compute ≤ 15%, power ≈ 10% as a start. Tethered compute unless the brief says autonomous; one actuator family; gear-ratio versions before bigger servos; lower the load before buying torque | S |
| 2.3 | **Premium-pick line** in `add_parts` when a part costs over 2× the cheapest one of its class that passes the same spec | S |
| 2.4 | **Refresh `listPrices.ts`:** Pi 5 4 GB is already $110. Add Jetson Orin Nano Super $399 and Pi Zero 2 W $15. STS3215 C018 runs $24–28 at most stores (the $13.89 often quoted is the 7.4 V C001); STS3250 $74–115 | S |

In `find_parts`, list the candidates that meet the computed requirement, each with its margin and price. Don't sort a whole function cheapest-first: agents show strong position bias, so the order would pick the part, not the margin.

Done when:
- Every actuator in the catalog has torque data and a list price.
- On budget-tier tasks, the under-budget rate is ≥ 95% with all checks passing.
- Cost regret (agent BOM against the solver minimum for its own geometry) is under 15%.
- The minimum torque margin and the simulated falls are no worse than the baseline: cost must not be bought with fragility.

### Phase 3: Parts that look expertly designed (failure 3)

| # | Change | Effort |
|---|---|---|
| 3.1 | **`expect` requirements in `model_part`**, beyond size: holes (count, Ø, axis, through), bosses, minimum wall, flat base, symmetry, volume, genus, required operations (loft, shell, fillet), interfaces. Measured pass/fail with the fix; a part is "done" only by citing them. Requirements are frozen at plan time: they can't be edited in the step that fixes the part, and any change is shown to you. Frontier agents game tests they can edit: over 79% of Claude's cheats on impossible coding tasks modified the tests | M |
| 3.2 | **Post-edit lint** on every `model_part`, 3–8 lines, beyond the fit problems it already reports: new clashes worth acting on (fastener contact masked), sharp visible edges, a solid that should be a shell, wall outliers, box-ness | S–M |
| 3.3 | **Semantic edge selection in replicad:** helpers for new edges from the last boolean, convex outer edges and edges on a plane. Reports "fillet hit N of M intended edges"; fallbacks log what they gave up, and rebuilt parts are diffed against their feature list | M |
| 3.4 | **Design-language sheet** posted with the reference sheet and handed to every part designer as data: style (covered character or honest mechanism), radius ladder, reveal, wall, screw style and where screws hide, colours | S |
| 3.5 | **`craft_review`** (WARN row), with thresholds measured on SO-101 and Open Duck Mini ([`craft_and_design_language.md`](research/Agent%20harness/craft_and_design_language.md)):<br>• envelope sharp share (convex edge turning near the hull at edges sharper than 60°): SO-101 0.39, Ribbit 0.73;<br>• printed bricks (solidity above 0.85: 11 of Sprout's parts);<br>• radius ladder: one dominant envelope radius per part, about 6 per robot;<br>• shell wall consistency (modal 3.0 mm on Duck);<br>• concentric corners;<br>• fastener vocabulary: target 1–2 thread sizes, warn above 3;<br>• exposed heads;<br>• butt seams;<br>• bed-edge chamfers.<br>Each part is weighted by how much of it is visible from outside the robot, measured from depth-buffered views; a convex-hull proxy ranked the soles first. Weighted this way Ribbit scores 0.65 and Sprout 0.49, and the lint names targets, e.g. Ribbit's pelvis: 7% of the visible surface at 0.91 sharp. On Ribbit, the envelope sharp share of the torso shell and frame (after several critique rounds) is 0.21–0.49, the head shell 0.77, and unseen hip brackets 0.92–0.99; experts keep interior edges sharp too. Open Duck Mini, a well-liked expert robot, scores 0.72, so the threshold needs an "unless the design language is faceted" exception. Calibrated on your labels before any threshold matters. Replaying the chats, these metrics followed your explicit edge requests (bevel 0.95 → 0.78, simplify 0.71 → 0.50) but not "more craft" or "more round". They're hints, not gates | M |
| 3.6 | **Shell recipes first, then the rest of the module library beyond 1.2b's joint, seam, battery bay and board mount** (shells are the hotspot: head shells took 35% of all compile time, and replicad fails 21% of calls against 6% for OpenSCAD).<br>**Proven-module library** via `find_recipes(query)`: shell with reveal and bosses, boss with insert, rib, vent slots, joint disc, counterbored screw, bed chamfer, servo joint with idler, battery bay and hatch. Each compiles in CI and passes the assembly and craft checks. Fetched on demand, never pasted into the prompt (examples leak) | M–L |
| 3.7 | **Fresh-context industrial-design critic:** sees our render (RGB and normals) beside a real expert reference in random order, and names the one largest gap or "no significant gap". 3 votes. Each finding is measured before any edit. It's adopted only after its rate of flipping to wrong answers is measured on your labels, preferably from a different model family. The best VLM judge on 3D defects reached only MCC 0.30, and 78% of its errors were false "missing part" calls (60% on the expert split) | S |

Done when: on craft tasks the pairwise judge prefers the new harness's parts over the old one's in ≥ 70% of pairs. The judge must first agree with ~50 of your own labels.

### Phase 4: Measurement that keeps us honest (runs alongside 1–3)

| # | Change | Effort |
|---|---|---|
| 4.1 | **Micro-eval suite** (a first 29 tasks, which also add serviceability, check-integrity and mirroring categories to the split below,, each from one of your critiques or a planted fault, are drafted with their graders in [`micro_eval_seed.md`](research/Agent%20harness/micro_eval_seed.md)), about 70 single-subassembly tasks of 5–20 minutes, auto-graded, 3–5 seeds, reporting mean and pass^k, with a held-out third never used for tuning:<br>• assembly (~25)<br>• cost (~15, including selection-only tasks graded against the solver)<br>• craft (~20)<br>• variance drivers (~10: photo reading, pose, URDF discovery) | M |
| 4.2 | **Pairwise judge** (Bradley–Terry, positions swapped, Unknown allowed), calibrated on your labels; replaces absolute 0–10 scores | S |
| 4.3 | **Every critique you give becomes a task**; read failure transcripts each round | ongoing |
| 4.4 | The whole-robot bench becomes a weekly end-to-end check; enter the part agent in CADGenBench | S |

### Phase 5: Relations instead of coordinates

| # | Change | Effort |
|---|---|---|
| 5.1 | **Ports from `model_part`**: OpenSCAD `echo("PORT", …)` or BOSL2 named anchors; replicad returns `{ shape, ports }`. Each port is verified against the mesh (a bore really is empty along its axis) | M |
| 5.2 | **`mate`, a one-shot placement helper** (like build123d's `connect_to`): part, port, target, target port, type (fastened, coaxial, face-to-face, press fit, slider), angle in quarter turns by default, offset, flip. It returns an absolute pose in closed form and records the ports used. No persistent global solver and no closed loops: AADvark had to rebuild its solver before its agent could use it, and ArtiCAD kept to trees because loops "are difficult for an LLM to keep consistent". Recorded mates are re-applied on recompile, with a loud warning when a port disappears. Revolute and slider mates become joints. Catalog and hardware ports first (their geometry never changes); ports on modeled parts and "mates by default" wait for an A/B test on 4.1 | M |
| 5.3 | **`define_skeleton` first:** joint frames, link lengths, the actuator per joint and symmetric pairs, before the block-out. Parts are placed in joint frames, mirroring mirrors the skeleton, and `size_actuators` runs on it | L |
| 5.4 | **Interface contracts for part designers** in a JSON plan stored with the scene: owned ids, envelopes, datums, bolt patterns and the screws crossing each seam, style tokens. `check_interfaces` must pass before a designer hands back | M |
| 5.5 | **Slim the prompt:** a ~150–200-line core of scope, frame, workflow, gates and the craft bar as outcomes, with gates first, plus a one-line-per-guide index. Recipes, priors, SimReady, motion and build rules move to guides, and **tool results push the relevant snippet at trigger points** (the first battery placed brings the battery-bay recipe; the first shell brings the shell guide) rather than waiting for `get_guide`. In Vercel's evals, agents never invoked an available skill in 56% of cases, while an index in the always-loaded prompt reached 100%. Instruction following falls with count (Opus 4: 94.6% at 100 instructions, 67.9% at 250). Log guide fetches, remove contradictions, and measure on 4.1 | S–M |

The strongest evidence in this phase is for planning the decomposition before any geometry, not for mates as such. In AssemCAD, Claude 4.8 kept the intended assembly structure in 0.8% of its runnable programs alone and 82.5% with a spec of parts, ports and mates written first (judged by an LLM). Item 1.5b starts that plan in Phase 1; 5.3 and 5.4 extend it to skeletons and interfaces between part designers.

### Phase 6: Reading references like an engineer

| # | Change | Effort |
|---|---|---|
| 6.0 | **`compare` runs without being asked** (its 24° render itself matches an orthographic view only at IoU 0.855, so use width bands, not raw IoU, for verdicts) (with 6.2's masks, or it can measure only plain-background photos): after the block-out and after each subassembly, every reference photo is compared and the result folded into the tool's reply. In 16 chats `compare` ran 9 times against 188 `look`s, never in the Memo chat with 4 photo critiques, while the agent measured pixels by hand 34 times | S |
| 6.1 | *(After 6.2. Studio renders like Memo's are near-orthographic, and the 24° render stays within compare's 15% band tolerance of them. Against a 70° phone photo, the camera alone moves Ribbit's silhouette IoU by about 0.12 with the model unchanged.)* **Camera-fitted `compare` (`fit_view`):** fit azimuth, elevation, roll, FOV, distance and offset to the photo's silhouette, seeded from EXIF focal length. Return IoU, contour distance in mm, width bands in the fitted camera and a red/blue overlay | M |
| 6.2 | **Robust photo masks** for any background: Apple Vision foreground masks, BiRefNet-lite (MIT), SAM 2.1 (Apache). **A prerequisite for 6.0 and 6.1:** today's flood fill refuses 8 of your 13 chat references and both Reachy photos (busy backgrounds); white robots on white backdrops leak; and on one "measured" reference (a G1 on a dark gradient) it silently counted 74% of the image as robot. A prototype with macOS's built-in Vision foreground mask (on-device, about 40 ms, no download) returned a mask for all 13 of your references. Inspected by eye on Memo's front, Memo's kitchen and Reachy's office photo, it was clean except for a slice of background on Reachy, which cropping to the model's projected bounds removes. (The refusal counts come from a Python replica of the app's rule.) | S–M |
| 6.3 | **Labelled renders:** flat ID colours, numbered labels, the same label per part in every view and in the photo overlay, optional dimension callouts and a mm grid | S–M |
| 6.3b | **Your sketches as targets:** an SVG, sketch or outline you paste becomes a `compare` target with a measured fit and the remaining gap in mm ("front outline 0.76 of yours; corners tighter than your 80 mm"). After "more round, less rectangle" with an SVG, the agent's head went from 0.55 to 0.75 overlap with your outline, but no scalar craft metric registered the change | S |
| 6.4 | **`trace_outline`:** photo contour to `profileBody` points in mm, with per-band deviation from the model | M |
| 6.5 | **`compare_parts`:** project each part's bounds into the photo as segmentation prompts, then return per-part height, width and offset errors | M |
| 6.6 | **Scale from a known part:** a catalog part visible in the photo sets mm per pixel | S |
| 6.7 | **Reference mesh from photos** (experimental, optional, user's API key or local Mac port). Scored with `bench/score.mjs`, used for missing views and proportions, never for dimensions; A/B on the bench before enabling | M–L |
| 6.8 | **Concept turnaround sheet** for new designs, picked by the user, used as reference images | M |

### Phase 7: Getting better on its own

| # | Change | Effort |
|---|---|---|
| 7.1 | **Best-of-N block-outs** scored automatically (silhouette fit, skeleton fit, proportion consistency, cost); the lead keeps the best. Only after 6.2, so the selector has masks for real photos, plus 6.1 for close-range phone photos. Bands where the reference's pose differs (hands, head) are excluded, since chasing them is what lowered Memo's drawing score. Score with width bands rather than raw IoU: even against an orthographic view, the 24° render's IoU is only 0.855. N is adaptive, sampling more only when early signals disagree (spread of photo ratios, URDF found or not) | M |
| 7.2 | **Harvest proven parts** from good runs into the module library after testing (Voyager-style) | M |
| 7.3 | **Mechanism generators** as tested library functions: gears, belts, four-bar linkages, servo joint modules, shell seams, snap pins, hinges | L |
| 7.4 | **Simulation parameter sweeps** over skeleton parameters (foot length, hip width, servo choice), with `check_assembly` re-run after each change | M |
| 7.5 | **Lessons playbook** (itemized, never rewritten wholesale), then GEPA-style optimization of tool descriptions and guide sections against the held-out micro-evals | L |

## Suggested order

1. **Phase 0, in three groups:**
   1. **Make the existing checks trustworthy** (0.10–0.12, 0.17), starting with the reduced fastener chain they share with 1.1a: fasteners follow their joints; range changes are visible; `check_scene` without fastener noise; the prompt sent once, without "make every check pass".
   2. **Data the agent is missing** (0.1–0.3, 0.9, 2.0): prices and torque for every actuator.
   3. **The rest of Phase 0.**
2. **Phase 1:** 1.1a, 1.3 and 1.4 first; then 1.5b; then 1.1b, in WARN mode. All graded with the micro-eval tasks and, ideally, your build notes.
3. **6.2 (photo masks)** in parallel with Phase 1, since it touches different code. Then 6.0.
4. **Phase 2.**
5. **Phase 3**, with shell recipes first.
6. **The rest of Phases 5, 6 and 7.**

Why this order:
- The chats show the agent already ignores or games the checks it has: 92 of 92 `check_scene` calls returned issues, and ranges were narrowed 38 times. New gates on top of untrustworthy ones would be gamed the same way, so trust comes first.
- Group 2 is mostly data entry: 36 of 37 actuators lack price or torque data.
- Phase 1 is still the biggest lever on the costliest failure: 121 of the 494 chat minutes went to assembly fixes.
- Phase 5 is the largest change to how the agent works, so it comes after the checks exist to measure it.

## Ground truth only you have

The experiments hit the same wall several times: geometry alone can't say whether a verdict is right.
- **Did you print or assemble Ribbit, or part of it? Which steps were hard or impossible?** The prototype planner leaves 84 of 309 screws undrivable and 43 of 73 parts stuck. Your build is the only way to tell real faults from a motion model that's too weak, and it would become the first clean-negative or seeded-fault set (1.2).
- **Which parts look amateur to you, and which look right?** About 50 pairwise labels on Ribbit and Sprout parts would calibrate the craft metrics (3.5) and the judge (4.2). The metrics separate styles today, but nothing ties them to your taste.
- **What torque margin do you want on legs?** The rule in 0.8 is calibrated on robots that walk, but at Warn on heat they walk for minutes, not hours.
- **What must be replaceable without a full teardown?** The default in 1.5b is battery, compute, regulators and every servo. Tell me if, say, you'd accept the battery staying in with a charge port, or want servos reachable without removing shells.

## What a skeptical lead will ask

From the independent review; none of these is answered yet.
- **Fixtures.** Every "done when" uses Ribbit or Sprout from `library/`, which committed tests can't read (AGENTS.md §0g). Turning a 475-part scene into a fixture built in code is real work. Measured options:
  - **CAD code only:** the whole Ribbit is 0.38 MB, but recompiling its 47 printed parts takes about a minute with the kernel pool. Fine for evals, too slow for `npm test`.
  - **One subassembly with stored meshes:** 0.2–1.3 MB (an arm is 0.6 MB, a leg 1.3 MB), fast enough for unit tests. Seeded faults go on top.
- **One robot.** Nearly every assembly number comes from Ribbit, after the agent's own audit. A second robot with real fastener CAD is still missing.
- **The graders' own precision.** The probe's known false positives (countersunk heads, mirrored-mesh sampling, service depth without units, a tool model that swings stuck screws from 70 to 211) flow into the eval tasks.
- **Eval cost.** At the chats' rate (about $174 for 494 minutes), 70 tasks × 3–5 seeds is roughly $700–2,500 and 20–90 hours per round. What's the budget? For pass/fail tasks, a standard power calculation (95% confidence, 80% power) needs about 90 task-runs per arm to detect a pass rate moving from 50% to 70% (e.g. 30 tasks × 3 seeds), and about 380 for 50% to 60%. So early rounds can only detect large effects; measure the big changes (Phase 0 and 1.1a) first, and pair runs on the same tasks and seeds to cut the variance.
- **Does the torque rule change Ribbit's verdict?** STS3250 knees score 0.39 at 12 V (Pass) and 0.42 at 11.1 V (Warn). Peak needs a trained policy, which takes minutes to an hour per candidate. So `size_actuators` can't run Peak inside its search loop; it sizes on Stance and Heat and checks Peak once at the end.
- **Mirror by datum (0.4) against the twin lint (0.12).** A correctly mirrored servo is a rotated copy, which is what produced the 2,252 vs 206 mm² asymmetry. Do mirrored brackets still fit it, or will the lint fire on every correct mirror? Answered on Ribbit: they fit (`collide` finds no printed-part-to-servo interference on either side), but contact areas differ, so the twin lint should compare clashes and clearances, not contact area.
- **Concurrency in 0.14.** Removing the per-scene queue touches per-call undo, part ownership and commit order. It needs a design and a `perf:agent` run.
- **Coordination.** Another session is already editing `cad-agent-prompt.mjs`, `inspectTools.mjs` and the sweep code. Part of 0.10 and 0.12 may already be in progress there.
- **Defaults you should approve:** the engagement threshold (1.5 × D or 2 × D), and the default list of serviceable parts. These decide FAIL rows.

## Open decisions

- **Mates as the main way to place parts (Phase 5).** The evidence now points to a narrower start: catalog parts and fasteners seated by ports (8% of placements were flipped, and 39 probe parts were placed to find screw directions), with general mates only after an A/B test.
- **Reference meshes and concept art (6.7, 6.8):** hosted APIs on the user's key, local Mac ports, or both. Hunyuan weights can't be the default (their licence excludes the EU, UK and South Korea).
- **Critic model:** the same model in a fresh context, or a different one (CADSmith used a stronger model as judge).
- **Your labels:** about 50 pairwise judgements on craft, to calibrate the judge in 4.2 (the same as the question above).
