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
hub_the_design_agent_order: 30
hub_the_design_agent: |
  - For a Routine, it proves each switch between skills and names any that fell.
---

Check that your robot can switch between skills, such as from Walk into a Wave, and meet the movement needed after the switch.

A Routine switches between two skills only after that switch has run in the simulation. Until then, the Routine refuses the step after the switch.

1. In **Play**, open **Routines**, then open the Routine with the switch.
2. Find the step that says it isn't proven. For example, “walk to wave isn't proven in simulation”.
3. Click **Prove** on that step.

![The Wave step after Walk, with Prove and Stop First](/help/prove-a-hand-off-between-skills/refused.png)

Basecase runs the switch 8 times on your robot, with slightly different starts. Moving skills switch at sampled moments. For Kit switches from Settle, the robot settles for 1.5 seconds first. Kit turns get 8 tries in each direction. If the second skill can't run on your robot, a message tells you so.

Each try must avoid falling. Kit switches also have to meet their movement requirement within 2 seconds:

- Walk travels at least 0.08 m in the commanded direction.
- Turn rotates at least 0.3 rad in the requested direction, with no more than 0.02 m of drift.
- Settle travels no more than 0.02 m during the last 0.5 seconds.

When every required switch passes, the Routine can run. A passing skill's Arena result doesn't prove a switch into it. A failed switch names the movement that failed on its step, even when the robot stayed upright. The other skills and switches keep their own results.

## When it falls

If the robot falls, the step shows how many of the 8 tries fell. For example, “walk to wave fell in 3 of 8 tries in simulation.”

1. Click **Train Hand-off** on that step. This button appears when the second skill is a move you trained from an animation.
2. Wait while the move retrains. You can follow its progress in the **Simulate** tab.

![The Wave step with its fall count, Train Hand-off and Stop First](/help/prove-a-hand-off-between-skills/fell.png)

Training starts from your trained move and from states the first skill passes through. Arena then checks the move against its own animation. The new move replaces the old one only if Arena passes it and the switch runs 8 times with no falls. If either check fails, your move stays as it was, the step keeps its fall count, and a message explains why.

To avoid the switch instead, click **Stop First**. The robot settles before the step starts.

## Limits

A proof applies to the robot and the two controllers as they are now. Changing physics, a servo, the drive setup or either policy invalidates the affected proof. Retraining either skill also invalidates it. **Train Hand-off** retrains only moves, not skills taught from a sentence, and it needs the desktop app. Only one skill can train at a time. If another skill is training, a message names it.

Case logic appears in the same Routines tab, so its steps get **Prove** too. When the agent builds a Routine or Case logic, it proves each switch itself and tells you about any that fell.
