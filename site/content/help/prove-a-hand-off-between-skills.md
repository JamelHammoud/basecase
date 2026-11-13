---
title: Prove a hand-off between skills
date: 2026-11-13
collection: simulate-and-train
type: task
order: 10
keywords:
  - hand-off
  - handoff
  - transition
  - prove
  - unproven
  - switch skills
  - Stop First
related:
  - build-a-routine
  - train-an-animation-as-a-move
covers:
  - src/components/routines/HandoffFixes.tsx
  - src/workspace/useHandoffs.ts
  - src/routines/physicsKit.ts
  - src/routines/physicsProver.ts
  - src/routines/handoffTraining.ts
  - src/skills/handoff.ts
---

Check that your robot can switch from one skill straight into another, such as Walk into a Wave, without falling.

A Routine only switches between two skills once the switch has run in the simulation. Until then, the step after the switch is refused.

1. In **Play**, open **Routines** and the Routine with the switch.
2. Find the step that says it isn't proven, such as “walk to wave isn't proven in simulation”.
3. Click **Prove** on that step.

![The Wave step after Walk, with Prove and Stop First](/help/prove-a-hand-off-between-skills/refused.png)

Basecase runs the switch 8 times on your robot, each from a slightly different start and at a different moment in the first skill. With no falls, the step turns ready and the Routine can run.

## When it falls

The step then says how many of the 8 tries fell, such as “walk to wave fell in 3 of 8 tries in simulation.”

1. Click **Train Hand-off** on that step. It's there when the second skill is a move you trained from an animation.
2. Wait while the move retrains. The **Simulate** tab shows its progress.

![The Wave step with its fall count, Train Hand-off and Stop First](/help/prove-a-hand-off-between-skills/fell.png)

Training starts from your trained move and from states the first skill really passes through. Arena then checks the move against its own animation. The new move replaces the old one only if Arena passes it and the switch runs 8 times with no falls. Otherwise your move stays as it was, the step keeps its fall count, and a message says why.

To avoid the switch instead, click **Stop First**. The robot settles before the step.

## Limits

A proof belongs to the robot and the two skills as they are. A change to a mass, size or joint makes the switch unproven again. So does retraining either skill. **Train Hand-off** retrains moves only, not skills taught from a sentence, and it needs the desktop app.

Case logic shows in the same Routines tab, so its steps get **Prove** too. When the agent builds a Routine or Case logic, it proves each switch itself and tells you about any that fell.
