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

Tell the robot what to do in your own words, then approve the agent's test for it. Basecase trains the skill until it passes Arena.

Teaching runs in the desktop app and needs Claude, Codex or Gemini connected as the agent. You can teach the robot any goal that the simulation can judge, without picking from a list of tasks.

1. Click **Simulate** at the top of the right panel.
2. Under **Train**, type the goal into **Teach it to**, such as "walk to the box".
3. Click **Teach**. The **Agent** tab opens with `/train` and your goal.
4. Read the contract the agent shows you. It lists what passes and what fails, including a run where the robot holds still, which must fail.
5. Reply to approve the contract, or tell the agent what to change.
6. To follow the trainer's progress, watch the skill's row under **Train**. The robot on the canvas runs the newest snapshot of the skill.
7. When the row shows its Arena line, such as "31 of 32 tries, at least 86%", click **Try**. The skill runs in the simulation, on the canvas.

You can also type `/train` and the goal in the agent's box. To stop training, click **Stop training** (■) on the skill's row. To learn more about snapshots, see [Watch a skill learn while it trains](/help/watch-a-skill-learn).

## How Basecase trains it

Basecase starts with the cheapest method that could work. For example, Basecase plans a reach to a point with inverse kinematics, so the reach needs no training. To walk somewhere, Basecase trains a policy with reinforcement learning and tries several rewards until one passes. With any method, a skill counts only once it passes [Arena](/help/arena).

## When nothing passes

The agent tells you what each method tried. If a change to the design would make the skill possible, such as servos twice as strong or links 20% longer, the agent names it. Change the design, then teach the goal again in **Teach it to**.

## When the design changes

Each skill belongs to the design Basecase trained it on. Changing a color or a name keeps the skill ready. After you change a mass or a size, its row shows **Recheck**, and after you change a joint, the row shows **Train**. Either button sends your words back to the agent.

A ready skill can also be a step in a Routine. See [Build a Routine](/help/build-a-routine).

To find the friction, payload, servo strength and delay where a ready skill stops passing, see [Stress-test a skill to find where it breaks](/help/stress-test-a-skill).

To share a skill, right-click its row and choose **Publish to Hugging Face**. Learn more in [Publish a skill to Hugging Face](/help/publish-a-skill-to-hugging-face).

You don't need words to teach Stand, Walk, Get up and Settle. See [Train Stand and Walk with the Motor Kit](/help/train-stand-and-walk-with-the-motor-kit). Once one of them is ready, you can use words to change how it moves. See [Coach how a ready skill moves](/help/coach-a-skill).
