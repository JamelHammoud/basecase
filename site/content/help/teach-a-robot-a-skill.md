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

Describe what you want the robot to do in your own words, then approve the test the agent writes for it. Basecase trains the skill until it passes Arena.

Teaching runs in the desktop app, with Claude, Codex or Gemini connected as the agent. With Offline chosen, **Teach** shows a message instead. You can teach the robot any goal it can be judged on in the simulation, so there's no list of tasks to pick from.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, type the goal into **Teach it to**, such as "walk to the box".
3. Click **Teach**. The **Agent** tab opens with `/train` and your goal.
4. Read the contract the agent shows you. It lists what passes, what fails, and a run where the robot holds still, which must fail.
5. Reply to approve the contract, or tell the agent what to change.
6. Follow the trainer's progress on the skill's row under **Train**. The robot on the canvas runs the newest snapshot of the skill.
7. When the row shows its Arena line, such as "31 of 32 tries, at least 86%", click **Try**. The skill runs in the simulation on the canvas.

You can also type `/train` and the goal in the agent's box. To stop training, click **Stop training** (■) on the skill's row. For more on snapshots, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).

## How Basecase trains it

Basecase starts with the cheapest method that could work. For a reach to a point, it plans the motion with inverse kinematics and trains nothing. To walk somewhere, it trains a policy with reinforcement learning and tries several rewards until one passes. Whatever the method, the skill has to pass [Arena](/help/arena) before it counts.

## When nothing passes

The agent reports what it tried with each method. If a change to the design would make the skill possible, the agent names it, such as servos twice as strong or links 20% longer. Make the change, then teach the goal again in **Teach it to**.

## When the design changes

A skill belongs to the design you trained it on. Changing a color or a name keeps the skill ready. After a change to a mass or a size, the skill's row shows **Recheck**, and after a change to a joint it shows **Train**. Either button sends your words back to the agent.

To use a ready skill as a step in a Routine, see [Build a Routine](/help/build-a-routine).

To share a skill, right-click its row and choose **Publish to Hugging Face**. [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face) has the full steps.

Stand, Walk, Get up and Settle train without words, as [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit) shows. Once one of them is ready, you can describe in words how it should move differently. [Coach how a ready skill moves](/help/coach-a-skill) explains how.
