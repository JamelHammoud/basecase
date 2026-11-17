---
title: Checks in the Build tab
date: 2026-11-13
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
  - src/utils/engineeringWeight.ts
  - src/utils/engineeringPower.ts
  - src/utils/engineeringBudget.ts
  - src/utils/engineeringTime.ts
  - src/components/build/ChecksSection.tsx
  - src/utils/engineeringSimModel.ts
  - src/utils/engineeringStrength.ts
  - src/utils/engineeringEnvelope.ts
  - src/components/build/EnvelopeRows.tsx
  - src/readiness/caseChecks.ts
  - src/utils/engineeringFalls.ts
  - src/wiring/wiringChecks.ts
---

Every check the Build tab runs, with the problems each one reports in the words the app uses.

Checks list the worst first: red, then amber, then green, then gray for Not run. A red row holds at least one blocker, which stops Ready to build. An amber row holds only notes.

## Build checks

| Check | What it looks at | Problems it can report |
|---|---|---|
| Parts attached | Whether each part is held by something | “These parts aren’t attached to anything, so they’d fall loose.” |
| Screws | Every screw, insert and the hole it goes into | Screws ending in air, with no hole, too long, too short, off their holes or too deep. Empty inserts. Holes too small for an insert. Thin walls around an insert |
| Assembly | Whether a build order exists | “A screwdriver can’t reach these screws, in any build order.” and “These parts can’t be put in place, in any build order.” |
| Board fit | A defined board’s outline, mounting hardware, footprints and plug access | Components or holes outside the outline, collisions, inaccessible plugs and unresolved geometry |
| Fit | Parts that overlap, and room for battery leads | “These parts overlap by … mm.” and “There isn’t enough room for the battery’s wires and connector.” |
| Printing | Each printed part against your printer | Parts too big for the plate, walls too thin to print, and parts meant to be clear |
| Real parts | Where every part comes from | Placeholders, parts with nothing saying where to get them, and parts whose link and numbers aren't checked |
| Repairs | How much comes apart to replace a part | “Replacing these means taking a lot apart.” as a note |

[Fit an electronics board](/help/fit-an-electronics-board) covers board placement. Electrical requirements and unrouted copper remain separate blockers.

For an Onshape robot, **Assembly** also lists **Fixed Mates** as notes. A cylindrical mate keeps its hinge, and the note names only its held slide, such as “Axle slide imports as fixed.” Other unsupported mates stay fixed. These notes don't block Ready to build.

![The Assembly check with the imported cylindrical axle slide held fixed](/help/import-an-onshape-assembly/cylindrical-slide.png)

## Engineering checks

| Check | What it measures | When it fails |
|---|---|---|
| Weight | Total weight and center of mass | Never. It reports the numbers |
| Servo torque | Each servo's load against its stall and rated torque | Over 0.60 of stall torque, or running too hot. Amber from 0.40 of stall |
| Peak torque | Torque and speed while a trained policy walks for 14 seconds | Over stall for more than 50 ms, or a fall. Amber when over 5% of a joint's walk is past its servo's torque–speed line. Not run without a walking policy |
| Falls | Each leg servo's torque as the robot tips over from 12 directions, against its rated torque | Over 5× rated torque in a fall. Amber over 3×. Not run until the agent checks falls |
| Torque estimates | Powered joints with no servo or published torque | A note: the simulation guesses their torque from weight |
| Servo models | Whether each servo runs on a measured calibration | A note naming the servos that aren't calibrated |
| Payload | What an arm with powered joints lifts at full reach and close in | Never. It reports the numbers |
| Joint parts | The parts and actuation each joint declares | A missing part or a passive joint with a motor assigned |
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
| Electrical connections | Source-backed pins, supply rails, returns and unresolved module requirements | Missing sources or grounds, incompatible rails, overloaded declared ratings, unsupported interfaces and unresolved protection |
| Cable reach | Servo bus routes and power connections with two scene endpoints through the declared joint ranges | A blocked or unresolved route, missing port geometry, or no compatible cable with enough recorded length |
| Standing stability | The center of mass over the feet | “The robot would tip over standing still.” |
| Heat near servos | PLA parts within 1 mm of a servo | A note: PLA softens from servo heat |
| Strength | Each printed part between a servo and the next joint | Under 1.3 times its load. Amber under 2 times |
| Budget | The estimated cost of the parts left to buy against your budget | Over budget. Amber above 90%. Not run until you set a budget |
| Time | Printing across your saved printers, estimated assembly and servo setup against your budget in hours | “Build time exceeds your budget.” Amber above 90%. A note without a budget |

An active [body fit](/help/fit-a-robots-body-from-a-recorded-run) adjusts the weights and centers of mass used by **Weight** and **Servo torque**. Keeping or rolling back a fit refreshes Checks. Old walk and fall measurements stop counting until they match the active body again. **Peak torque** and **Falls** need new simulation measurements on the changed body.

To enter hours and read the breakdown, [Set a time budget](/help/set-a-time-budget).

[Export a robot schematic](/help/export-a-robot-schematic) carries known connections and unresolved electrical requirements into KiCad. Exporting never clears a blocker.

Virtual fuse, switch and supply connections have no physical placement and are excluded from **Cable reach**. They remain on the wiring list.

Open **Cable reach** to read each failing connection's endpoints, required length and available cable length. A limiting joint position appears beside the connection. Click the finding's part names to select its endpoints. [Servo bus or Cable reach is red](/help/troubleshoot-servo-bus) explains the routing limits.

Open **Peak torque** to plot each joint's walk against its servo's torque–speed line. A joint with a warning shows its plot under the warning. Click any other joint to open its plot.

A servo can't give full torque and full speed at once, so the blue line falls from stall at 0 rpm to no torque at top speed. Each dot is 25 ms of the walk, and a white dot above the line asks for more than the servo gives at that speed.

![Peak torque's warning for Left knee, with its walk plotted against the STS3215's line and the next servo up](/help/build-checks/peak-torque-plot.png)

Gray dots are moments the joint was braking, which the line doesn't limit. The dashed line is the servo's rated torque. The gray line is the next stronger servo in the catalog for the same bus and voltage, named under the plot.

Each Case in the scene also gets a row, named after it. It runs the Case 20 times with randomized physics and passes at 18. A Case that misses more adds a note, never a blocker. A robot that can't run the Case fails its row with the reason, such as an arm on a Case that needs driven wheels, or a fall on hold. [Try a Case](/help/try-a-case) lists each reason.

Click a Case's row to draw its 20 paths on the canvas. Click a red path to open that seed at its first failure, as in [Replay a failing seed](/help/replay-a-failing-seed).

## Problems every check can show

| Message | What it means |
|---|---|
| “Some checks didn’t finish, so this answer isn’t complete.” | A check stopped at its time limit or with an error. It counts as a blocker until a run finishes |
| “The agent disagrees: …” | The agent thinks the problem is wrong, and says why. The blocker stays until you act on it |
| “These hidden parts weren’t checked.” | Parts you hid are left out of the checks that measure the scene |

To work through the list, follow [Get a robot ready to build](/help/get-a-robot-ready-to-build).
