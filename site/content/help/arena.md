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

Arena runs 96 fresh tries of a skill under conditions the trainer never saw. Every skill Basecase trains from a goal has to pass Arena before its row says it's ready.

A policy can score well in training and still fail on a real robot. It may have learned the friction of one floor, or the exact timing of one servo. Arena catches these problems before you rely on the skill.

## What Arena runs

Arena tries the skill 32 times in each of three variants. MuJoCo runs each try, and the skill's contract judges it.

- **Randomized.** Each try draws its own start pose and physics. Arena scales friction by 0.8 to 1.2, link masses by 0.9 to 1.1, and servo strength by 0.9 to 1. Every joint starts up to 1° off.
- **Half the timestep.** The physics steps twice as finely. A skill that works at only one step size fails this variant.
- **Servo delays.** Each servo answers late, by a random delay of up to 40 ms.

If training used wider ranges, Arena switches to those. It never uses narrower ones, so no training setup can make Arena easier.

## The bar

A skill passes when, in every variant, the share of passing tries is at least 75% with 95% confidence. That works out to 29 of 32 tries or better in each variant.

The skill's row shows its weakest variant, such as "31 of 32 tries, at least 86%". The percentage is the confidence bound, so it's lower than the raw share of passing tries.

Basecase drops a Motor Kit skill that fails. Its row shows the weakest variant of its best try, such as "Refused in Arena: 20 of 32 tries". For Walk, this includes the runs at half speed and standing still.

If you trained a policy from a Case's tries, the Case judges it in Arena's place. The policy runs the Case 32 times. Each run starts with joints up to 5° off, and draws friction, masses, servo strength and delays of up to 20 ms the same way **Checks** does. The bar stays at 29 of 32. For steps, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

## Why the reward can't cheat

Training follows a reward, a score that guides the policy toward the goal. A policy can game its reward: a robot rewarded for staying upright may learn to stand in place rather than walk.

Arena never reads the reward. It checks each try against the contract, the written rules for what passes and fails, and the trainer can't change those rules. The random draw for each try stays sealed, so the trainer never learns which conditions Arena will use.

[Coaching](/help/coach-a-skill) rewrites a skill's reward and nothing else. A coached skill has to pass the same contract before Basecase keeps it.

## When a skill goes stale

A skill's result holds for the design it passed on. After you edit that design, what happens next depends on what you changed:

| Change | Result |
|---|---|
| A color or a name | Nothing. The skill stays ready |
| A mass, a size or a joint's range | The row shows **Recheck** |
| A joint added or removed, or its type or axis changed | The row shows **Train**: the skill needs training again |

For Motor Kit skills, **Recheck** runs Arena again with no training. For a skill you taught in words, **Recheck** asks the agent again.

When you move a skill to another design, its training starts from the old design and its Arena result stays behind. A skill you [install from Hugging Face](/help/install-a-skill-from-hugging-face) also arrives without its result, and Arena judges it again on your robot.

Case tries use the same contract code. To see how a contract reads, go to [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
