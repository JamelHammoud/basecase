---
title: Teach a robot a skill
date: 2026-11-13
updated: 2026-11-14
collection: simulate-and-train
type: task
order: 7
keywords:
  - train
  - /train
  - reinforcement learning
  - rl
  - policy
  - reward
  - contract
  - learn
related:
  - arena
  - train-stand-and-walk-with-the-motor-kit
covers:
  - src/components/simulate/TrainSection.tsx
  - src/components/simulate/SkillsList.tsx
  - src/components/SimulatePanel.tsx
  - src/workspace/RightTabPanels.tsx
  - src/workspace/useSkills.ts
  - src/skills/teach.ts
  - src/skills/teachExamples.ts
  - src/skills/skillRows.ts
  - electron/cad-agent-prompt.mjs
---

Say what the robot should do in your own words, approve the agent's test for it, and Basecase trains it until it passes Arena.

Teaching runs in the desktop app, with Claude, Codex or Gemini connected as the agent. With Offline chosen, **Teach** shows a message instead. There's no list of tasks to pick from: the robot can be taught any goal it can be judged on in the simulation.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, type the goal into **Teach it to**, such as "walk to the box".
3. Click **Teach**. The **Agent** tab opens with `/train` and your goal.
4. Read the contract the agent shows: what passes, what fails, and a run where the robot holds still, which must fail.
5. Reply to approve the contract, or say what to change.
6. Watch the skill's row under **Train**, which shows the trainer's progress. The robot on the canvas runs the newest snapshot of the skill.
7. When the row shows its Arena line, such as "31 of 32 tries, at least 86%", click **Try**.

The skill runs in the simulation, on the canvas. You can also type `/train` and the goal straight into the agent's box. To stop training, click **Stop training** (■) on the row. [Watch a skill learn while it trains](/help/watch-a-skill-learn) explains the snapshots.

## How Basecase trains it

Basecase tries the cheapest method that could work first. A reach for a point is planned with inverse kinematics, with no training at all. Walking somewhere trains a policy by reinforcement learning, trying several rewards until one passes. Whatever the method, the skill counts only when it passes [Arena](/help/arena).

## When nothing passes

The agent says what each method tried. When a design change would make the skill possible, it names it, such as servos twice as strong or links 20% longer. Change the design, then teach the goal again in **Teach it to**.

## When the design changes

A skill belongs to the design it was trained on. A color or name change keeps it ready. A change to a mass or size shows **Recheck** on its row, and a change to a joint shows **Train**. Either button sends your words back to the agent.

A ready skill is also a step in a Routine; see [Build a Routine](/help/build-a-routine). To share it, right-click its row and choose **Publish to Hugging Face**; see [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

Stand, Walk, Get up and Settle don't need words; see [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit). Once one is ready, words can change how it moves; see [Coach how a ready skill moves](/help/coach-a-skill).
