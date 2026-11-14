---
title: Arena
date: 2026-11-13
updated: 2026-11-13
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
covers:
  - src/skills/arena.ts
  - src/skills/artifacts.ts
  - src/skills/skillRecords.ts
  - src/skills/skillRows.ts
---

Arena tests a skill with 96 fresh tries under conditions the trainer never saw. Every skill that Basecase trains from a goal has to pass Arena before its row says it's ready.

A policy can score well in training and still fail on a real robot. For example, it may have learned the friction of one floor or the exact timing of one servo. Arena catches problems like these before you rely on the skill.

## What Arena runs

Arena tries the skill 32 times in each of three variants. The tries run on MuJoCo, and the skill's contract judges each one.

- **Randomized.** Each try draws its own start pose and physics. Friction is scaled by 0.8 to 1.2, link masses by 0.9 to 1.1, and servo strength by 0.9 to 1. Every joint starts up to 1° off.
- **Half the timestep.** The physics runs with a timestep half as long. A skill that works at only one step size fails this variant.
- **Servo delays.** Each servo responds after a random delay of up to 40 ms.

If a skill was trained on wider ranges, Arena uses those ranges instead. Arena never uses narrower ranges, so no training setup can make it easier to pass.

## The bar

A skill passes when, in every variant, the share of passing tries is at least 75% with 95% confidence. That means 29 of 32 tries or better in each variant.

The skill's row shows its weakest variant, for example "31 of 32 tries, at least 86%". The percentage is the confidence bound, which is lower than the raw share of passing tries.

Basecase doesn't keep a Motor Kit skill that fails. Its row shows the weakest variant of its best try, for example "Refused in Arena: 20 of 32 tries". For Walk, the variants include the runs at half speed and standing still.

If a policy was trained from a Case's tries, its Case judges it instead. The policy runs the Case 32 times. Each run starts with joints up to 5° off and draws friction, masses, servo strength, and delays of up to 20 ms the same way as in **Checks**. The bar is the same: 29 of 32. For steps, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

## Why the reward can't cheat

Training follows a reward, a score that guides the policy toward the goal. A policy can learn to game its reward. For example, a robot rewarded for staying upright may learn to stand still instead of walking.

Arena never reads the reward. It judges each try against the skill's contract, the written rules for what passes and what fails, and the trainer can't change those rules. The random draw for each try is sealed, so the trainer never learns which conditions Arena will use.

[Coaching](/help/coach-a-skill) rewrites only a skill's reward. A coached skill still has to pass the same contract to be kept.

## When a skill goes stale

A skill is tied to the design it passed on. When you change that design, the skill's row changes depending on what you changed:

| Change | What happens |
|---|---|
| A color or a name | Nothing. The skill stays ready |
| A mass, a size or a joint's range | The row shows **Recheck** |
| A joint added or removed, or its type or axis changed | The row shows **Train**: the skill must be trained again |

For Motor Kit skills, **Recheck** runs Arena again without any training. For a skill you taught in words, **Recheck** asks the agent again.

When you move a skill to another design, its training starts from the old one, but its Arena result never carries over. A skill you [install from Hugging Face](/help/install-a-skill-from-hugging-face) doesn't bring its result with it either. Arena judges it again on your robot.

The same contract code also judges Case tries. To learn how a contract reads, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
