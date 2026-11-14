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

Every skill Basecase trains from a goal must pass Arena, 96 fresh tries under conditions the trainer never saw, before its row says it's ready.

A policy can score well in training and still fail on a real robot. It may have learned one floor's friction, or one servo's exact timing. Arena exists to catch that before you rely on the skill.

## What Arena runs

Arena tries the skill 32 times in each of three variants, on MuJoCo, judged by the skill's contract:

- **Randomized.** Each try draws its own start pose and physics. Friction ranges 0.8 to 1.2 times, link masses 0.9 to 1.1 times and servo strength 0.9 to 1 times. Every joint starts up to 1° off.
- **Half the timestep.** The physics steps twice as finely, so a skill that only works at one step size fails.
- **Servo delays.** Each servo answers late by a random delay of up to 40 ms.

A joint driven by an STS3215 C001 or XL330 draws its own servo instead, in every variant. Its gain, damping, inertia, friction, torque limit and delay come from how 24 emulated units of that servo differ. The servo strength and delay ranges above skip that joint. Once you calibrate the joint, it runs on its own fit and draws nothing.

Where a skill was trained on wider ranges, Arena uses those instead. It never uses narrower ones, so no training setup can make Arena easier.

## The bar

A skill passes when, in every variant, the share of passing tries is at least 75% with 95% confidence. In practice that's 29 of 32 tries or better in each.

The skill's row shows its weakest variant, such as "31 of 32 tries, at least 86%". The percentage is that confidence bound, not the raw share.

A Motor Kit skill that fails isn't kept. Its row shows the weakest variant of its best try, such as "Refused in Arena: 20 of 32 tries". For Walk, that includes the runs at half speed and standing still.

A policy trained from a Case's tries is judged by its Case instead. It runs the Case 32 times, each from joints up to 5° off, with friction, masses, servo strength and delays up to 20 ms drawn as in **Checks**. The bar is the same: 29 of 32. Steps are in [Train a policy from your tries](/help/train-a-policy-from-your-tries).

## Why the reward can't cheat

Training follows a reward, a score that nudges the policy toward the goal. A reward can be gamed: a robot paid for staying upright may learn to stand still instead of walking. Arena never reads the reward. It judges the contract, the written rules of what passes and fails, and the trainer can't change those.

Each try's random draw is sealed, so the trainer never learns which conditions Arena will use.

[Coaching](/help/coach-a-skill) rewrites only a skill's reward, so the coached version must pass the same contract to be kept.

## When a skill goes stale

A skill is tied to the design it passed on. For Motor Kit skills, **Recheck** runs Arena again with no training; for a skill you taught in words, it asks the agent again.

| Change | What happens |
|---|---|
| A color or a name | Nothing; the skill stays ready |
| A mass, a size or a joint's range | The row shows **Recheck** |
| A servo calibrated or rolled back | The row shows **Recheck** |
| A joint added or removed, or its type or axis changed | The row shows **Train**: the skill must be trained again |

A skill moved to another design starts its training from the old one, but never carries its Arena result with it. The same holds for a skill you [install from Hugging Face](/help/install-a-skill-from-hugging-face): Arena judges it again on your robot.

The same contract code judges Case tries; [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts) explains how a contract reads.
