---
title: Checks in the Build tab
date: 2026-11-13
updated: 2026-11-13
collection: build-and-print
type: reference
order: 1
keywords:
  - blockers
  - notes
  - readiness
  - torque
  - stability
  - thin walls
  - screws
related:
  - get-a-robot-ready-to-build
  - from-design-to-build
  - troubleshoot-build-check-blocks-ready-to-build
  - printability-estimates
covers:
  - src/readiness/wording.ts
  - src/readiness/findings.ts
  - src/utils/engineering.ts
  - src/utils/engineeringPower.ts
  - src/utils/engineeringBudget.ts
  - src/components/build/ChecksSection.tsx
  - src/utils/engineeringSimModel.ts
  - src/utils/engineeringStrength.ts
  - src/utils/engineeringEnvelope.ts
  - src/components/build/EnvelopeRows.tsx
  - src/readiness/caseChecks.ts
  - src/utils/engineeringFalls.ts
  - src/wiring/wiringChecks.ts
---

The Build tab runs every check below and lists the worst first: red, then amber, then green, then gray for checks that are Not run. A red row holds at least one blocker, and a blocker stops Ready to build. An amber row holds only notes. The problems below appear in the same words the app uses.

## Build checks

| Check | What it looks at | Problems it can report |
|---|---|---|
| Parts attached | Whether each part is held by something | “These parts aren’t attached to anything, so they’d fall loose.” |
| Screws | Every screw, insert and the hole it goes into | Screws ending in air, with no hole, too long, too short, off their holes or too deep. Empty inserts. Holes too small for an insert. Thin walls around an insert |
| Assembly | Whether a build order exists | “A screwdriver can’t reach these screws, in any build order.” and “These parts can’t be put in place, in any build order.” |
| Fit | Parts that overlap, and room for battery leads | “These parts overlap by … mm.” and “There isn’t enough room for the battery’s wires and connector.” |
| Printing | Each printed part against your printer | Parts too big for the plate, walls too thin to print, and parts meant to be clear |
| Real parts | Where every part comes from | Placeholders, parts with nothing saying where to get them, and parts whose link and numbers aren't checked |
| Repairs | How much comes apart to replace a part | “Replacing these means taking a lot apart.” as a note |

## Engineering checks

| Check | What it measures | When it fails |
|---|---|---|
| Weight | Total weight and center of mass | Never. It reports the numbers |
| Servo torque | Each servo's load against its stall and rated torque | Over 0.60 of stall torque, or running too hot. Amber from 0.40 of stall |
| Peak torque | Torque and speed while a trained policy walks for 14 seconds | Over stall for more than 50 ms, or a fall. Amber when over 5% of a joint's walk is past its servo's torque-speed line. Not run without a walking policy |
| Falls | Each leg servo's torque as the robot tips over from 12 directions, against its rated torque | Over 5× rated torque in a fall. Amber over 3×. Not run until the agent checks falls |
| Torque estimates | Joints with no servo or published torque | A note that the simulation guesses their torque from weight |
| Servo models | Whether each servo runs on a measured calibration | A note naming the servos that aren't calibrated |
| Payload | What an arm lifts at full reach and close in | Never. It reports the numbers |
| Joint parts | The parts each joint names | A joint naming a part that doesn't exist |
| Servo alignment | Each servo's output against its joint axis | A servo that doesn't line up with its joint |
| Joint support | What holds each joint on both sides | A note when a joint is held on one side only |
| Range of motion | Each joint swept every 15° through its range | A part hit before the end of the range |
| Range changes | Joints narrower than when first defined | A note with the old range |
| Servo version | Servos sold in more than one version | A servo with no version chosen |
| Servo voltage | The supply's voltage against each servo's range | A voltage outside the servos' range |
| Current and runtime | The battery's current against the servos' draw | A battery that can't supply enough current |
| Supply current | The power supply's amps against the servos' draw | Shown in place of Current and runtime when there's no battery |
| Regulator input | The battery against each regulator's input range | A battery outside the regulator's range |
| Servo bus | Each servo's connector against the bus adapters in the build | A servo no adapter plugs into. Shown only when it fails |
| Standing stability | The center of mass over the feet | “The robot would tip over standing still.” |
| Heat near servos | PLA parts within 1 mm of a servo | A note that PLA softens from servo heat |
| Strength | Each printed part between a servo and the next joint | Under 1.3 times its load. Amber under 2 times |
| Budget | The estimated cost of the parts left to buy against your budget | Over budget. Amber above 90%. Not run until you set a budget |

Open **Peak torque** to see how each joint's walk compares with its servo's torque-speed line. A joint with a warning shows its plot under the warning. To open the plot for any other joint, click it.

A servo can't give full torque and full speed at the same time, so the blue line falls from stall at 0 rpm to no torque at top speed. Each dot is 25 ms of the walk. A white dot above the line means the joint asked for more torque than the servo gives at that speed.

![Peak torque's warning for Left knee, with its walk plotted against the STS3215's line and the next servo up](/help/build-checks/peak-torque-plot.png)

Gray dots are moments when the joint was braking, and the line doesn't limit those. The dashed line is the servo's rated torque. The gray line is the next stronger servo in the catalog for the same bus and voltage, and its name appears under the plot.

Each Case in the scene also gets its own row, named after the Case. The check runs the Case 20 times with randomized physics, and it passes if 18 of those runs succeed. If a Case misses more often than that, it adds a note, never a blocker. If the robot can't run the Case at all, its row fails with the reason. For example, the robot might be an arm on a Case that needs driven wheels, or it might fall on hold. For the full list of reasons, see [Try a Case](/help/try-a-case).

## Problems every check can show

| Message | What it means |
|---|---|
| “Some checks didn’t finish, so this answer isn’t complete.” | A check stopped at its time limit or with an error. It counts as a blocker until a run finishes |
| “The agent disagrees: …” | The agent thinks the problem is wrong, and says why. The blocker stays until you act on it |
| “These hidden parts weren’t checked.” | The checks that measure the scene skip parts you hid |

To work through the list, follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
