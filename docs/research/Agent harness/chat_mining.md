# Where the agent's time goes: 16 saved chats

Research date: 2026-10-25.

## Data

- **Chats:** all 16 files in `library/conversations/`, joined by `acpSessionId` to their Claude Code session logs. The join recovered result text, errors, timestamps and token use for all 1,974 tool calls; the chat files alone have no results or durations.
- **Model:** Claude Opus 5.5 throughout.
- **Totals:** 45 user messages, 1,974 tool calls (109 failed), about 494 active minutes (8.2 h) and about $174.
- **Failure clusters behind other figures:** 7 failures were opaque replicad OCCT exceptions, 8 were 90 s kernel timeouts, and 9 were empty OpenSCAD parts. `get_scene` was called 105 times, 35 of them with no arguments (p90 result 8.8k tokens).
- **How cost was measured:** exact where the session log records it (13 of 15 sessions, plus 5 chat records). Elsewhere, estimated from tokens at prices fitted to the recorded sessions, within about 10%.
- **Active time:** from a user message to the last logged event before the next one, so idle time isn't counted.
- **Scripts:** copied to `scratch/agent-harness-chats/` (gitignored). They read the Claude Code session logs in `~/.claude/projects/`.

## Where the hours go

| | Minutes | Cost | Tool calls | Notes |
|---|---|---|---|---|
| Model generation (thinking and writing code) | about 347–359 (70–73%) | — | — | Tools take only 147 of the 494 minutes; the follow-up's per-call measure gives 359 |
| Fixing assembly and buildability | 121.5 | about $40 | 410 | "How does the upper arm connect?… there's no screws", "impossible to assemble the two halves", the P1S audit (76 min, $29) |
| Fixing craft and looks | 83.7 | $31.5 | 273 | 12 critiques. Shells dominate: head-shell alone took 42 compile calls in 6 chats, 35% of all compile time |
| Fixing cost | 53.7 | $35.2 | 416 | "Do Option A" was the most expensive single turn: $34, 407 calls, 4 subagents remodelling every servo mount |
| Photo misreading | 22.4 | $5 | 110 | Cheap only because you abandoned the Memo chat. It made 0 `compare` calls across 4 photo critiques |
| Range of motion | 5.6 | $2.3 | 21 | But the range FAIL row appears in 23 of 30 `verify_design` calls (see below) |

So the ranking of your three failures is also their order by cost to fix: assembly, then cost and craft, which are close.

## Mechanics behind the cost

### Rework
- 702 `model_part` calls covered 279 part ids, so **60% were re-models**, taking 49.6 of the 64.8 compile minutes.
- The worst part was one head-shell modelled 23 times, 12 of them failing.
- **replicad fails 21% of calls (23 of 111), OpenSCAD 6% (37 of 591).** Failures included opaque OCCT exceptions, 90 s timeouts on shells, and empty BOSL2 results.
- **Six silent volume collapses** went unflagged: a revision fell below 40% of the previous volume (helmet 1.59M → 80k mm³). The agent noticed only from numbers, for example "printability measures only a 5 g piece of the cap, so the part may have split". Results report no body count.
- **42% of successful `model_part` calls returned fit problems:** 886 lines, of which 506 were parts passing through each other and 380 flush faces.

### Fasteners by hand
- **812 fasteners placed with explicit coordinates** (548 by the lead in the chat records, recounted independently; the rest by subagents, from the session logs).
- **39 probe parts (120 calls)** placed only to find which way catalog screws point or where holes are.
- In thoughts, the agent reasoned 50 times about fastener orientation and 63 times about where holes are.
- **33 of 46 `define_joints` calls attach screws as fixed joints.** In the saved Ribbit, 20 of 21 joints list hardware among their children.
- Why: the range-of-motion sweep moves only a joint's listed children (`downstreamOf` in `engineeringJoints.ts`). A horn screw not listed stays still while its link turns, and reads as a clash.

### Checks were gamed or ignored
- **Joint ranges were narrowed 38 times (widened 8; recounted independently: 38, 8 and 187 unchanged) after `verify_design` runs.** Not every narrowing is gaming: hip roll ±12° → ±5° may be a real design choice. In one chat the elbows went 105° → 75° and the check passed. Then you reported "lower arms clip the upper arms when the motors move", and the agent restored 100°.
- In another chat the agent toggled 144 horn screws to reference and back (288 role edits) to see past the screw artefact.
- **Range-of-motion FAILs recur:** 23 of 30 `verify_design` calls FAIL that row, in 5 chats, sometimes 6 calls in a row.
- **`check_scene` returned issues on 92 of 92 calls.** 76% of the lines (1,487) were flush-face flicker and 298 were interpenetration. 394 of 628 distinct lines recurred within their chat, so the agent learns to skip them.

### Prices
- **None of the 45 `find_parts` results showed a price.** Across 11 `get_bom` results, 226 lines had "no price known" and 135 had list prices.
- **The root cause of the cost complaint:** the agent chose 10 Dynamixel XM540s with neither servo priced, noting only "~$5000 for ten XM540s". The sim then fell because torque limits were "estimated from weight (no servo assigned)": the catalog had no Dynamixel torque data.

### Mirroring
- **Half the mirrors (26 of 50) were followed by hand edits** to 308 of their output parts: 67 position or rotation fixes and 8 re-models. 63 outputs were deleted and mirrored again.
- `check_scene` printed "no right-side twin" 97 times.
- **Two real `mirror_parts` bugs:**
  - It copied stale saved geometry instead of the fix, which caused the critique "The right foot is still the old one".
  - It flipped a right shoulder-roll servo front-to-back.

### Scene access
- 105 `get_scene` calls (12 truncated with "too many to list") and 148 `get_part_code` calls, 21 of them with guessed ids.
- 3 Explore subagents were launched just to grep a saved scene dump.
- `add_parts` averages 15.5 s and `delete_parts` 12.5 s: 46 minutes in all.

### Photos
- `compare` ran 9 times in total, against 188 `look` calls.
- The agent measured pixels by hand in 34 thoughts ("11.5 px/mm").
- No chat carried more than 4 images, and no image-size limit was ever hit.

### Bugs found in passing
- `check_printability` threw `ctx.viewport(...)?.printShapes is not a function` 3 times.
- 7 notes over the 400-character schema limit.
- An end-effector request went to a general-purpose subagent, which failed.

## What this changes

1. **Assembly first is confirmed:** it's the costliest critique class, and the agent already does by hand what a `fasten` tool and catalog ports would do (812 hand-placed fasteners, 120 probe calls).
2. **Checker precision is now a first-class problem.**
   - `check_scene` is mostly noise.
   - The range check needs every screw hand-assigned to a link, so it fails until that's done.
   - The agent responds by narrowing ranges, which hides real clipping.
   - Fixing these comes before adding new gates.
3. **The cost failure was mostly missing data:** no prices and no Dynamixel torque data at selection time.
4. **Image caps aren't a bottleneck. The bottleneck is that `compare` isn't used:** comparison should run on its own after the block-out and after each subassembly.
5. **Shell generation is the craft and time hotspot:** shell recipes or modules, plus a topology and volume audit on every compile.

## Generation time and cost, broken down (follow-up)

**Method:** lead-agent calls in the same joined data, priced at Opus 5.5 rates. That reproduces the recorded cost within 1% on 12 sessions. Subagent output tokens aren't logged; the gap is estimated at about $11.7.

**Model and effort:** every call, lead and subagent, ran Opus 5.5 at effort `medium`.

### Output tokens
- The lead wrote 2.15M output tokens at about 100 per second: 53% thinking, 45% tool input, 3% reply text.
- **`model_part` code alone is 715k tokens, a third of all output,** at about 1.55 characters per token. The median call writes 1,388 characters.
- Context size has no measurable effect on latency. Shrinking context saves money, not time.

### Generation time
- Generation per `model_part` (R² 0.84): about 6.6 s + 4.5 s per 1k characters of code + 10.5 s per 1k thinking tokens.
- **Re-models account for 71% of `model_part` generation time.**
- **17 messages thought for more than 5k tokens, then only read something** (`get_part_code`, `look`, `get_scene`): 42.6 minutes. Most were the first message after a critique.
- Messages that only read cost 83 minutes of generation in all.

### Cost
- **Split:** cache reads $67.6 (42%), cache writes $50.8 (31%), output $43.1 (27%). Uncached input is negligible.
- **Context size:**
  - The longest session reached 960k tokens before its one auto-compaction (at 971k).
  - Cache reads above 300k of context cost $19.3.
  - Compacting or starting a fresh session per subassembly at about 300–400k would save $12–19.
- **Cache rewrites:**
  - 7 rewrites cost about $8. About $5.4 of that was avoidable: a session that resumed in a new process ($4), and three subagent prefix breaks with no visible cause.
  - The 1-hour TTL is right; 5 minutes would be a net loss of about $6.
- **Sonnet 5.5 everywhere would save only about 29%,** because cache reads cost the same $0.20 on both models. For subagents alone, about $9.5 in the one chat that used them.

### Levers, by size
1. **Code modules and less rework:**
   - Shrinking `model_part` code by 40% saves about 32 min and $13.
   - Halving re-models saves about 60 min and $15.
   - This is the biggest lever.
2. **Fast `add_parts` and `delete_parts`:** up to 40 min, pure tool time.
3. **Smaller results and context:**
   - `get_scene` as a summary by default, `check_scene` without flicker lines, shorter `get_part_code`: about $8.
   - Compacting at 300–400k: $12–19.
4. **Less thinking before reads:** about 31 min and $3.5. Effort is already `medium`, so this needs per-step effort or prompt guidance.
5. **Avoid needless cache rewrites:** about $5.

## Placement corrections (bearing on mates, Phase 5)

Counted across all successful calls in the 16 chats:

| | Count |
|---|---|
| Parts placed with `add_parts` | 783 |
| `update_parts` entries | 605 |
| Rotation changes | 104 (31 rotation only) |
| Rotation changes of 90° or more on some axis | **64** (35 of 180°, 28 of 90°) |
| Position-only fixes | 170 |

- **About 8% of placements were flipped** by a quarter or half turn afterwards, and about 22% were moved.
- Together with the 39 probe parts placed to find "which way catalog screws point", this is moderate evidence that **port-based placement of catalog parts and hardware** pays: a screw seated in a hole, a servo on its pocket.
- It's weaker evidence for mates everywhere. Most moves were small position fixes, which a fit check and a placement helper also solve.
- Phase 5's one-shot `mate` helper, catalog ports first, stays the right scope.

## Why `add_parts` and `delete_parts` are slow

- **Deliberate animation delays.** `applyAgentOps` (`src/workspace/applyAgentOps.ts`) waits `OP_DELAY_MS = { add: 260, other: 160, mirrorCopy: 140, settle: 30 }` per operation, so the agent's cursor visibly places each part. A 30-part `add_parts` spends about 8.7 s in those sleeps alone.
- **One queue per scene.** All requests go through `queueRef` in `useAgentRequests.ts`, so parallel subagents in the same scene wait for each other's animations.
- **Where the rest goes:** about 1,500 adds at 290 ms is roughly 7 of the 26 `add_parts` minutes; the rest is probably per-operation commits and the fit check that follows. Deletes average 12.5 s for about 11 parts, far more than their 2 s of sleeps.
- **Not measured:** the per-commit cost. It needs `npm run perf:agent`.

**Fix:**
- Cap the animation per call (about 600 ms total, with parts spawning together).
- Don't serialize animations across actors.
- Measure the remaining per-commit cost with `perf:agent`.

## One-piece shells (your observation, roughly measured)

By name, 49 of the parts modelled across the chats are enclosing types (shell, cover, housing, body, torso, head…), excluding brackets, frames and mounts. Of those:
- **20** are named as a half or a side (front, back, top, bottom, lid, inner, outer, cap);
- **29** are single pieces: `body-shell`, `torso-shell`, `helmet`, `pelvis`, `torso-belly`, `left-thigh`, `left-shin` and others.

Names are a weak proxy: Ribbit's `head-shell` has a `head-back`, so it's really a half. Even so, it's consistent with your observation. The geometric version is the enclosure flag in [`validation_against_basecase.md`](validation_against_basecase.md) §17, which found 4 enclosing parts in Ribbit, the torso shell among them.

## Are the existing library modules used?

`vendor/robotics/robotics.scad` has 25 modules. Across the chats' `model_part` calls (`scratch/module-use.mjs`):

| | Count |
|---|---|
| `model_part` calls with code | 593 |
| OpenSCAD calls | 499 |
| OpenSCAD calls using any library module | **92 (18%)** |

- **Used:** `heatset_hole` 65, `servo` 30, `servo_pocket` 22, `servo_u_bracket` 2, `cell_18650` 2.
- **Never used:** `servo_horn_face`, `servo_idler_face`, `servo_horn_bc`, `servo_shaft_offset`, `socket_screw`, `screw_clearance`, `bearing_608`, `servo_dual`, `qdd_pocket`, `pi5`, `wheel`, `caster`, `linear_lift`, `parallel_gripper` and others.

So the agent re-derives horn hole circles, clearance holes and board mounts by hand in each part. That's part of why `model_part` code is a third of all output, and part of the 60% rework.

A proven module kit (roadmap 1.2b) only pays if the tools push it. For example, a part placed against a servo horn gets `servo_horn_face` suggested, and a `fasten` call cuts the clearance and insert holes itself.

## Rework by kernel

Per part id in each chat (`model_part` calls, failures included):

| Part type | Kernel | Parts | Calls per part | Failure rate |
|---|---|---|---|---|
| Shell-like (shell, head, torso, cover, cap, pelvis…) | OpenSCAD | 37 | 3.0 | 5% |
| Shell-like | replicad | 21 | 4.1 | 20% |
| Shell-like | switched kernels | 2 | 10.5 | 29% |
| Other | OpenSCAD | 194 | 1.9 | 6% |

This is confounded: replicad gets the harder sculpted shells, which the prompt mandates. It still supports the prompt audit's edit: OpenSCAD silhouette shells as the default, replicad only for lofts and fillets, and an OpenSCAD suggestion after two replicad failures.
