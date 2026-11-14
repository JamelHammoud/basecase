---
title: Teach a robot a skill
date: 2026-11-13
updated: 2026-11-13
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

You can teach a skill in the desktop app when Claude, Codex or Gemini is connected as the agent. The robot can learn any goal that the simulation can judge, so there's no list of tasks to choose from.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, type the goal into **Teach it to**. For example, "walk to the box".
3. Click **Teach**. The **Agent** tab opens with `/train` and your goal.
4. Read the contract the agent shows you. It lists what passes, what fails, and a run where the robot holds still, which must fail.
5. Reply to approve the contract, or tell the agent what to change.
6. To follow the trainer's progress, watch the skill's row under **Train**. The robot on the canvas runs the newest snapshot of the skill.
7. When the row shows its Arena line, such as "31 of 32 tries, at least 86%", click **Try**. The skill runs in the simulation, on the canvas.

You can also type `/train` and your goal into the agent's box. To stop training, click **Stop training** (■) on the skill's row. To learn more about snapshots, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).

## How Basecase trains it

Basecase starts with the cheapest method that could work. For example, Basecase plans a reach to a point with inverse kinematics, so that skill needs no training. To walk somewhere, Basecase trains a policy with reinforcement learning and tries several rewards until one passes. Whatever the method, a skill counts once it passes [Arena](/help/arena).

## When nothing passes

The agent tells you what each method tried. If a change to the design would make the skill possible, the agent names it, such as servos twice as strong or links 20% longer. Make the change to your design, then teach the goal again in **Teach it to**.

## When the design changes

A skill belongs to the design Basecase trained it on. If you change a color or a name, the skill stays ready. If you change a mass or a size, the skill's row shows **Recheck**. If you change a joint, the row shows **Train**. Click either button to send your words back to the agent.

You can also use a ready skill as a step in a Routine. See [Build a Routine](/help/build-a-routine).

To share a skill, right-click its row and choose **Publish to Hugging Face**. Learn more in [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

Stand, Walk, Get up and Settle don't need words. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit). Once one of them is ready, you can use words to change how it moves. See [Coach how a ready skill moves](/help/coach-a-skill).
