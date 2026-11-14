---
title: Make a Case
date: 2026-11-13
updated: 2026-11-14
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
  - src/components/cases/CaseRow.tsx
  - src/workspace/useCaseNames.ts
  - src/cases/caseBuilder.ts
  - src/cases/caseGoals.ts
  - src/cases/caseWorlds.ts
  - src/workspace/caseCommands.tsx
  - src/workspace/useCaseBuilder.ts
  - src/workspace/agentCaseRequests.ts
  - electron/cad-agent-prompt.mjs
---

You can make a Case for the robot in your scene. Choose a goal and a world, set the distances and the time limit, and Basecase opens the Case, ready to try.

Before you start, make sure the scene has a robot with joints. To learn what a Case is for, see [Cases](/help/cases).

1. Click **Play** in the view rail on the left.
2. Click **Cases** at the top of the panel.

![The Cases tab with New Case and Ask the Agent](/help/make-a-case/cases.png)

3. Click **New Case**.
4. Under **Goal**, choose what the robot must do. The list shows only the goals this robot can try. If there's only one, Basecase hides **Goal**.
5. Under **World**, choose **Open Floor**, a world with something in the way, or ground to cross ([rough ground, steps or a slope](/help/test-a-robot-on-rough-ground-steps-or-a-slope)). If you dropped a [scanned room](/help/import-a-scanned-room) or a [3D world](/help/import-a-captured-3d-world) on the canvas, it appears in this list as well.
6. Set the goal's numbers, such as **Distance**, **Radius** and **Time**. For **Touch a Point**, set **Dots** to 2 or 3 to have the robot touch that many dots in order. Basecase names that Case Touch the Dots. In a [scanned room](/help/import-a-scanned-room), use **Spot** to send the robot to a door or a piece of furniture.
7. Check the line under the fields, which shows the Case's brief. If the numbers can't work, it tells you what to change.

![New Case on an arm with Dots set to 3](/help/make-a-case/new-case.png)

8. Click **Make Case**.

![Touch the Dots open in the Simulate tab](/help/make-a-case/opened.png)

Basecase opens the Case in the **Simulate** tab and shows its world on the canvas. Next, [try the Case](/help/try-a-case).

**Tip:** **New Case** is also in [[⌘K]]. The card opens with the focus on **Make Case**, so if you haven't clicked a field, you can press [[↩]] to make the Case.

## Describe a Case in words

Under **New Case**, click **Ask the Agent** to put `/case` in the agent's box. Type the goal after it, such as "push the box to the wall in under 10 seconds", then send it. The agent builds the Case with the same builder as **New Case** and opens it.

**Note:** **Ask the Agent** needs the desktop app.

You can also tell the agent what you want to do with a robot, such as "drive this rover with a gamepad while I watch its front camera". If the scene has no robot, the agent imports the one you name. Then it makes a Case with the input and camera panels you asked for and opens it running, as in [Run a Case](/help/run-a-case).

For inputs, you can pick keys, a gamepad, a phone, the computer's camera, your hand or face, MIDI, or voice. If you name a different input, such as a leader arm, the agent tells you and uses keys instead.

To have the Case react to a movement, such as a wave, name it. The agent sets it up as a gesture you make at the camera. If the gesture isn't built in, the agent asks you to teach it, as in [Teach a robot a gesture](/help/teach-a-robot-a-gesture).

If you ask for a control the panels don't have, such as a joystick or a piano, the agent draws it as a code panel. While the Case runs, you can ask for a change in the **Agent** tab, and the agent rewrites that panel in place. For the steps, see [Build a Case app with the agent](/help/build-a-case-app-with-the-agent).

## Rename or delete a Case

Basecase names a new Case after its goal and world, such as Touch the Dots. To rename a Case, right-click it in the **Cases** tab and choose **Rename**. Type the new name and press [[↩]]. To keep the old name, press [[Esc]]. Or choose **Rename Case** in [[⌘K]] to rename the open Case.

![A Case named Touch Three Dots in its rename field in the Cases tab](/help/make-a-case/rename.png)

To delete a Case, right-click it and choose **Delete**. Basecase asks you first, because deleting a Case also deletes its tries.

To run the open Case on the robot in another open scene, choose **Compare With** in the Case's menu. See [Compare two robots on a Case](/help/compare-two-robots-on-a-case). If the robot is wheeled or legged, the same menu has **Export Case Mat**, which saves the Case as a floor mat you can print. To use the mat, see [Try a Case on your real robot](/help/try-a-case-on-your-real-robot).

For the full list of goals, worlds and numbers, see [Case goals, worlds and contracts](/help/case-goals-worlds-and-contracts).
