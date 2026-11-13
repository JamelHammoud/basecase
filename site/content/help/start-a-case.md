---
title: Start a Case
date: 2026-11-13
collection: simulate-and-train
type: task
covers:
  - src/components/cases/CasesPanel.tsx
  - src/components/cases/NewCaseCard.tsx
  - src/cases/caseGoals.ts
  - src/cases/caseBuilder.ts
---

A Case is a goal your robot tries in simulation, like touching a dot or reaching a spot, scored the same way every time.

1. Open the Play view in the sidebar and choose the **Cases** tab.

![The Cases tab with New Case and Ask the Agent](/help/start-a-case/cases.png)

2. Click **New Case**.
3. Pick a **Goal**. Only the goals your robot can try are listed: wheels or legs get Reach a Spot, Push a Box and Follow a Path, and legs also get Walk Without Falling. An arm has one goal, Touch a Point, so the list doesn't show.
4. Pick a **World**, such as Open Floor, Corridor, Block or Shelf.
5. Set the numbers. For Touch a Point, set **Dots** to 2 or 3 to touch that many dots in order; the Case is then called Touch the Dots. The line under the fields shows the Case's brief, or what to change when the numbers can't work.

![New Case on an arm with Dots set to 3](/help/start-a-case/new-case.png)

6. Click **Create**. The Case opens in the Simulate tab, with its dots or spots in the scene.

![Touch the Dots open in the Simulate tab](/help/start-a-case/opened.png)

To describe a Case in your own words instead, click **Ask the Agent** under New Case and type what the robot should do after `/case`. Cases you've made are listed under New Case; right-click one to delete it.
