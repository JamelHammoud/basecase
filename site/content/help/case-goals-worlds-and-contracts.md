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
  - rough ground
  - steps
  - slope
  - touch a point
related:
  - make-a-case
  - arena
covers:
  - src/cases/caseGoals.ts
  - src/cases/goalDefaults.ts
  - src/cases/caseWorlds.ts
  - src/cases/caseBuilder.ts
  - src/cases/dotSpots.ts
  - src/cases/pickGoal.ts
  - src/cases/handoffGoal.ts
  - src/cases/roomWorld.ts
  - src/cases/roomTargets.ts
  - src/cases/roomJitter.ts
  - src/cases/namedSpots.ts
  - src/cases/terrain.ts
  - src/cases/contract.ts
  - src/cases/scale.ts
  - src/skills/contract.ts
  - forge/crates/contract/
---

Every Case pairs a goal with a world. Each goal takes a few numbers you set in the Case builder, and a contract decides whether each try passed or missed.

## Goals

| Goal | Robots | Numbers | Passes when |
|---|---|---|---|
| **Reach a Spot** | Wheels or legs | **Distance** (or **Spot** in a room), **Radius**, **Time** | The base stays within **Radius** of the spot for 0.3 s |
| **Push a Box** | Wheels or legs | **Push**, **Box**, **Radius**, **Time** | The box stays within **Radius** of the spot for 0.3 s |
| **Follow a Path** | Wheels or legs | **Spots**, **Spacing**, **Radius**, **Time**, plus a **Spot** for each one in a room | The base reaches each spot in order, staying within **Radius** for 0.2 s |
| **Walk Without Falling** | Legs | **Distance**, **Time** | The base gets more than **Distance** from where it started |
| **Touch a Point** | An arm | **Dots**, **Distance**, **Height**, **Radius**, **Time** | The end effector stays within **Radius** of the point for 0.2 s |
| **Pick Up a Block** | An arm with a gripper | **Distance**, **Spacing**, **Radius**, **Time** | The block lifts by half its size, then ends within **Radius** of the spot for 0.3 s |
| **Hand Off to a Spot** | Two arms | **Distance**, **Height**, **Radius**, **Time** | One arm holds the point for 0.2 s, then the other holds it alone for 0.2 s |

On a robot with legs, these goals also fail if the robot falls. A fall is when its base drops below half its starting height.

If you set **Dots** to 2 or 3, Touch a Point becomes Touch the Dots. The end effector has to touch each dot in order and hold 0.2 s on each one.

The builder starts each number at a default sized to your robot. Each number stays within these limits:

| Number | Range |
|---|---|
| **Distance** | 0 to 5,000 mm (at least 100 mm for Walk Without Falling) |
| **Dots** | 1 to 3 |
| **Height** | 0 to 2,000 mm |
| **Radius** | 5 to 1,000 mm |
| **Push** | 100 to 5,000 mm |
| **Box** | 40 to 600 mm |
| **Spots** | 2 to 8 |
| **Spacing** | 200 to 3,000 mm (from 50 mm for Pick Up a Block) |
| **Time** | 2 to 120 s |
| **Height** on Rough Ground or Steps | 2 to 500 mm |
| **Incline** on Slope | 2 to 40° |

## Worlds

| World | Goals | What's in it |
|---|---|---|
| **Open Floor** | All | Nothing but the floor |
| **Corridor** | Wheels and legs | A wall on each side of the route |
| **Block** | Wheels and legs | A block in the way. Tries get 5 s more on wheels and 8 s on legs |
| **Rough Ground** | Reach a Spot, Follow a Path, Walk Without Falling | A grid of tiles up to **Height** tall. Tries get 5 s more on wheels and 8 s on legs |
| **Steps** | Reach a Spot, Follow a Path, Walk Without Falling | A platform **Height** tall to climb onto and step off. Tries get the same extra time |
| **Slope** | Reach a Spot, Follow a Path, Walk Without Falling | A ramp up at **Incline**, a flat top and a ramp down. Tries get the same extra time |
| **Shelf** | Touch a Point | A box under the point |
| A room you imported | Reach a Spot, Push a Box and Follow a Path, plus Touch a Point when a table is in reach | The room's largest walls and furniture, at true size |

Rough Ground, Steps and Slope start their number at a value sized to the robot's legs or wheels. For the steps, see [Test a robot on rough ground, steps or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope).

In a room, the robot starts where the scan marked it, turned to the nearest quarter turn of the marked heading. If there's no mark, or the robot doesn't fit where it's marked, it starts on the open floor nearest the middle of the room.

A spot in a room can also be a door or a piece of furniture, which you pick by name. A furniture spot sits on the open floor in front of it, and a door's spot sits in the doorway. **Under Table** is only offered to a robot shorter than the table's underside. With a named spot, **Time** grows with the trip: 100 mm a second on wheels and 60 on legs, up to 120 s.

Each run in Checks moves the room's fixed furniture by up to 50 mm and turns it up to 5°. Where RoomPlan was less sure, that goes up to 100 mm and 10°. Walls and doors never move. For the steps, see [Import a scanned room as a Case world](/help/import-a-scanned-room).

A Case is named after its goal and world, such as "Push a Box in a Corridor". You can [rename it](/help/make-a-case#rename-or-delete-a-case) from its right-click menu. If a world would put a solid object where the robot stands, Basecase refuses it and tells you what to change.

## How a try is judged

1. Each Case has probes, which measure distances in millimeters, such as from the base to the spot.
2. Basecase reads every probe at every frame of the recorded try, 50 times a second.
3. The contract's success rule and failure rules read those readings.
4. The try passes when the success rule holds and no failure rule fires.

A Case made by **Replay in Sim** reads torque instead. For each frame, it takes the highest joint torque as a share of the most its servo can push.

A success rule is built from a few parts:

| Part | Holds when |
|---|---|
| `eventually` | Its condition is true at some moment in the window |
| `always` | Its condition is true throughout the window |
| `hold_for` | Its condition stays true for a set number of seconds |
| `sequence` | Its steps hold one after another, in order |
| `all`, `any` | All, or any, of its parts hold |

A window can be the whole try, a span such as 2 to 5 s, or the last few seconds.

## Margins

Every condition also gives a margin, which is how far inside its bar the reading was, in units of the bar. Only a margin above 0 passes, so a reading exactly on the bar is a miss. Results list tries starting from the lowest margin.

## When a contract refuses

The contract never passes by default. A reading that isn't a number counts against the success rule and sets off every failure rule.

Basecase refuses a contract that reads a probe that doesn't exist or nests deeper than 64 levels. It also refuses one that judges success on the final moment alone.

## Scaling to another arm

A Case written for one arm can run on another. Basecase scales its world to the new arm's reach, measured from its shoulder. Every distance in the contract scales with it, but angles don't. Any position the Case's code gives a movable object scales the same way, so a lit spot lands on the scaled spot.

The same contract code judges Skills. Learn more in [Arena](/help/arena).
