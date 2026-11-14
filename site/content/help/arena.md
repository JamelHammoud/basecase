---
title: Arena
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: concept
order: 3
keywords:
  - verify
  - verified
  - evaluation
  - domain randomization
  - sim to real
  - robustness
  - recheck
  - confidence
related:
  - teach-a-robot-a-skill
  - case-goals-worlds-and-contracts
  - coach-a-skill
  - stress-test-a-skill
covers:
  - src/skills/arena.ts
  - src/skills/artifacts.ts
  - src/skills/skillRecords.ts
  - src/skills/skillRows.ts
---

Arena runs 96 fresh tries of a skill under conditions the trainer never saw. Every skill that Basecase trains from a goal has to pass Arena before its row says it's ready.

A policy can score well in training and still fail on a real robot. For example, it might have learned the friction of one floor, or the exact timing of one servo. Arena catches problems like these before you rely on the skill.

## What Arena runs

Arena tries the skill 32 times in each of three variants. All tries run on MuJoCo, and the skill's contract judges each one.

- **Randomized.** Each try draws its own start pose and physics: friction from 0.8 to 1.2 times, link masses from 0.9 to 1.1 times, and servo strength from 0.9 to 1 times. Every joint starts up to 1° off.
- **Half the timestep.** The physics steps twice as finely. If a skill works at only one step size, it fails this variant.
- **Servo delays.** Each servo answers late, by a random delay of up to 40 ms.

If the skill was trained on wider ranges, Arena uses those ranges instead. It never uses narrower ones, so no training setup can make Arena easier to pass.

Arena tests only inside these ranges. To find where a skill breaks beyond them, see [Stress-test a skill to find where it breaks](/help/stress-test-a-skill).

## The bar

To pass, a skill needs at least 75% of its tries to pass in every variant, with 95% confidence. That works out to 29 of 32 tries or better in each variant.

The skill's row shows its weakest variant, for example "31 of 32 tries, at least 86%". The percentage is the confidence bound, not the raw share of tries that passed.

When a Motor Kit skill fails, Basecase doesn't keep it. Its row shows the weakest variant of its best try, for example "Refused in Arena: 20 of 32 tries". For Walk, this includes the runs at half speed and standing still. When a move trained from an animation fails, Basecase doesn't keep it either, and its row tells you why.

A policy trained from a Case's tries is judged by that Case instead. The policy runs the Case 32 times. Each run starts with joints up to 5° off, and draws friction, masses, servo strength and delays of up to 20 ms the same way **Checks** does. The bar is the same: 29 of 32. For the steps, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

## Why the reward can't cheat

Training follows a reward, a score that guides the policy toward the goal. Rewards can be gamed: a robot rewarded for staying upright may learn to stand still instead of walking.

Arena never reads the reward. It judges the contract, the written set of rules for what passes and what fails, and the trainer can't change those rules. The random draw for each try is also sealed, so the trainer never learns which conditions Arena will use.

[Coaching](/help/coach-a-skill) rewrites only a skill's reward. A coached skill still has to pass the same contract before Basecase keeps it.

## When a skill goes stale

A skill belongs to the design it passed on. When you change the design, what happens depends on what you changed:

| Change | What happens |
|---|---|
| A color or a name | Nothing. The skill stays ready |
| A mass, a size or a joint's range | The row shows **Recheck** |
| A joint added or removed, or its type or axis changed | The row shows **Train**: the skill must be trained again |

For Motor Kit skills, **Recheck** runs Arena again without any training. For a skill you taught in words, **Recheck** asks the agent again.

If you move a skill to another design, its training starts from the old design, but its Arena result never carries over. The same goes for a skill you [install from Hugging Face](/help/install-a-skill-from-hugging-face): its result stays behind, and Arena judges it again on your robot.

The same contract code judges Case tries. To learn how a contract reads, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
