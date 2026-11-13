---
title: Build a Routine
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 9
keywords:
  - routine
  - flowchart
  - behaviour
  - behavior
  - sequence
  - steps
  - /routine
  - behavior tree
related:
  - drive-a-robot-in-the-simulation
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/components/routines/RoutinesPanel.tsx
  - src/components/routines/RoutineHeader.tsx
  - src/components/routines/AddStepMenu.tsx
  - src/components/routines/StepPanel.tsx
  - src/components/routines/RoutineNode.tsx
  - src/routines/stepMenu.ts
  - src/routines/routineRun.ts
  - src/workspace/useRoutines.ts
  - src/workspace/routineCommands.tsx
---

Chain drives, turns, skills, speech and checks into a flowchart, then run it on the robot in the simulation and watch each step light up.

A Routine is the flowchart itself, saved with the scene. Basecase checks every step before it runs, so a Routine that can't run says why on the step at fault.

1. Click **Play** in the view rail.
2. Click **Routines** at the top of the panel.
3. Click **New Routine**. The flow starts with **Start**, which settles the robot.
4. Click **Add step** (+) in the header.
5. Choose a step, such as **Drive** under Move.
6. Click the new step, and set its fields under the flow, such as **Distance**, **Speed** and **Heading**.
7. Repeat steps 4 to 6 for each step you want.
8. If a step shows **Train**, click it and train the skill in the **Simulate** tab.
9. Click **Run**.

The robot runs the Routine in the simulation, and each step lights as it runs. **Run Routine** ([[⌘↩]]), **Add Step** and **New Routine** are also in [[⌘K]]. To describe a Routine in words instead, type `/routine` and what it should do in the agent's box.

## Steps you can add

| Group | Steps |
|---|---|
| Move | **Drive** (1 m ahead at 0.2 m/s), **Turn** (90° left), **Stop** |
| Skills | Each ready skill and trained move the robot has, then **Any Skill** to name one by hand |
| Talk | **Say**, **Ask** |
| Logic | **Wait** (1 s), **If** (sees a person), **Repeat** (a copy of the step above), **Together** |
| Senses | A check from a model, such as **See Person**, **See Objects** or **Obstacle Ahead** |

Every new step gets a time limit, and an empty path for when it times out or fails, which ends the Routine safely. A + on any line in the flow adds a step there. To move a step, drag it onto a +.

## Edit and delete

- Press [[⌫]] on a step to delete it at once, with Undo in the toast.
- Press [[⌘Z]] and [[⇧⌘Z]] to step back and forward through your edits.
- Click the Routine's name to switch Routines, rename this one or delete it. Deleting a Routine asks first.

## What the robot needs

**Drive**, **Turn** and **Stop** use the robot's **Walk** and **Settle** skills when it has them. Without them, a robot with four or more legs, or with wheels, uses the built-in gait from Drive. A robot with two legs needs a trained **Walk**, and an arm can't drive or turn.

A step that switches straight from one skill into another, such as Walk into a Wave, runs once the switch is proved. See [Prove a hand-off between skills](/help/prove-a-hand-off-between-skills).

When a step needs a part the robot lacks, a button above the flow adds one, such as **Add Camera** or **Add Speaker**.

## Limits

A run lasts as long as the Routine's worst case: each step's time limit plus 3 seconds, up to 60 seconds. Perception models don't run in Basecase. In the simulation, senses give stand-in answers instead of looking at the scene, and **Ask** takes its first answer.
