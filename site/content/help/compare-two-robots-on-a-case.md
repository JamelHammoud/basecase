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

You can run one Case on two versions of a robot, each in its own tab, to see which one passes more often, what each one costs and what each one weighs.

Before you start, open both scenes in tabs. The other robot has to fit the Case, and the Case can have only one robot. To learn what a Case is for, see [Cases](/help/cases).

1. Right-click the scene's tab and choose **Duplicate**.
2. In the copy, change the thing you want to compare, such as the gripper or a servo.
3. Click the first scene's tab.
4. Click **Play** in the view rail on the left.
5. Click **Cases** at the top of the panel.
6. Click the Case to open it in the **Simulate** tab.
7. Right-click the Case and choose **Compare With**, then choose the copy's name.

![The Case's menu in the Cases list, with Compare With open on Rover copy](/help/compare-two-robots-on-a-case/menu.png)

8. Read the two rows at the top of **Results** in the **Simulate** tab.

![Results with Rover passing 20 of 20 in blue and Rover copy passing 0 of 20](/help/compare-two-robots-on-a-case/results.png)

Each row shows the scene's name and how many of the 20 runs passed. The higher count is blue, and a tie marks neither count. If a robot can't run the Case, for example because it falls while standing, its row shows the reason instead of a count.

Under the name, the row shows the estimated cost of the parts and the robot's weight. The cost is the **Bill of materials** estimate, not counting support filament, and parts you own count as $0 (see [Count the parts you already own](/help/count-the-parts-you-already-own)). The weight comes from the **Weight** check.

Both robots go through the same 20 runs. Each run changes friction, weight, servo strength and servo delay by a small amount, and moves anything pushable by up to 15 mm. Basecase scales the Case to each robot's reach, the same way it does when you try it. If a robot has a skill that **Train from Tries** kept for the Case, it runs that skill, as its row in **Checks** does.

To open the copy's tab with the Case, click the copy's row. If the copy doesn't have the Case, Basecase adds it there.

You can also press [[⌘K]] and choose **Compare with ⟨scene⟩**, where ⟨scene⟩ is the other scene's name. Or ask the agent which version is better, and it runs the same comparison.

Basecase doesn't save comparisons. If you change either robot, the rows update the next time the first scene is in front.

The same 20 runs also appear as a row in **Checks**. See [Get a robot ready to build](/help/get-a-robot-ready-to-build).
