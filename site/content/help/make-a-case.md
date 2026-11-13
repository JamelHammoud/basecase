---
title: Make a Case
date: 2026-11-13
updated: 2026-11-13
collection: simulate-and-train
type: task
order: 3
keywords:
  - new case
  - create case
  - challenge
  - goal
  - world
  - /case
related:
  - cases
  - try-a-case
covers:
  - src/components/cases/CasesPanel.tsx
  - src/components/cases/NewCaseCard.tsx
  - src/cases/caseBuilder.ts
  - src/cases/caseGoals.ts
  - src/cases/caseWorlds.ts
  - src/workspace/caseCommands.tsx
  - src/workspace/useCaseBuilder.ts
  - src/workspace/agentCaseRequests.ts
  - electron/cad-agent-prompt.mjs
---

Choose a goal and a world for the robot in this scene, set its distances and time limit, and open it ready to try.

The scene must have a robot with joints. [Cases](/help/cases) explains what a Case is for.

1. Click **Play** in the view rail on the left.
2. Click **Cases** at the top of the panel.
3. Click **New Case**.
4. Under **Goal**, choose what the robot must do. It lists only the goals this robot can try, and is hidden when there's one.
5. Under **World**, choose **Open Floor**, or a world with something in the way.
6. Set the goal's numbers, such as **Distance**, **Radius** and **Time**.
7. Read the line under the fields. It's the Case's brief, or what to change when the numbers can't work.
8. Click **Create**.

The Case opens in the **Simulate** tab, and its world appears on the canvas. Next, [try the Case](/help/try-a-case).

**New Case** is also in [[⌘K]], and [[↩]] creates the Case from the **Name** field. To start from a ready-made Case instead, click one under **Examples**.

## Describe a Case in words

**Ask the Agent**, under **New Case**, puts `/case` in the agent's box. Write the goal after it, such as "push the box to the wall in under 10 seconds", and send it. The agent builds the Case through the same builder and opens it. **Ask the Agent** is in the desktop app only.

## Ask for a Case app

The agent can build a Case with its own layout and run it in the whole window. It works in the desktop app only.

1. Click **Agent** at the top of the right panel.
2. Describe what you want to do with the robot, such as "drive this rover with a gamepad while I watch its front camera", and press [[↩]]. With no robot in the scene, the agent imports the one you name first.
3. When **Run Case** opens, drive the robot with the input you named, as in [Run a Case](/help/run-a-case).

![The agent's Case app running: Front Camera on the left, the rover in the middle, Map and Speed on the right](/help/make-a-case/case-app.png)

Keys, a gamepad and a phone are the inputs today. Name another, such as your Mac's camera or MIDI, and the agent says so and uses the keys.

## Name or delete a Case

The **Name** field sets the name before you click **Create**. To delete a Case, right-click it under **In this scene** and choose **Delete**. Its tries go with it, so Basecase asks first.

Every goal, world and number is listed in [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
