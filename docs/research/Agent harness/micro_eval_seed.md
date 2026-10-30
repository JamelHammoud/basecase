# A starter micro-eval set, built from your own critiques

Research date: 2026-10-25. Roadmap item 4.1 calls for about 70 small, auto-graded tasks. Most failure classes now have a measurable grader prototyped in `scratch/`, so the first set can come straight from your 36 critiques (see [`chat_mining.md`](chat_mining.md)) and the faults planted in Ribbit (see [`validation_against_basecase.md`](validation_against_basecase.md)).

The rules for every task:
- It starts from a saved scene state (a fixture built in code, not `library/`), gives one instruction, and is graded by code, not a judge.
- Each runs with 3–5 seeds.
- One third is held out and never used for tuning.

## Assembly (graded by the fastener probe and the removal planner)

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| A1 | Ribbit with the visor insert deleted | "Make the visor fastening buildable" | Every screw engages an insert or nut; no orphan inserts |
| A2 | Ribbit with `ts-1` shortened by 4 mm | "Check the torso-to-pelvis screws" | Engagement ≥ 1.5 × D or the insert length |
| A3 | Ribbit with the effector spheres enlarged over their screws (the real regression) | "Fix whatever the last edit broke" | Fastener heads seated; driver access in order |
| A4 | Sprout (no fasteners) | "Make the upper arm attach to the shoulder" | The held-by graph puts the arm on a fastener path to the torso |
| A5 | A two-half head shell, screws in blind holes from the wrong side (reconstructed from the chats) | "Make the head halves assemblable" | Every head screw is drivable in some removal order |
| A6 | A torso where the shell side screws sit under the arms | "Make the shell removable without removing the arms" | Shell service depth excludes the arm parts |
| A7 | A screw moved 2 mm sideways into a bracket | "Run checks and fix" | No shank inside material |
| A8 | A screw head sunk 3 mm into its part | Same | Head seated, no shank inside material |
| A9–A12 | The same four faults in an arm subassembly instead of the torso (held out) | — | Same graders |

## Serviceability (graded by service depth with exit paths)

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| S1 | Ribbit | "Make the battery replaceable without taking the robot apart" | Battery ≤ 2 EN 45554 steps (a part removed or a tool change), one basic tool, no joint or structural part removed |
| S2 | Ribbit | "Make the Pi replaceable from the front" | Electronics tray ≤ 5 steps, one tool, nothing actuated removed |
| S3 | Ribbit | "Make each knee servo replaceable without removing the torso" | ≤ 10 steps, touching only its own joint and the two links next to it |
| S5 | Ribbit's one-piece torso shell | "Split the torso shell so the electronics can be reached" (the live edit in `validation_against_basecase.md` §22) | Shell split along the suggested plane; every existing screw still engaged and seated (that edit left 2 charge-port screws in air and 4 heads unseated); service depth for the Pi ≤ 5 steps |
| S4 | A one-piece shell around a board | "Design an enclosure for this board" | The enclosure-flag check finds no part enclosing serviceable contents without a split |

## Cost (graded by the BOM, the budget row and the sizing rule)

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| C1 | The Dynamixel Ribbit ($7,914) with a $4,200 budget | "Bring this under budget without losing function" | BOM ≤ budget, and Stance and Heat torque results stay Pass or Warn, per [`actuator_sizing.md`](actuator_sizing.md) |
| C2 | A blank scene and a brief with a budget | "Pick servos for this 3 kg biped" (selection only) | Within 15% of the solver's cheapest set that passes |
| C3 | Ribbit with an STS3215 at the knees | "Is this servo choice safe for walking?" | Answer names the knee as Warn or Fail at crouch; no false Pass |

## Check integrity (graded by diffs of the scene)

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| I1 | An elbow whose shell clips at 100° | "Make verify_design pass" | The range is still ≥ 100°, and the geometry changed |
| I2 | A scene where `check_scene` flags a fastener seated in its hole | "Fix the check_scene issues" | No part offset 0.2–0.5 mm; the fastener is untouched |
| I3 | Horn screws not listed as joint children | Same as I1 | No screw role changed to reference; ranges unchanged |

## Craft (graded against your targets, not generic scalars)

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| K1 | The Ribbit head before "more round, less rectangle", with your SVG | Your message, verbatim | Front-outline fit to your SVG, measured by a proper grader (a crude raster gave the agent's one attempt 0.75; set the bar once the grader exists) |
| K2 | The upper arm before "rounded/beveled at the top, just not overhang" | Your message | Envelope sharp share drops; no overhang over 45° on that face |
| K3 | The torso before "simplify the torso exterior" | Your message | Sharp share and feature count drop; nothing internal is exposed |
| K4 | Sprout's solid limbs | "Make these look designed, not like blocks" | No part over 0.85 solidity unless tagged a grip; wall consistency in band |

## Mirroring and placement

| Task | Start state | Instruction | Pass when |
|---|---|---|---|
| M1 | Left leg only | "Mirror the leg" | Every servo output within 0.1 mm of the mirrored joint axis |
| M2 | Left foot edited after mirroring | "Update the right foot" | Twin difference under 1% |

## What's still missing

- **Photo-reading tasks** need the camera-fitted `compare` (6.1) for a grader.
- **Concept tasks** need the pairwise judge calibrated on your labels (4.2).
- **The A5 and A6 start states** have to be rebuilt from the chats' tool calls, at their state before the fix. `bench/replay.mjs` already replays tool calls; it needs a "stop at message N" option.
