---
title: Compare two robots on a Case
date: 2026-11-13
collection: simulate-and-train
type: task
order: 12
keywords:
  - compare
  - versus
  - which is better
  - pass rate
  - gripper
  - servo
  - design options
  - compare_case
related:
  - cases
  - get-a-robot-ready-to-build
covers:
  - src/cases/caseCompare.ts
  - src/workspace/useCaseCompare.ts
  - src/workspace/caseChecks.ts
  - src/components/simulate/CompareRows.tsx
  - src/components/cases/CasesPanel.tsx
  - src/workspace/caseCommands.tsx
---

Run one Case on two versions of a robot, each in its own tab, and see which passes more often, what it costs and what it weighs.

Both scenes must be open in tabs. The other robot must fit the Case, and the Case must have one robot. [Cases](/help/cases) explains what a Case is for.

1. Right-click the scene's tab and choose **Duplicate**.
2. In the copy, change what you want to compare, such as the gripper or a servo.
3. Click the first scene's tab.
4. Click **Play** in the view rail on the left.
5. Click **Cases** at the top of the panel.
6. Click the Case to open it in the **Simulate** tab.
7. Right-click the Case and choose **Compare With**, then the copy's name.

![The Case's menu in the Cases list, with Compare With open on Rover copy](/help/compare-two-robots-on-a-case/menu.png)

8. Read the two rows at the top of **Results** in the **Simulate** tab.

![Results with Rover passing 20 of 20 in blue and Rover copy passing 0 of 20](/help/compare-two-robots-on-a-case/results.png)

Each row shows the scene's name and how many of 20 runs passed. The higher count is blue, and a tie marks neither. A robot that can't run the Case, such as one that falls while standing, shows why in place of the count. Under the name are the estimated cost of the parts and the robot's weight. Cost is the **Bill of materials** estimate without support filament, and weight is the **Weight** check's. Parts you own cost $0 there, as [Count the parts you already own](/help/count-the-parts-you-already-own) explains.

Both robots run the same 20 runs. Each run changes friction, weight, servo strength and servo delay a little, and moves anything that can be pushed up to 15 mm. The Case is scaled to each robot's reach, as it is when you try it. A robot with a skill kept for the Case by **Train from Tries** runs that skill, as its row in **Checks** does.

Click the copy's row to open its tab with the Case. If the copy doesn't have the Case, it's added there.

You can also press [[⌘K]] and choose **Compare with** followed by the scene's name. Ask the agent which version is better and it runs the same comparison.

Nothing is saved. Change either robot and the rows update, the next time the first scene is in front.

[Get a robot ready to build](/help/get-a-robot-ready-to-build) shows the same 20 runs as a row in **Checks**.
