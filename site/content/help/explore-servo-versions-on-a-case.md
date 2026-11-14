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

Run a Case on every catalog version of your robot's servos and supply voltage, then apply the one that passes for the least money.

The Case must have one robot. At least one joint must use a catalog servo that comes in versions, such as the Feetech STS3215. [Make a Case](/help/make-a-case) shows how to add one.

1. Open the Case in the **Simulate** tab.
2. In the Case's header, click **Explore**.

![Results filling in while Explore runs, with Stop in the Case's header](/help/explore-servo-versions-on-a-case/exploring.png)

3. Wait for the rows in **Results** to finish. Click **Stop** in the Case's header to end early.
4. Click **Passes**, **Cost** or **Weight** to sort the rows.

![Results with ten designs of a three-joint arm, the scene's own row in blue](/help/explore-servo-versions-on-a-case/results.png)

5. Hover the row you want, and click **Apply**.

![Apply on the Shoulder C044 row](/help/explore-servo-versions-on-a-case/apply.png)

You can also press [[⌘K]] and choose **Explore**. Ask the agent which servo to buy and it runs the same sweep.

Each row is one design. Its name lists the joints whose servo changed and the version they got, such as Shoulder C044, and the supply voltage when it changed. The row named after your scene is the design as it was when you clicked **Explore**. The row that matches the scene now is blue.

Every design runs the Case 8 times. Each run changes friction, weight, servo strength and servo delay a little. Each servo is rated at the row's supply voltage, as the **Servo torque** check rates it. Cost is the **Bill of materials** estimate, and weight is the **Weight** check's. Servos you own cost $0 there, so a version you have can sort first. [Count the parts you already own](/help/count-the-parts-you-already-own) has the steps.

Explore tries the design as it is first, then each version on every joint at once, then one joint at a time, then two. It stops at 64 designs. A robot powered by a battery keeps the battery's voltage. Versions of one servo weigh the same in the catalog, so weight doesn't change between rows.

**Apply** swaps the servos, and the power supply's voltage when it changed. The bill of materials, Checks and plates update. Press [[⌘Z]] to undo the whole swap in one step.

Nothing is saved. Change anything other than the servos' versions and the rows go away.

[Compare two robots on a Case](/help/compare-two-robots-on-a-case) runs a Case on a design that differs in more than its servos.
