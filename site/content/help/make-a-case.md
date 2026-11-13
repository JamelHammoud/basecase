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

![The Cases tab with New Case and Ask the Agent](/help/make-a-case/cases.png)

3. Click **New Case**.
4. Under **Goal**, choose what the robot must do. It lists only the goals this robot can try, and is hidden when there's one.
5. Under **World**, choose **Open Floor**, or a world with something in the way.
6. Set the goal's numbers, such as **Distance**, **Radius** and **Time**. For **Touch a Point**, set **Dots** to 2 or 3 to touch that many dots in order; the Case is then called Touch the Dots.
7. Read the line under the fields. It's the Case's brief, or what to change when the numbers can't work.

![New Case on an arm with Dots set to 3](/help/make-a-case/new-case.png)

8. Click **Make Case**.

![Touch the Dots open in the Simulate tab](/help/make-a-case/opened.png)

The Case opens in the **Simulate** tab, and its world appears on the canvas. Next, [try the Case](/help/try-a-case).

**New Case** is also in [[⌘K]], and [[↩]] makes the Case from the **Name** field. To start from a ready-made Case instead, click one under **Examples**.

## Describe a Case in words

**Ask the Agent**, under **New Case**, puts `/case` in the agent's box. Write the goal after it, such as "push the box to the wall in under 10 seconds", and send it. The agent builds the Case through the same builder and opens it. **Ask the Agent** is in the desktop app only.

You can also tell the agent what you want to do with a robot, such as "drive this rover with a gamepad while I watch its front camera". It imports the robot you name when the scene has none. It makes a Case with the input and camera panels you asked for, and opens it running, as in [Run a Case](/help/run-a-case). Inputs are keys, a gamepad, a phone and the computer's camera. When you name another, such as MIDI, the agent says so and uses keys. A control the panels don't have, such as a joystick or a piano, the agent draws as a code panel.

## Name or delete a Case

The **Name** field sets the name before you click **Make Case**. To delete a Case, right-click it in the **Cases** tab and choose **Delete**. Its tries go with it, so Basecase asks first.

The open Case's menu also has **Compare With**, which runs it on another open scene's robot. See [Compare two robots on a Case](/help/compare-two-robots-on-a-case).

Every goal, world and number is listed in [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
