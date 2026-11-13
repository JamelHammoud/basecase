---
title: Case goals, worlds and contracts
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: reference
order: 2
keywords:
  - contract
  - pass
  - miss
  - judge
  - margin
  - probe
  - success
  - failure
  - reach a spot
  - push a box
  - follow a path
  - walk without falling
  - touch a point
related:
  - make-a-case
  - arena
covers:
  - src/cases/caseGoals.ts
  - src/cases/caseWorlds.ts
  - src/cases/templates.ts
  - src/cases/touchTheDots.ts
  - src/cases/reachTheFlag.ts
  - src/cases/contract.ts
  - src/cases/scale.ts
  - src/skills/contract.ts
  - forge/crates/contract/
---

Every goal and world the Case builder offers, the numbers each goal takes, and exactly how a try is judged as passed or missed.

## Goals

| Goal | Robots | Numbers | Passes when |
|---|---|---|---|
| **Reach a Spot** | Wheels or legs | **Distance**, **Radius**, **Time** | The base stays within **Radius** of the spot for 0.3 s |
| **Push a Box** | Wheels or legs | **Push**, **Box**, **Radius**, **Time** | The box stays within **Radius** of the spot for 0.3 s |
| **Follow a Path** | Wheels or legs | **Spots**, **Spacing**, **Radius**, **Time** | The base reaches each spot in order, within **Radius** for 0.2 s |
| **Walk Without Falling** | Legs | **Distance**, **Time** | The base gets more than **Distance** from where it started |
| **Touch a Point** | An arm | **Distance**, **Height**, **Radius**, **Time** | The end effector stays within **Radius** of the point for 0.2 s |

On a robot with legs, these goals also fail when the robot falls: its base drops below half its starting height.

The builder starts each number at a default sized to the robot. Its limits:

| Number | Range |
|---|---|
| **Distance** | 0 to 5,000 mm; at least 100 mm for Walk Without Falling |
| **Height** | 0 to 2,000 mm |
| **Radius** | 5 to 1,000 mm |
| **Push** | 100 to 5,000 mm |
| **Box** | 40 to 600 mm |
| **Spots** | 2 to 8 |
| **Spacing** | 200 to 3,000 mm |
| **Time** | 2 to 120 s |

## Worlds

| World | Goals | What's in it |
|---|---|---|
| **Open Floor** | All | Nothing but the floor |
| **Corridor** | Wheels and legs | A wall on each side of the route |
| **Block** | Wheels and legs | A block in the way; tries get 5 s more on wheels and 8 s on legs |
| **Shelf** | Touch a Point | A box under the point |

A Case's name defaults to its goal and world, such as "Push a Box in a Corridor". A world that would put a solid object where the robot stands is refused, with what to change.

## Examples

| Case | Robots | Passes when |
|---|---|---|
| **Touch the Dots** | An arm | The end effector touches each dot in order, holding 0.2 s on each |
| **Reach the Flag** | Wheels or legs | The base stops within 160 mm of the flag for 0.3 s |

Touch the Dots gives 0.5 s plus 1.8 s per dot. Reach the Flag gives 8 s on wheels and 14 s on legs.

## How a try is judged

1. Each Case measures distances, called probes, such as from the base to the spot, in millimetres.
2. Basecase reads every probe at every frame of the recorded try, 50 times a second.
3. The contract's success rule and failure rules read those readings.
4. The try passes when the success rule holds and no failure rule fires.

A success rule is built from a few parts:

| Part | Holds when |
|---|---|
| `eventually` | Its condition is true at some moment in the window |
| `always` | Its condition is true throughout the window |
| `hold_for` | Its condition stays true for a set number of seconds |
| `sequence` | Its steps hold one after another, in order |
| `all`, `any` | All, or any, of its parts hold |

A window is the whole try, a span such as 2 to 5 s, or the last few seconds.

## Margins

Every condition also gives a margin: how far inside its bar the reading was, in units of the bar. Only a margin above 0 passes, so a reading exactly on the bar misses. Results list tries from the lowest margin up.

## When a contract refuses

The contract never passes by default. A reading that isn't a number counts against the success rule and sets off every failure rule. A contract is refused outright when it reads a probe that doesn't exist or nests deeper than 64 levels. So is one that judges success on the final moment alone.

## Scaling to another arm

A Case written on one arm runs on another by scaling its world to the new arm's reach, measured from its shoulder. Every distance in the contract scales with it; angles don't. Skills are judged by the same contract code, in [Arena](/help/arena).
