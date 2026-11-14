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
  - find-where-a-skill-fails
covers:
  - src/skills/arena.ts
  - src/skills/artifacts.ts
  - src/skills/skillRecords.ts
  - src/skills/skillRows.ts
---

Arena runs 96 fresh tries of a skill under conditions the trainer never saw. Every skill Basecase trains from a goal must pass it before its row says it's ready.

A policy can score well in training and still fail on a real robot. For example, it may have learned the friction of one floor, or the exact timing of one servo. Arena catches problems like these before you rely on the skill.

## What Arena runs

Arena tries the skill 32 times in each of three variants. The tries run on MuJoCo, and the skill's contract judges each one.

- **Randomized.** Each try draws its own start pose and physics. Friction ranges from 0.8 to 1.2 times, link masses from 0.9 to 1.1 times, and servo strength from 0.9 to 1 times. Every joint starts up to 1° off.
- **Half the timestep.** The physics steps twice as finely, so a skill that only works at one step size fails this variant.
- **Servo delays.** Each servo answers late, by a random delay of up to 40 ms.

If a skill was trained on wider ranges, Arena uses those ranges instead. It never uses narrower ones, so no training setup can make Arena easier.

## The bar

A skill passes when, in every variant, the share of passing tries is at least 75% with 95% confidence. That works out to 29 of 32 tries or better in each variant.

The skill's row shows its weakest variant, for example "31 of 32 tries, at least 86%". The percentage is the confidence bound, not the raw share of passing tries.

A Motor Kit skill that fails isn't kept. Its row shows the weakest variant of its best try, for example "Refused in Arena: 20 of 32 tries". For Walk, this includes the runs at half speed and standing still.

If a policy was trained from a Case's tries, its Case judges it instead. The policy runs the Case 32 times. Each run starts with joints up to 5° off and draws friction, masses, servo strength and delays of up to 20 ms the same way as in **Checks**. The bar is the same: 29 of 32. For steps, see [Train a policy from your tries](/help/train-a-policy-from-your-tries).

## Why the reward can't cheat

Training follows a reward, a score that guides the policy toward the goal. A reward can be gamed. For example, a robot rewarded for staying upright may learn to stand still instead of walking.

Arena never reads the reward. It judges the contract, the written rules for what passes and what fails, and the trainer can't change those rules. The random draw for each try is sealed, so the trainer never learns which conditions Arena will use.

[Coaching](/help/coach-a-skill) rewrites only a skill's reward. A coached skill must still pass the same contract to be kept.

Arena says whether a skill passes, not where it starts to fail. [Find where a skill fails](/help/find-where-a-skill-fails) searches past Arena's ranges for that point. Its runs use their own random draws, so Arena's stay sealed.

## When a skill goes stale

A skill is tied to the design it passed on, and what happens after a change depends on what changed. For Motor Kit skills, **Recheck** runs Arena again without any training. For a skill you taught in words, **Recheck** asks the agent again.

| Change | What happens |
|---|---|
| A color or a name | Nothing. The skill stays ready |
| A mass, a size or a joint's range | The row shows **Recheck** |
| A joint added or removed, or its type or axis changed | The row shows **Train**: the skill must be trained again |

When you move a skill to another design, its training starts from the old one, but its Arena result never carries over. A skill you [install from Hugging Face](/help/install-a-skill-from-hugging-face) doesn't bring its result either. Arena judges it again on your robot.

The same contract code judges Case tries. To learn how a contract reads, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
