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

To teach a robot a skill, describe what you want it to do in your own words, then approve the agent's test for it. Basecase trains the skill until it passes Arena.

Teaching runs in the desktop app, with Claude, Codex or Gemini connected as the agent. You write the goal yourself, and it can be any goal the simulation can judge. Basecase has no task list to choose from.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, type the goal into **Teach it to**, such as "walk to the box".
3. Click **Teach**. The **Agent** tab opens with `/train` and your goal.
4. Read the contract the agent shows you. It lists what passes and what fails, plus a run where the robot holds still, which must fail.
5. Reply to the agent to approve the contract, or tell it what to change.
6. Follow the trainer's progress in the skill's row under **Train**. The robot on the canvas runs the newest snapshot of the skill.
7. When the row shows its Arena line, such as "31 of 32 tries, at least 86%", click **Try**. The skill runs in the simulation, on the canvas.

You can also skip the panel and type `/train` with the goal into the agent's box. To stop training, click **Stop training** (■) on the skill's row. To learn more about snapshots, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).

You can use a ready skill as a step in a Routine. For details, see [Build a Routine](/help/build-a-routine).

To share a skill, right-click its row and choose **Publish to Hugging Face**. Learn more in [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

You can train Stand, Walk, Get up and Settle without describing them in words. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit). Once one of them is ready, you can coach how it moves in words. Learn how in [Coach how a ready skill moves](/help/coach-a-skill).

## How Basecase trains it

Basecase starts with the cheapest method that could work. A reach to a point needs no training, because Basecase plans it with inverse kinematics. To walk somewhere, the robot needs a policy, so Basecase trains one with reinforcement learning and tries several rewards until one passes. Whichever method Basecase uses, a skill doesn't count until it passes [Arena](/help/arena).

## When nothing passes

The agent tells you what each method tried. If a design change would make the skill possible, the agent names it, such as servos twice as strong or links 20% longer. Change the design, then type the goal into **Teach it to** again.

## When the design changes

A skill belongs to the design you trained it on. Changing a color or a name leaves the skill ready. After a change to a mass or a size, the skill's row shows **Recheck**, and after a change to a joint, it shows **Train**. Click either button to send your description back to the agent.
