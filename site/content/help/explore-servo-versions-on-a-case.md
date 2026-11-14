---
title: Explore servo versions on a Case
date: 2026-11-13
collection: simulate-and-train
type: task
order: 13
keywords:
  - explore
  - which servo to buy
  - servo version
  - variant
  - gear ratio
  - supply voltage
  - C001
  - C044
  - C046
  - explore_case
related:
  - compare-two-robots-on-a-case
  - try-a-case
covers:
  - src/cases/explore.ts
  - src/cases/exploreDesigns.ts
  - src/cases/exploreSort.ts
  - src/workspace/useCaseExplore.ts
  - src/workspace/caseChecks.ts
  - src/components/simulate/ExploreRows.tsx
  - src/components/simulate/CaseSections.tsx
  - src/workspace/caseCommands.tsx
---

Explore runs a Case on every catalog version of your robot's servos and supply voltage. Then you can apply the one that passes for the least money.

Before you start, make sure the Case has one robot. At least one joint must use a catalog servo that comes in versions, such as the Feetech STS3215. To add a Case, see [Make a Case](/help/make-a-case).

1. Open the Case in the **Simulate** tab.
2. In the Case's header, click **Explore**.

![Results filling in while Explore runs, with Stop in the Case's header](/help/explore-servo-versions-on-a-case/exploring.png)

3. Wait for the rows in **Results** to finish. To end early, click **Stop** in the Case's header.
4. To sort the rows, click **Passes**, **Cost** or **Weight**.

![Results with ten designs of a three-joint arm, the scene's own row in blue](/help/explore-servo-versions-on-a-case/results.png)

5. Hover over the row you want, then click **Apply**.

![Apply on the Shoulder C044 row](/help/explore-servo-versions-on-a-case/apply.png)

You can also press [[⌘K]] and choose **Explore**. Or ask the agent which servo to buy, and it runs the same sweep.

Each row is one design. The row's name lists the joints whose servo changed and the version each one got, such as Shoulder C044. If the supply voltage changed, the name lists that too. The row named after your scene is the design as it was when you clicked **Explore**, and the row that matches the scene now is blue.

Explore runs the Case 8 times for every design, changing friction, weight, servo strength and servo delay by a small amount on each run. It rates each servo at the row's supply voltage, the same way the **Servo torque** check does. Cost is the **Bill of materials** estimate, and weight comes from the **Weight** check. Servos you own count as $0 in the bill of materials, so a version you already have can sort first. For the steps, see [Count the parts you already own](/help/count-the-parts-you-already-own).

Explore tries the design as it is first, then each version on every joint at once. After that it changes one joint at a time, then two joints at a time, and it stops at 64 designs. If a battery powers the robot, Explore keeps the battery's voltage. Versions of one servo have the same weight in the catalog, so weight doesn't change between rows.

**Apply** swaps the servos, and the power supply's voltage if it changed. The bill of materials, Checks and plates update to match. To undo the whole swap in one step, press [[⌘Z]].

**Note:** Nothing is saved. If you change anything other than the servos' versions, the rows go away.

To run a Case on a design that differs in more than its servos, see [Compare two robots on a Case](/help/compare-two-robots-on-a-case).
